# Flujos del Sistema - Acción del Sur

Este documento explica en detalle cómo funciona el sistema "Acción del Sur" paso a paso, desde la acción de un usuario hasta la persistencia en blockchain y base de datos.

## Tabla de Contenidos

1. [Arquitectura General](#1-arquitectura-general)
2. [Entidades Básicas del Sistema](#2-entidades-básicas-del-sistema)
3. [Flujo de Creación de Centro](#3-flujo-de-creación-de-centro)
4. [Flujo Completo de Donaciones](#4-flujo-completo-de-donaciones)
5. [Flujo de Distribución/Entrega](#5-flujo-de-distribuciónentrega)
6. [Qué se Persiste Dónde](#6-qué-se-persiste-dónde)

---

## 1. Arquitectura General

El sistema sigue una arquitectura de **tres capas** con **doble persistencia**:

```
┌─────────────────┐
│   Frontend      │  React + Vite + Tailwind
│   (Browser)     │
└────────┬────────┘
         │ HTTP/REST API
         ▼
┌─────────────────┐
│   Backend       │  Node.js + Express + Sequelize
│   (Server)      │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌──────┐  ┌──────────┐
│ MySQL│  │ Stellar  │
│  DB  │  │Blockchain│
└──────┘  └──────────┘
```

### Componentes Principales

**Frontend** (`/frontend`):
- Interfaz de usuario para operadores y administradores
- Realiza peticiones HTTP al backend vía Axios
- No interactúa directamente con blockchain

**Backend** (`/backend`):
- API REST que expone endpoints para todas las operaciones
- Contiene la lógica de negocio
- Orquesta transacciones de base de datos y blockchain
- Implementa "graceful degradation": si blockchain falla, continúa operando con DB

**Blockchain** (Stellar + Soroban):
- Smart contracts para trazabilidad inmutable
- Tres tipos de contratos:
  - **Contrato de Donaciones**: Registra tokens de donación
  - **Contrato de Entregas**: Registra distribuciones verificadas
  - **Contrato de Centro**: Una instancia por centro (gestiona inventario on-chain)

---

## 2. Entidades Básicas del Sistema

### 2.1 Jerarquía de Datos

```
User (Operador)
  └─> Center (Centro de Distribución)
       ├─> Category (Categoría de Ítem)
       │    └─> Item (Ítem de Inventario)
       │         └─> Donation (Donación recibida)
       │         └─> Distribution (Entrega a destinatario)
       └─> AuditAccessLog (Registro de auditoría)
```

### 2.2 Modelos Principales

#### User (`/backend/src/models/User.js`)
Representa un operador del sistema.
- **Campos**: id, username, password_hash, role, is_active
- **Persistencia**: Solo en base de datos MySQL
- **Blockchain**: No se registra en blockchain

#### Category (`/backend/src/models/Category.js`)
Categorías para clasificar ítems (ej: "Ropa", "Alimentos").
- **Campos**: id, name, description, is_active
- **Persistencia**: Solo en base de datos MySQL
- **Blockchain**: No se registra en blockchain

#### Item (`/backend/src/models/Item.js`)
Representa un tipo de ítem en el inventario.
- **Campos**:
  - id, category_id, name, quantity, attributes (JSON), image_url
  - **Campos blockchain**: blockchain_hash, blockchain_tx_id, token_status
- **Persistencia**:
  - **MySQL**: Todos los campos del ítem
  - **Blockchain**: Solo cuando se crea una donación, se genera un token

#### Center (`/backend/src/models/Center.js`)
Centro de distribución de ayuda.
- **Campos**:
  - id, name, latitude, longitude, geo_hash
  - **Campos blockchain**: blockchain_contract_id, blockchain_deploy_tx, blockchain_init_tx
- **Persistencia**:
  - **MySQL**: Registro completo del centro
  - **Blockchain**: Se despliega un smart contract único para cada centro

---

## 3. Flujo de Creación de Centro

El flujo de creación de un centro es el primer paso fundamental, ya que establece la infraestructura blockchain para todas las operaciones futuras.

### 3.1 Acción del Usuario

**Paso 1**: El operador accede a la página de creación de centros en el frontend:
```
URL: /centers/create
```

**Paso 2**: Completa el formulario con:
- `name`: Nombre del centro (ej: "Centro de Distribución Norte")
- `latitude`: Coordenada latitud (ej: -34.6037)
- `longitude`: Coordenada longitud (ej: -58.3816)

**Paso 3**: Presiona el botón "Crear Centro"

### 3.2 Petición HTTP al Backend

```
POST /api/centers
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "name": "Centro de Distribución Norte",
  "latitude": -34.6037,
  "longitude": -58.3816
}
```

**Middleware** (`/backend/src/middleware/auth.js`):
1. Verifica el JWT token
2. Extrae `req.user.id` (ID del operador autenticado)
3. Si es inválido, retorna 401

### 3.3 Procesamiento en el Backend

**Controlador**: `centerController.create` (`/backend/src/controllers/centerController.js:5`)

#### Paso 3.1: Validación
```javascript
if (!name || latitude == null || longitude == null) {
  return res.status(400).json({ error: 'Se requiere name, latitude y longitude' });
}
```

#### Paso 3.2: Cálculo del GeoHash
```javascript
const geoHash = crypto.createHash('sha256')
  .update(`${name}|${Number(latitude).toFixed(6)}|${Number(longitude).toFixed(6)}`)
  .digest('hex');
```

**Propósito**: El geoHash es un identificador criptográfico único que combina:
- Nombre del centro
- Coordenadas geográficas
- Permite verificar integridad de ubicación en blockchain

#### Paso 3.3: Persistencia en Base de Datos
```javascript
const center = await Center.create({
  name,
  latitude,
  longitude,
  geo_hash: geoHash,
  created_by: req.user.id,
});
```

**Qué se guarda en MySQL** (`centers` table):
| Campo | Valor | Ejemplo |
|-------|-------|---------|
| id | Auto-incremental | 1 |
| name | Nombre del centro | "Centro de Distribución Norte" |
| latitude | Coordenada | -34.6037000 |
| longitude | Coordenada | -58.3816000 |
| geo_hash | SHA256 hash | "a1b2c3d4..." |
| blockchain_contract_id | NULL (inicialmente) | NULL |
| blockchain_deploy_tx | NULL (inicialmente) | NULL |
| blockchain_init_tx | NULL (inicialmente) | NULL |
| is_active | Activo por defecto | true |
| created_by | ID del usuario operador | 5 |
| created_at | Timestamp actual | 2026-03-27 10:30:00 |

#### Paso 3.4: Deploy del Smart Contract en Blockchain

**Servicio**: `stellarService.deployCenterContract()` (`/backend/src/services/blockchain/stellarService.js:271`)

**Qué hace**:

1. **Prepara la transacción de deploy**:
```javascript
const salt = crypto.randomBytes(32);  // Salt aleatorio único
const wasmHashBuffer = Buffer.from(this.centroWasmHash, 'hex');

const tx = new StellarSdk.TransactionBuilder(account, {
  fee: '100000',
  networkPassphrase: this.passphrase,
})
  .setTimeout(30)
  .addOperation(StellarSdk.Operation.createCustomContract({
    address: new StellarSdk.Address(this.keypair.publicKey()),
    wasmHash: wasmHashBuffer,
    salt,  // Hace que cada contrato sea único
  }))
  .build();
```

2. **Simula la transacción**:
   - Stellar valida que la transacción es válida
   - Sin consumo de gas todavía
   - Si falla, se lanza error

3. **Prepara y firma**:
```javascript
const txPreparada = await this.rpc.prepareTransaction(tx);
txPreparada.sign(this.keypair);  // Firma con la clave privada del distribuidor
```

4. **Envía a la red Stellar**:
```javascript
const response = await this.rpc.sendTransaction(txPreparada);
```

5. **Polling para confirmación**:
   - Espera hasta 30 segundos por confirmación
   - Verifica el estado de la transacción en la blockchain
   - Retorna el transaction hash y el contract ID

**Resultado en Blockchain**:
- **Contract ID**: Identificador único del contrato (ej: "CDZYX...")
- **Transaction Hash**: Hash de la transacción de deploy (ej: "a1b2c3...")
- **Contrato desplegado**: Nueva instancia del contrato centro en Stellar

**Qué se guarda en Blockchain** (Smart Contract):
- **Estado inicial**: Vacío (sin inicializar)
- **Address**: Contract ID derivado de: SHA256(Network ID + Deployer Address + Salt + WASM Hash)
- **Código**: WASM bytecode del contrato centro

#### Paso 3.5: Inicialización del Contrato

**Servicio**: `stellarService.initializeCenter(contractId, {...})` (`/backend/src/services/blockchain/stellarService.js:352`)

**Qué hace**:

1. **Invoca la función `inicializar` del contrato**:
```javascript
const args = [
  StellarSdk.nativeToScVal(nombre, { type: 'string' }),
  StellarSdk.nativeToScVal(lat_e6, { type: 'i64' }),      // Latitud en microgrados
  StellarSdk.nativeToScVal(lng_e6, { type: 'i64' }),      // Longitud en microgrados
  this._hexToBytesScVal(geoHashHex),                      // GeoHash como bytes
];

const result = await this._invocarContrato(contractId, 'inicializar', args);
```

2. **Persiste en el storage del contrato**:
```rust
// En el contrato Soroban (Rust)
pub fn inicializar(env: Env, nombre: String, lat_e6: i64, lng_e6: i64, geo_hash: Bytes<32>) {
    // Verifica que el contrato no esté inicializado
    assert!(!env.storage().instance().has(&DataKey::Initialized), "already initialized");

    // Guarda datos del centro
    env.storage().instance().set(&DataKey::CenterName, &nombre);
    env.storage().instance().set(&DataKey::CenterLat, &lat_e6);
    env.storage().instance().set(&DataKey::CenterLng, &lng_e6);
    env.storage().instance().set(&DataKey::CenterGeoHash, &geo_hash);
    env.storage().instance().set(&DataKey::Initialized, &true);
}
```

**Qué se guarda en Blockchain** (Storage del Contrato):
| Key | Value | Tipo |
|-----|-------|------|
| CenterName | "Centro de Distribución Norte" | String |
| CenterLat | -34603700 | i64 (microgrados) |
| CenterLng | -58381600 | i64 (microgrados) |
| CenterGeoHash | 0xa1b2c3d4... | Bytes<32> |
| Initialized | true | Bool |
| Inventory | {} | Map<u64, u64> (vacío inicialmente) |

#### Paso 3.6: Actualización de Base de Datos

```javascript
await center.update({
  blockchain_contract_id: blockchainContractId,  // "CDZYX..."
  blockchain_deploy_tx: deployTx,                // "tx_deploy_abc..."
  blockchain_init_tx: initTx,                    // "tx_init_def..."
});
```

**Actualización en MySQL**:
| Campo | Valor |
|-------|-------|
| blockchain_contract_id | "CDZYX..." |
| blockchain_deploy_tx | "tx_deploy_abc..." |
| blockchain_init_tx | "tx_init_def..." |

### 3.4 Respuesta al Frontend

```json
{
  "id": 1,
  "name": "Centro de Distribución Norte",
  "latitude": -34.6037,
  "longitude": -58.3816,
  "geo_hash": "a1b2c3d4...",
  "blockchain_contract_id": "CDZYX...",
  "blockchain_deploy_tx": "tx_deploy_abc...",
  "blockchain_init_tx": "tx_init_def...",
  "is_active": true,
  "created_by": 5,
  "created_at": "2026-03-27T10:30:00.000Z",
  "createdBy": {
    "id": 5,
    "username": "operador1"
  }
}
```

**Status Code**: 201 Created

### 3.5 Graceful Degradation

Si blockchain falla en cualquier paso:
- El centro ya está guardado en MySQL
- El sistema continúa funcionando sin blockchain
- Los campos `blockchain_*` quedan en NULL
- Las operaciones futuras usarán solo base de datos

**Log de error**:
```javascript
console.error(`[Center] Error blockchain para centro "${name}":`, blockchainError.message);
```

---

## 4. Flujo Completo de Donaciones

El flujo de donaciones es el núcleo del sistema, donde un usuario registra la recepción de donaciones y se genera trazabilidad en blockchain.

### 4.1 Acción del Usuario

**Paso 1**: El operador accede a la página de donaciones:
```
URL: /donaciones/create
```

**Paso 2**: Completa el formulario:
- `category_id`: Categoría del ítem (ej: 1 = "Ropa")
- `attributes`: Atributos específicos JSON (ej: `{ "talla": "M", "color": "rojo" }`)
- `quantity`: Cantidad donada (ej: 50)
- `notes`: Notas opcionales (ej: "Donación de ropa de invierno")
- `center_name`: Nombre del centro donde se recibe (ej: "Centro Norte")
- `center_latitude`: Latitud del centro (ej: -34.6037)
- `center_longitude`: Longitud del centro (ej: -58.3816)
- `image` (opcional): Foto del ítem donado

**Paso 3**: Presiona "Registrar Donación"

### 4.2 Petición HTTP al Backend

```
POST /api/donations
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

category_id=1
&attributes={"talla":"M","color":"rojo"}
&quantity=50
&notes=Donación de ropa de invierno
&center_name=Centro Norte
&center_latitude=-34.6037
&center_longitude=-58.3816
&image=@foto.jpg
```

### 4.3 Procesamiento en el Backend

**Controlador**: `donationController.create` (`/backend/src/controllers/donationController.js:7`)

#### Paso 4.1: Inicio de Transacción de Base de Datos

```javascript
const t = await sequelize.transaction();
```

**Propósito**: Asegurar atomicidad. Todo se confirma junto, o nada se confirma.

#### Paso 4.2: Validación de Datos

```javascript
const errors = validationResult(req);
if (!errors.isEmpty()) {
  await t.rollback();
  return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
}
```

#### Paso 4.3: Cálculo del GeoHash del Centro

```javascript
const centerGeoHash = buildCenterGeoHash({
  centerName: center_name,
  latitude: center_latitude,
  longitude: center_longitude,
});
```

**Función**: `buildCenterGeoHash` (`/backend/src/utils/cryptoEvidence.js`)
```javascript
function buildCenterGeoHash({ centerName, latitude, longitude }) {
  const payload = `${centerName}|${Number(latitude).toFixed(6)}|${Number(longitude).toFixed(6)}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

**Resultado**: Hash SHA256 que identifica de forma única la ubicación del centro.
Ejemplo: `"f4e5d6c7b8a9..."`

#### Paso 4.4: Búsqueda o Creación del Ítem

**Lógica**: Si ya existe un ítem con la misma categoría y atributos, se reutiliza. Si no, se crea.

```javascript
// Buscar ítems de la misma categoría
const candidatos = await Item.findAll({
  where: { category_id, is_active: true },
  transaction: t,
});

// Ordenar atributos alfabéticamente para comparación consistente
const attrsStr = JSON.stringify(
  Object.keys(attributes || {}).sort().reduce((acc, k) => { acc[k] = attributes[k]; return acc; }, {})
);

// Buscar match exacto de atributos
let item = candidatos.find((c) => {
  const cStr = JSON.stringify(
    Object.keys(c.attributes || {}).sort().reduce((acc, k) => { acc[k] = c.attributes[k]; return acc; }, {})
  );
  return cStr === attrsStr;
}) || null;
```

**Ejemplo**:
- `attributes` recibido: `{ "color": "rojo", "talla": "M" }`
- `attrsStr` ordenado: `{"color":"rojo","talla":"M"}`
- Si existe ítem con estos atributos → se reutiliza
- Si no existe → se crea nuevo

#### Paso 4.5: Creación del Ítem (si no existe)

```javascript
if (!item) {
  const category = await Category.findByPk(category_id, { transaction: t });
  if (!category) {
    await t.rollback();
    return res.status(404).json({ error: 'Categoría no encontrada' });
  }

  // Generar nombre automático: "Ropa - M - rojo"
  const attrValues = Object.values(attributes || {}).filter(Boolean).join(' - ');
  const name = attrValues ? `${category.name} - ${attrValues}` : category.name;

  // Guardar imagen si se proporcionó
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  item = await Item.create(
    { category_id, name, quantity: 0, attributes, image_url },
    { transaction: t }
  );
}
```

**Qué se guarda en MySQL** (`items` table):
| Campo | Valor | Ejemplo |
|-------|-------|---------|
| id | Auto-incremental | 123 |
| category_id | ID de categoría | 1 |
| name | Nombre autogenerado | "Ropa - M - rojo" |
| quantity | Cantidad inicial | 0 |
| attributes | JSON de atributos | {"color":"rojo","talla":"M"} |
| image_url | URL de imagen | "/uploads/foto_abc123.jpg" |
| blockchain_hash | NULL (inicialmente) | NULL |
| blockchain_tx_id | NULL (inicialmente) | NULL |
| token_status | Estado del token | "pending" |
| is_active | Activo | true |
| created_at | Timestamp | 2026-03-27 11:00:00 |

#### Paso 4.6: Actualización del Stock

```javascript
await item.update({ quantity: item.quantity + parseInt(quantity) }, { transaction: t });
```

**Antes**: `quantity = 0`
**Después**: `quantity = 50`

#### Paso 4.7: Registro de la Donación

```javascript
const donation = await Donation.create(
  {
    item_id: item.id,
    quantity,
    notes,
    registered_by: req.user.id,
    center_name,
    center_latitude,
    center_longitude,
    center_geo_hash: centerGeoHash,
    status: 'pending',  // pending → anchored (si blockchain tiene éxito)
  },
  { transaction: t }
);
```

**Qué se guarda en MySQL** (`donations` table):
| Campo | Valor | Ejemplo |
|-------|-------|---------|
| id | Auto-incremental | 456 |
| item_id | ID del ítem | 123 |
| quantity | Cantidad donada | 50 |
| center_name | Nombre del centro | "Centro Norte" |
| center_latitude | Latitud | -34.6037000 |
| center_longitude | Longitud | -58.3816000 |
| center_geo_hash | Hash SHA256 | "f4e5d6c7b8a9..." |
| blockchain_hash | NULL (inicialmente) | NULL |
| blockchain_tx_id | NULL (inicialmente) | NULL |
| status | Estado inicial | "pending" |
| notes | Notas | "Donación de ropa de invierno" |
| registered_by | ID del operador | 5 |
| created_at | Timestamp | 2026-03-27 11:00:00 |

#### Paso 4.8: Commit de la Transacción

```javascript
await t.commit();
```

**Confirmación en MySQL**:
- ✅ Ítem creado o actualizado
- ✅ Stock incrementado
- ✅ Donación registrada

Todo está ahora persistido en base de datos.

### 4.4 Minteo del Token en Blockchain

Ahora que todo está en MySQL, se procede a registrar en blockchain.

**Servicio**: `stellarService.mintDonationToken({...})` (`/backend/src/services/blockchain/stellarService.js:83`)

#### Paso 4.9: Preparación de los Argumentos del Contrato

```javascript
const metadataScVal = StellarSdk.nativeToScVal(
  { categoria: item.category?.name || 'desconocida', nombre: item.name || '' },
  { type: 'map' }
);

const args = [
  StellarSdk.nativeToScVal(item.id, { type: 'u64' }),                              // item_id
  metadataScVal,                                                                     // metadata
  StellarSdk.nativeToScVal(donation.quantity, { type: 'u64' }),                     // quantity
  StellarSdk.nativeToScVal(this._scaleCoordinate(center_latitude), { type: 'i64' }), // center_lat
  StellarSdk.nativeToScVal(this._scaleCoordinate(center_longitude), { type: 'i64' }), // center_lng
  this._hexToBytesScVal(center_geo_hash),                                           // center_geo_hash
];
```

**Conversión de coordenadas**:
```javascript
_scaleCoordinate(value) {
  return Math.round(Number(value || 0) * 1_000_000);
}
// -34.6037 → -34603700 (microgrados)
```

#### Paso 4.10: Invocación del Contrato de Donaciones

```javascript
const result = await this._invocarContrato(
  this.donacionesContractId,
  'mint_token_donacion',
  args
);
```

**Función del Contrato** (Rust/Soroban):
```rust
pub fn mint_token_donacion(
    env: Env,
    item_id: u64,
    metadata: Map<Bytes, ScVal>,
    quantity: u64,
    center_lat: i64,
    center_lng: i64,
    center_geo_hash: Bytes<32>,
) -> Bytes<32> {
    // Verificar autorización (solo el distribuidor puede mintear)
    env.current_contract_address().require_auth_for_args(Args::new(
        env,
        [
            ScVal::U64(item_id),
            ScVal::U64(quantity),
        ]
    ));

    // Crear token ID único
    let token_id = Self::generate_token_id(env, item_id, quantity, center_lat, center_lng);

    // Crear estructura del token
    let token = Token {
        item_id,
        metadata,
        quantity,
        center_lat,
        center_lng,
        center_geo_hash,
        timestamp: env.ledger().timestamp(),
    };

    // Guardar en storage
    let token_key = DataKey::Token(token_id);
    env.storage().instance().set(&token_key, &token);

    // Emitir evento
    env.events().publish(
        (Symbol::new(&env, "token_minted"), token_id),
        (item_id, quantity)
    );

    token_id  // Retorna el token ID (Bytes<32>)
}
```

**Qué se guarda en Blockchain** (Storage del Contrato de Donaciones):
| Key | Value | Tipo |
|-----|-------|------|
| Token(token_id) | Token struct | Custom |
| ├── item_id | 123 | u64 |
| ├── metadata | {"categoria":"Ropa","nombre":"Ropa - M - rojo"} | Map |
| ├── quantity | 50 | u64 |
| ├── center_lat | -34603700 | i64 |
| ├── center_lng | -58381600 | i64 |
| ├── center_geo_hash | 0xf4e5d6c7b8a9... | Bytes<32> |
| └── timestamp | 1743097200 | u64 |

**Resultado de la transacción**:
```javascript
{
  hash: "abc123def456...",  // Token ID (32 bytes)
  txId: "tx_mint_789...",   // Transaction hash
  status: "minted"
}
```

#### Paso 4.11: Actualización de Base de Datos con Hash de Blockchain

```javascript
if (blockchainResult?.hash) {
  await item.update({
    blockchain_hash: blockchainResult.hash,      // "abc123def456..."
    blockchain_tx_id: blockchainResult.txId,     // "tx_mint_789..."
    token_status: 'minted',                      // "pending" → "minted"
  });

  await donation.update({
    blockchain_hash: blockchainResult.hash,      // "abc123def456..."
    blockchain_tx_id: blockchainResult.txId,     // "tx_mint_789..."
    status: 'anchored',                          // "pending" → "anchored"
  });
}
```

**Actualización en MySQL**:

**Tabla `items`**:
| Campo | Valor |
|-------|-------|
| blockchain_hash | "abc123def456..." |
| blockchain_tx_id | "tx_mint_789..." |
| token_status | "minted" |

**Tabla `donations`**:
| Campo | Valor |
|-------|-------|
| blockchain_hash | "abc123def456..." |
| blockchain_tx_id | "tx_mint_789..." |
| status | "anchored" |

### 4.5 Manejo de Errores (Graceful Degradation)

Si blockchain falla:

```javascript
} catch (blockchainError) {
  console.error('[Stellar] Error en minteo:', blockchainError.message);
  await item.update({ token_status: 'failed' }).catch(() => {});
  await donation.update({ status: 'failed' }).catch(() => {});
}
```

**Estado en MySQL**:
- `item.token_status = "failed"`
- `donation.status = "failed"`

**Pero**: La donación sigue registrada en MySQL con el stock actualizado.
**Impacto**: El sistema continúa funcionando, pero sin trazabilidad blockchain para esta donación.

### 4.6 Respuesta al Frontend

```json
{
  "id": 456,
  "item_id": 123,
  "quantity": 50,
  "center_name": "Centro Norte",
  "center_latitude": -34.6037,
  "center_longitude": -58.3816,
  "center_geo_hash": "f4e5d6c7b8a9...",
  "blockchain_hash": "abc123def456...",
  "blockchain_tx_id": "tx_mint_789...",
  "status": "anchored",
  "notes": "Donación de ropa de invierno",
  "created_at": "2026-03-27T11:00:00.000Z",
  "item": {
    "id": 123,
    "name": "Ropa - M - rojo",
    "quantity": 50,
    "category": {
      "id": 1,
      "name": "Ropa"
    }
  },
  "registeredBy": {
    "id": 5,
    "username": "operador1"
  }
}
```

**Status Code**: 201 Created

### 4.7 Resumen de Qué se Persiste Dónde

| Entidad | MySQL | Blockchain |
|---------|-------|------------|
| **Centro** | ✅ Registro completo | ✅ Smart Contract único |
| **Ítem** | ✅ Todos los datos | ✅ Token de donación |
| **Donación** | ✅ Registro completo | ✅ Token en contrato donaciones |
| **Stock** | ✅ `item.quantity` | ❌ No se replica |
| **Metadatos** | ✅ `item.attributes` | ✅ En token metadata |

---

## 5. Flujo de Distribución/Entrega

El flujo de distribución es el más complejo, involucrando múltiples pasos de verificación y captura de evidencia antes de registrar en blockchain.

### 5.1 Estados de una Distribución

```
draft → identified → signed → pending_anchor → anchored
  ↓         ↓          ↓           ↓              ↓
(borrador) (DNI)   (firma)   (listo para   (finalizado)
                                   blockchain)
```

### 5.2 Paso 1: Preparación (draft)

**Acción del usuario**:
```
POST /api/distributions/prepare
{
  "item_id": 123,
  "quantity": 10,
  "notes": "Entrega de ayuda",
  "center_name": "Centro Norte",
  "center_latitude": -34.6037,
  "center_longitude": -58.3816
}
```

**Backend** (`distributionController.prepare:36`):

1. **Valida stock disponible**:
```javascript
if (item.quantity < quantity) {
  return res.status(400).json({
    error: `Stock insuficiente. Disponible: ${item.quantity}, solicitado: ${quantity}`,
  });
}
```

2. **Genera nonce y expiración**:
```javascript
const nonce = crypto.randomBytes(16).toString('hex');  // "a1b2c3..."
const expiresAt = new Date(Date.now() + 10 * 60 * 1000);  // 10 minutos
```

3. **Crea distribución en estado draft**:
```javascript
const distribution = await Distribution.create({
  item_id,
  quantity,
  notes,
  nonce,
  expires_at: expiresAt,
  status: 'draft',
  registered_by: req.user.id,
  center_name,
  center_latitude,
  center_longitude,
  capture_ip: req.ip,
  capture_device: req.headers['user-agent'],
});
```

**Persistencia en MySQL** (`distributions`):
| Campo | Valor |
|-------|-------|
| id | 789 |
| item_id | 123 |
| quantity | 10 |
| status | "draft" |
| nonce | "a1b2c3..." |
| expires_at | 2026-03-27 11:10:00 |

### 5.3 Paso 2: Identificación del Destinatario (identified)

**Acción del usuario**:
```
POST /api/distributions/789/identify
{
  "receiver_identifier": "12345678",  // DNI
  "doc_type": "DNI"
}
```

**Backend** (`distributionController.identifyManual:87`):

1. **Valida estado y expiración**:
```javascript
if (distribution.status !== 'draft') {
  return res.status(409).json({ error: 'La distribución no está en estado draft' });
}
if (hasExpired(distribution)) {
  return res.status(409).json({ error: 'El borrador venció y debe recrearse' });
}
```

2. **Genera commitment criptográfico del destinatario**:
```javascript
const salt = generateSaltHex(16);  // "xyz789..."
const recipientCommitment = buildRecipientCommitment({
  docType: 'DNI',
  docNumber: '12345678',
  salt,
  distributionId: 789,
});
```

**Función `buildRecipientCommitment`** (`/backend/src/utils/cryptoEvidence.js`):
```javascript
function buildRecipientCommitment({ docType, docNumber, salt, distributionId }) {
  const payload = `${docType}|${docNumber}|${salt}|${distributionId}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

**Resultado**: Hash que identifica al destinatario sin revelar su DNI en blockchain.
Ejemplo: `"commit_abc123..."`

3. **Actualiza la distribución**:
```javascript
await distribution.update({
  receiver_identifier: '12345678',
  recipient_salt: 'xyz789...',
  identity_capture_method: 'manual',
  assurance_level: 'MANUAL_VERIFIED',
  recipient_commitment: 'commit_abc123...',
  status: 'identified',
});
```

**Persistencia en MySQL**:
| Campo | Valor |
|-------|-------|
| receiver_identifier | "12345678" |
| recipient_salt | "xyz789..." |
| identity_capture_method | "manual" |
| assurance_level | "MANUAL_VERIFIED" |
| recipient_commitment | "commit_abc123..." |
| status | "identified" |

### 5.4 Paso 3: Captura de Firma (signed)

**Acción del usuario**:
```
POST /api/distributions/789/sign
{
  "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "signature_mime": "image/png"
}
```

**Backend** (`distributionController.sign:136`):

1. **Valida estado**:
```javascript
if (distribution.status !== 'identified') {
  return res.status(409).json({ error: 'La identidad debe validarse antes de firmar' });
}
```

2. **Calcula hash de la firma**:
```javascript
const signatureHash = buildSignatureHash(signature_data);
```

**Función `buildSignatureHash`**:
```javascript
function buildSignatureHash(signatureData) {
  return crypto.createHash('sha256').update(signatureData).digest('hex');
}
```

**Resultado**: Hash de la imagen de firma.
Ejemplo: `"sig_hash_def456..."`

3. **Actualiza la distribución**:
```javascript
await distribution.update({
  signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
  signature_mime: 'image/png',
  signature_hash: 'sig_hash_def456...',
  status: 'signed',
});
```

**Persistencia en MySQL**:
| Campo | Valor |
|-------|-------|
| signature_data | "data:image/png;base64,..." (BLOB en TEXT) |
| signature_mime | "image/png" |
| signature_hash | "sig_hash_def456..." |
| status | "signed" |

### 5.5 Paso 4: Finalización y Anclaje en Blockchain (anchored)

**Acción del usuario**:
```
POST /api/distributions/789/finalize
```

**Backend** (`distributionController.finalize:175`):

#### Paso 5.1: Inicia transacción de DB
```javascript
const t = await sequelize.transaction();
```

#### Paso 5.2: Valida estado y stock
```javascript
const distribution = await Distribution.findByPk(789, {
  include: [{ model: Item, as: 'item' }],
  transaction: t,
  lock: t.LOCK.UPDATE,  // Bloquea fila para evitar race conditions
});

if (distribution.item.quantity < distribution.quantity) {
  await t.rollback();
  return res.status(400).json({ error: 'Stock insuficiente' });
}
```

#### Paso 5.3: Construye el recibo (receipt)
```javascript
const receiptPayload = {
  assurance_level: 'MANUAL_VERIFIED',
  distribution_id: 789,
  identity_capture_method: 'manual',
  item_id: 123,
  item_name: 'Ropa - M - rojo',
  notes: 'Entrega de ayuda',
  operator_id: 5,
  quantity: 10,
  recipient_commitment: 'commit_abc123...',
  signature_hash: 'sig_hash_def456...',
  center: {
    name: 'Centro Norte',
    latitude: -34.6037,
    longitude: -58.3816,
  },
  timestamp: new Date().toISOString(),
};
```

#### Paso 5.4: Calcula hash del recibo
```javascript
const receiptHash = buildReceiptHash(receiptPayload);
```

**Función `buildReceiptHash`**:
```javascript
function buildReceiptHash(receiptPayload) {
  const canonical = buildCanonicalReceipt(receiptPayload);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
```

**Resultado**: Hash que representa toda la evidencia de la entrega.
Ejemplo: `"receipt_ghi789..."`

#### Paso 5.5: Actualiza distribución con receipt
```javascript
await distribution.update({
  receipt_payload: JSON.parse(buildCanonicalReceipt(receiptPayload)),
  receipt_hash: 'receipt_ghi789...',
  status: 'pending_anchor',
}, { transaction: t });
```

#### Paso 5.6: Commit de transacción
```javascript
await t.commit();
```

**Persistencia en MySQL**:
| Campo | Valor |
|-------|-------|
| receipt_payload | JSON completo del recibo |
| receipt_hash | "receipt_ghi789..." |
| status | "pending_anchor" |

#### Paso 5.7: Registrar en Blockchain

**Servicio**: `stellarService.recordVerifiedDistribution({...})` (`/backend/src/services/blockchain/stellarService.js:127`)

```javascript
const blockchainResult = await stellarService.recordVerifiedDistribution({
  distribution_id: 789,
  item_id: 123,
  quantity: 10,
  recipient_commitment: 'commit_abc123...',
  signature_hash: 'sig_hash_def456...',
  receipt_hash: 'receipt_ghi789...',
  operator_id: 5,
  assurance_level: 'MANUAL_VERIFIED',
  center_latitude: -34.6037,
  center_longitude: -58.3816,
});
```

**Invocación del contrato**:
```javascript
const args = [
  StellarSdk.nativeToScVal(789, { type: 'u64' }),                      // distribution_id
  StellarSdk.nativeToScVal(123, { type: 'u64' }),                     // item_id
  StellarSdk.nativeToScVal(10, { type: 'u64' }),                      // quantity
  this._hexToBytesScVal('commit_abc123...'),                          // recipient_commitment
  this._hexToBytesScVal('sig_hash_def456...'),                        // signature_hash
  this._hexToBytesScVal('receipt_ghi789...'),                         // receipt_hash
  StellarSdk.nativeToScVal(5, { type: 'u64' }),                       // operator_id
  StellarSdk.nativeToScVal('MANUAL_VERIFIED', { type: 'string' }),    // assurance_level
  StellarSdk.nativeToScVal(-34603700, { type: 'i64' }),               // center_lat
  StellarSdk.nativeToScVal(-58381600, { type: 'i64' }),               // center_lng
];

const result = await this._invocarContrato(
  this.entregasContractId,
  'registrar_entrega_verificada',
  args
);
```

**Función del Contrato** (Rust/Soroban):
```rust
pub fn registrar_entrega_verificada(
    env: Env,
    distribution_id: u64,
    item_id: u64,
    quantity: u64,
    recipient_commitment: Bytes<32>,
    signature_hash: Bytes<32>,
    receipt_hash: Bytes<32>,
    operator_id: u64,
    assurance_level: String,
    center_lat: i64,
    center_lng: i64,
) {
    // Verificar autorización
    env.current_contract_address().require_auth();

    // Crear estructura de entrega
    let delivery = VerifiedDelivery {
        distribution_id,
        item_id,
        quantity,
        recipient_commitment,
        signature_hash,
        receipt_hash,
        operator_id,
        assurance_level,
        center_lat,
        center_lng,
        timestamp: env.ledger().timestamp(),
    };

    // Guardar en storage
    let key = DataKey::Delivery(distribution_id);
    env.storage().instance().set(&key, &delivery);

    // Emitir evento
    env.events().publish(
        (Symbol::new(&env, "delivery_registered"), distribution_id),
        (item_id, quantity)
    );
}
```

**Qué se guarda en Blockchain** (Storage del Contrato de Entregas):
| Key | Value | Tipo |
|-----|-------|------|
| Delivery(789) | VerifiedDelivery struct | Custom |
| ├── distribution_id | 789 | u64 |
| ├── item_id | 123 | u64 |
| ├── quantity | 10 | u64 |
| ├── recipient_commitment | 0xcommit_abc123... | Bytes<32> |
| ├── signature_hash | 0xsig_hash_def456... | Bytes<32> |
| ├── receipt_hash | 0xreceipt_ghi789... | Bytes<32> |
| ├── operator_id | 5 | u64 |
| ├── assurance_level | "MANUAL_VERIFIED" | String |
| ├── center_lat | -34603700 | i64 |
| ├── center_lng | -58381600 | i64 |
| └── timestamp | 1743097500 | u64 |

**Resultado de la transacción**:
```javascript
{
  hash: "delivery_xyz123...",  // Delivery hash
  txId: "tx_delivery_456...",   // Transaction hash
  status: "anchored"
}
```

#### Paso 5.8: Actualización final de stock y estado

```javascript
const successTx = await sequelize.transaction();
try {
  // Actualizar stock del ítem
  const item = await Item.findByPk(123, {
    transaction: successTx,
    lock: successTx.LOCK.UPDATE,
  });
  await item.update(
    { quantity: item.quantity - 10 },  // 50 → 40
    { transaction: successTx }
  );

  // Actualizar distribución
  await Distribution.update(
    {
      status: 'anchored',
      finalized_at: new Date(),
      blockchain_hash: 'delivery_xyz123...',
      blockchain_tx_id: 'tx_delivery_456...',
    },
    {
      where: { id: 789 },
      transaction: successTx,
    }
  );

  await successTx.commit();
} catch (closeError) {
  await successTx.rollback();
  await Distribution.update({ status: 'failed' }, { where: { id: 789 } });
  throw closeError;
}
```

**Actualización en MySQL**:

**Tabla `items`**:
| Campo | Valor |
|-------|-------|
| quantity | 40 (era 50) |

**Tabla `distributions`**:
| Campo | Valor |
|-------|-------|
| status | "anchored" |
| finalized_at | 2026-03-27 11:05:00 |
| blockchain_hash | "delivery_xyz123..." |
| blockchain_tx_id | "tx_delivery_456..." |

### 5.6 Respuesta Final al Frontend

```json
{
  "id": 789,
  "item_id": 123,
  "quantity": 10,
  "receiver_identifier": "12345678",
  "receiver_hash": null,
  "status": "anchored",
  "identity_capture_method": "manual",
  "assurance_level": "MANUAL_VERIFIED",
  "recipient_commitment": "commit_abc123...",
  "signature_hash": "sig_hash_def456...",
  "receipt_hash": "receipt_ghi789...",
  "blockchain_tx_id": "tx_delivery_456...",
  "finalized_at": "2026-03-27T11:05:00.000Z",
  "center_name": "Centro Norte",
  "center_latitude": -34.6037,
  "center_longitude": -58.3816,
  "notes": "Entrega de ayuda",
  "blockchain_hash": "delivery_xyz123...",
  "created_at": "2026-03-27T11:00:00.000Z",
  "item": {
    "id": 123,
    "name": "Ropa - M - rojo",
    "quantity": 40,
    "category": {
      "id": 1,
      "name": "Ropa"
    }
  },
  "registeredBy": {
    "id": 5,
    "username": "operador1"
  }
}
```

---

## 6. Qué se Persiste Dónde

### 6.1 Resumen por Entidad

| Entidad | MySQL (Base de Datos) | Blockchain (Stellar) |
|---------|----------------------|---------------------|
| **User** | ✅ Completo | ❌ No se registra |
| **Category** | ✅ Completo | ❌ No se registra |
| **Item** | ✅ Todos los campos | ✅ Token en contrato donaciones |
| **Donation** | ✅ Registro completo | ✅ Token en contrato donaciones |
| **Distribution** | ✅ Registro completo + evidencias | ✅ Registro en contrato entregas |
| **Center** | ✅ Registro completo | ✅ Smart Contract único |
| **AuditLog** | ✅ Registro de accesos | ❌ No se registra |

### 6.2 Detalle de Campos Blockchain

#### Contrato de Donaciones (`mint_token_donacion`)

**Guarda en blockchain**:
- `item_id`: ID del ítem (u64)
- `metadata`: Mapa con categoría y nombre
- `quantity`: Cantidad donada (u64)
- `center_lat`: Latitud en microgrados (i64)
- `center_lng`: Longitud en microgrados (i64)
- `center_geo_hash`: Hash SHA256 de ubicación (Bytes<32>)
- `timestamp`: Timestamp de la transacción

**NO guarda en blockchain**:
- Notas de la donación
- ID del donante (privacy-first)
- URL de imagen
- Datos del operador

#### Contrato de Entregas (`registrar_entrega_verificada`)

**Guarda en blockchain**:
- `distribution_id`: ID de distribución (u64)
- `item_id`: ID del ítem (u64)
- `quantity`: Cantidad entregada (u64)
- `recipient_commitment`: Hash del DNI + salt (Bytes<32>)
- `signature_hash`: Hash de la firma (Bytes<32>)
- `receipt_hash`: Hash del recibo completo (Bytes<32>)
- `operator_id`: ID del operador (u64)
- `assurance_level`: Nivel de verificación (String)
- `center_lat`: Latitud en microgrados (i64)
- `center_lng`: Longitud en microgrados (i64)
- `timestamp`: Timestamp de la transacción

**NO guarda en blockchain**:
- DNI del destinatario (solo el commitment)
- Imagen de firma (solo el hash)
- Notas
- IPs o devices (solo en auditoría DB)

#### Contrato de Centro (instancia única por centro)

**Guarda en blockchain**:
- `nombre`: Nombre del centro (String)
- `lat_e6`: Latitud en microgrados (i64)
- `lng_e6`: Longitud en microgrados (i64)
- `geo_hash`: Hash SHA256 de ubicación (Bytes<32>)
- `inventory`: Mapa de item_id → cantidad (Map<u64, u64>)

**Operaciones disponibles**:
- `registrar_ingreso`: Registrar entrada de ítems
- `registrar_egreso`: Registrar salida de ítems
- `obtener_inventario`: Consultar inventario on-chain
- `tiene_item`: Verificar si existe un ítem

### 6.3 Garantías de Integridad

**MySQL (Base de Datos)**:
- ✅ Alta disponibilidad
- ✅ Consultas rápidas
- ✅ Datos completos
- ❌ Puede modificarse (requiere auditoría)
- ❌ Single point of trust

**Blockchain (Stellar)**:
- ✅ Inmutable
- ✅ Descentralizada
- ✅ Auditoría pública
- ✅ Trazabilidad completa
- ❌ Latencia de confirmación (~10-30s)
- ❌ Costo de transacción (gas)

**Modelo Híbrido**:
- MySQL: Sistema de registro operacional
- Blockchain: Sistema de evidencia inmutable
- Graceful degradation: Si blockchain falla, el sistema continúa funcionando con MySQL

---

## 7. Diagrama de Secuencia Completo: Donación

```
Usuario          Frontend          Backend              MySQL              Stellar
  │                 │                 │                    │                   │
  │ 1. Llena form    │                 │                    │                   │
  ├────────────────>│                 │                    │                   │
  │                 │ 2. POST /api/donations                 │                   │
  │                 ├────────────────>│                    │                   │
  │                 │                 │ 3. BEGIN TX        │                   │
  │                 │                 ├──────────────────>│                   │
  │                 │                 │ 4. Busca/crea Item │                   │
  │                 │                 ├──────────────────>│                   │
  │                 │                 │ 5. Actualiza stock │                   │
  │                 │                 ├──────────────────>│                   │
  │                 │                 │ 6. Crea Donation   │                   │
  │                 │                 ├──────────────────>│                   │
  │                 │                 │ 7. COMMIT TX       │                   │
  │                 │                 ├──────────────────>│                   │
  │                 │                 │                    │                   │
  │                 │                 │ 8. mintDonationToken                │
  │                 │                 ├───────────────────┼──────────────────>│
  │                 │                 │                    │ 9. Deploy tx      │
  │                 │                 │                    │<──────────────────┤
  │                 │                 │                    │10. Confirmación   │
  │                 │                 │                    │<──────────────────┤
  │                 │                 │                    │                   │
  │                 │                 │11. Update Item+Donation              │
  │                 │                 ├──────────────────>│                   │
  │                 │                 │                    │                   │
  │                 │ 12. Response 201 │                    │                   │
  │                 │<─────────────────┤                    │                   │
  │ 13. Muestra éxito│                 │                    │                   │
  │<─────────────────┤                 │                    │                   │
```

---

## 8. Diagrama de Secuencia Completo: Distribución

```
Usuario          Frontend          Backend              MySQL              Stellar
  │                 │                 │                    │                   │
  │ 1. Inicia dist. │                 │                    │                   │
  ├────────────────>│                 │                    │                   │
  │                 │ 2. POST /prepare │                    │                   │
  │                 ├────────────────>│                    │                   │
  │                 │                 │ 3. Crea draft      │                   │
  │                 │                 ├──────────────────>│                   │
  │                 │ 4. Response draft                    │                   │
  │                 │<─────────────────┤                    │                   │
  │                 │                 │                    │                   │
  │ 5. Ingresa DNI   │                 │                    │                   │
  ├────────────────>│                 │                    │                   │
  │                 │ 6. POST /identify                    │                   │
  │                 ├────────────────>│                    │                   │
  │                 │                 │ 7. Genera commitment                  │
  │                 │                 │ 8. Update identified│                   │
  │                 │                 ├──────────────────>│                   │
  │                 │ 9. Response identified               │                   │
  │                 │<─────────────────┤                    │                   │
  │                 │                 │                    │                   │
  │ 10. Firma pad    │                 │                    │                   │
  ├────────────────>│                 │                    │                   │
  │                 │ 11. POST /sign  │                    │                   │
  │                 ├────────────────>│                    │                   │
  │                 │                 │ 12. Genera sig hash│                   │
  │                 │                 │ 13. Update signed  │                   │
  │                 │                 ├──────────────────>│                   │
  │                 │ 14. Response signed                   │                   │
  │                 │<─────────────────┤                    │                   │
  │                 │                 │                    │                   │
  │ 15. Confirma     │                 │                    │                   │
  ├────────────────>│                 │                    │                   │
  │                 │ 16. POST /finalize                   │                   │
  │                 ├────────────────>│                    │                   │
  │                 │                 │ 17. Build receipt  │                   │
  │                 │                 │ 18. Update pending_anchor            │
  │                 │                 ├──────────────────>│                   │
  │                 │                 │                    │                   │
  │                 │                 │ 19. recordVerifiedDistribution       │
  │                 │                 ├───────────────────┼──────────────────>│
  │                 │                 │                    │ 20. Deploy tx     │
  │                 │                 │                    │<──────────────────┤
  │                 │                 │                    │ 21. Confirmación  │
  │                 │                 │                    │<──────────────────┤
  │                 │                 │                    │                   │
  │                 │                 │ 22. Update stock + anchored          │
  │                 │                 ├──────────────────>│                   │
  │                 │ 23. Response 200 │                    │                   │
  │                 │<─────────────────┤                    │                   │
  │ 24. Muestra éxito│                 │                    │                   │
  │<─────────────────┤                 │                    │                   │
```

---

## Conclusión

El sistema "Acción del Sur" implementa un modelo de **doble persistencia** donde:

1. **MySQL** es la fuente de verdad operacional para:
   - Gestión de inventario en tiempo real
   - Consultas y reportes 
   - Información completa (no solo hashes)

2. **Blockchain (Stellar)** es la fuente de verdad inmutable para:
   - Trazabilidad de donaciones
   - Evidencia de entregas verificadas
   - Auditoría pública y transparente

3. **Graceful degradation** asegura:
   - Si blockchain falla, el sistema continúa funcionando
   - Las operaciones se marcan como `failed` pero persisten en MySQL
   - No hay interrupción del servicio

Este diseño permite que los centros de crisis operuen eficientemente mientras mantienen un registro inmutable y auditable de todas las transacciones de ayuda.
