# Plan: Arquitectura Multi-Contrato para Trazabilidad de Donaciones

## Contexto

Actualmente existe UN solo contrato Soroban (`contrato_donaciones`) que maneja todo. Se necesita separar en múltiples contratos: uno para recepción de donaciones, uno para entregas finales, y **uno por cada centro de distribución** (deployados dinámicamente desde el frontend).

**Flujo deseado:**
```
Donante → [contrato_donaciones: Mint Token]
       → Centro A [contrato_centro instancia 1]
       → Centro B [contrato_centro instancia 2]
       → ...
       → [contrato_entregas: Entrega al destinatario final]
```

**Decisiones tomadas:**
- N+2 contratos: `contrato_donaciones` + `contrato_entregas` + N × `contrato_centro`
- Cada centro es su propia instancia de contrato en la blockchain
- El WASM de `contrato_centro` se sube UNA vez; cada centro crea una instancia nueva (barato)
- Tokens individuales por donación (no fungibles)
- Storage custom (mismo patrón del proyecto)
- Firma digital para autenticar transferencias → placeholder por ahora
- 2 centros dummy de prueba para verificar que funciona

---

## Arquitectura: 3 Tipos de Contrato

### Contrato 1: `contrato_donaciones` (existente, simplificado)
- Mintea tokens cuando llega una donación
- Ya no maneja distribuciones ni entregas (se eliminan esas funciones)

### Contrato 2: `contrato_entregas` (nuevo, una instancia)
- Registra entregas finales a destinatarios
- Verificación de hashes de integridad

### Contrato 3: `contrato_centro` (nuevo, N instancias)
- **Un contrato deployado por cada centro de distribución**
- Cada instancia tiene su propio storage on-chain
- Registra ingresos y egresos de tokens/items
- Mantiene inventario del centro
- Historial de movimientos

**Cómo funciona el deploy dinámico en Soroban:**
1. Se sube el WASM de `contrato_centro` UNA vez → se obtiene un `wasm_hash` (32 bytes)
2. Para crear un nuevo centro → `Operation.createCustomContract({ wasmHash })` → nuevo contract ID
3. El contract ID se guarda en la tabla `centers` de MySQL
4. Cada instancia tiene su propio storage independiente

---

## Contrato 1: `contrato_donaciones` — Simplificación

### Se mantiene:
```rust
pub struct TokenDonacion {
    pub item_id: u64,
    pub categoria: String,
    pub nombre: String,
    pub timestamp: u64,
    pub cantidad_inicial: u64,
    pub center_lat_e6: i64,     // se mantiene para registro histórico
    pub center_lng_e6: i64,
    pub center_geo_hash: BytesN<32>,
}
```

### Funciones que se mantienen:
| Función | Descripción |
|---------|-------------|
| `mint_token_donacion` | Mintea token al recibir donación (sin cambios) |
| `verificar_token` | Verifica si item tiene token |
| `obtener_token` | Lee token de un item |

### Se eliminan (se mueven a otros contratos):
- `registrar_distribucion` → reemplazado por `contrato_centro.registrar_ingreso/egreso`
- `registrar_entrega_verificada` → se mueve a `contrato_entregas`
- `obtener_entrega`, `verificar_hashes` → se mueven a `contrato_entregas`
- `obtener_historial_distribuciones`, `total_distribuciones` → reemplazados
- Structs: `RegistroDistribucion`, `EntregaVerificada`

---

## Contrato 2: `contrato_entregas` — Nuevo

```rust
#[contracttype]
#[derive(Clone)]
pub struct EntregaVerificada {
    pub distribution_id: u64,
    pub item_id: u64,
    pub quantity: u64,
    pub recipient_commitment: BytesN<32>,
    pub signature_hash: BytesN<32>,
    pub receipt_hash: BytesN<32>,
    pub operator_id: u64,
    pub assurance_level: String,
    pub center_contract_id: String,  // contract ID del centro que entregó
    pub timestamp: u64,
}

#[contracttype]
pub enum ClaveEntrega {
    Entrega(u64),           // distribution_id → EntregaVerificada
    HistorialEntregas,      // → Vec<u64>
    ContadorEntregas,       // → u64
}
```

### Funciones:
| Función | Params | Retorna |
|---------|--------|---------|
| `registrar_entrega_verificada` | distribution_id, item_id, quantity, recipient_commitment, signature_hash, receipt_hash, operator_id, assurance_level, center_contract_id | BytesN\<32\> |
| `obtener_entrega` | distribution_id | Option\<EntregaVerificada\> |
| `verificar_hashes` | distribution_id, signature_hash, receipt_hash | bool |
| `total_entregas` | — | u64 |

---

## Contrato 3: `contrato_centro` — Nuevo (Template para N instancias)

Cada instancia de este contrato **es** un centro de distribución en la blockchain.

```rust
#[contracttype]
#[derive(Clone)]
pub struct InfoCentro {
    pub nombre: String,
    pub lat_e6: i64,
    pub lng_e6: i64,
    pub geo_hash: BytesN<32>,
    pub timestamp_creacion: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct ItemEnCentro {
    pub item_id: u64,
    pub cantidad: u64,
    pub timestamp_ingreso: u64,
    pub origen: String,  // "donacion" | contract ID del centro origen
}

#[contracttype]
#[derive(Clone)]
pub struct Movimiento {
    pub movimiento_id: u64,
    pub item_id: u64,
    pub cantidad: u64,
    pub tipo: String,         // "ingreso" | "egreso"
    pub contraparte: String,  // contract ID origen/destino o "donacion" o "entrega_final"
    pub timestamp: u64,
    pub firma_placeholder: BytesN<32>,  // futuro: firma digital
    pub motivo: String,
}

#[contracttype]
pub enum ClaveCentro {
    Info,                      // → InfoCentro (datos del centro, se setea al inicializar)
    Item(u64),                 // item_id → ItemEnCentro
    Inventario,                // → Vec<u64> (lista de item_ids en custodia)
    Movimiento(u64),           // movimiento_id → Movimiento
    HistorialMovimientos,      // → Vec<u64> (lista de movimiento_ids)
    ContadorMovimientos,       // → u64
}
```

### Funciones:
| Función | Params | Retorna | Descripción |
|---------|--------|---------|-------------|
| `inicializar` | nombre, lat_e6, lng_e6, geo_hash | bool | Setea InfoCentro (solo se puede llamar 1 vez) |
| `obtener_info` | — | Option\<InfoCentro\> | Lee datos del centro |
| `registrar_ingreso` | item_id, cantidad, origen, firma_placeholder, motivo | BytesN\<32\> | Recibe un item/token |
| `registrar_egreso` | item_id, cantidad, destino, firma_placeholder, motivo | BytesN\<32\> | Envía un item/token |
| `obtener_inventario` | — | Vec\<ItemEnCentro\> | Items actualmente en custodia |
| `tiene_item` | item_id | bool | Verifica si el centro tiene el item |
| `obtener_movimientos` | — | Vec\<Movimiento\> | Todos los movimientos del centro |
| `total_movimientos` | — | u64 | Contador de movimientos |

### Lógica de `registrar_ingreso`:
1. Crea `ItemEnCentro` con los datos
2. Lo guarda en `Item(item_id)`
3. Agrega `item_id` a `Inventario`
4. Crea `Movimiento` tipo "ingreso"
5. Retorna hash del movimiento

### Lógica de `registrar_egreso`:
1. Valida que `Item(item_id)` existe (el centro tiene el item)
2. Elimina `Item(item_id)` del storage
3. Remueve `item_id` del `Inventario`
4. Crea `Movimiento` tipo "egreso"
5. Retorna hash del movimiento

---

## Flujo de Transferencia (orquestado por el backend)

```
POST /api/transfers { item_id, from_center_id, to_center_id, quantity, reason }

Backend:
1. Busca from_center y to_center en MySQL → obtiene sus contract IDs
2. Valida que item.current_center_id == from_center_id
3. Llama contrato_centro[from].registrar_egreso(item_id, cantidad, to_contract_id, ...)
4. Llama contrato_centro[to].registrar_ingreso(item_id, cantidad, from_contract_id, ...)
5. Si ambos OK:
   - Actualiza item.current_center_id = to_center_id en MySQL
   - Guarda ambos tx_ids en token_transfers
   - Status = 'anchored'
6. Si paso 4 falla (ingreso):
   - Llama contrato_centro[from].registrar_ingreso() para revertir el egreso
   - Status = 'failed'
```

---

## Base de Datos — Cambios

### Tabla nueva: `centers`
```sql
CREATE TABLE centers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    geo_hash VARCHAR(64) NULL,
    blockchain_contract_id VARCHAR(255) NULL,  -- Contract ID de esta instancia (C...)
    blockchain_deploy_tx VARCHAR(255) NULL,     -- TX del deploy
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_center_active (is_active),
    INDEX idx_center_contract (blockchain_contract_id)
);
```

### Tabla nueva: `token_transfers`
```sql
CREATE TABLE token_transfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    from_center_id INT NOT NULL,
    to_center_id INT NOT NULL,
    quantity INT NOT NULL,
    reason VARCHAR(500) NULL,
    egreso_blockchain_hash VARCHAR(255) NULL,   -- hash del egreso en centro origen
    egreso_blockchain_tx VARCHAR(255) NULL,
    ingreso_blockchain_hash VARCHAR(255) NULL,   -- hash del ingreso en centro destino
    ingreso_blockchain_tx VARCHAR(255) NULL,
    status ENUM('pending','anchored','failed') NOT NULL DEFAULT 'pending',
    transferred_by INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id),
    FOREIGN KEY (from_center_id) REFERENCES centers(id),
    FOREIGN KEY (to_center_id) REFERENCES centers(id),
    FOREIGN KEY (transferred_by) REFERENCES users(id),
    INDEX idx_transfer_item (item_id),
    INDEX idx_transfer_from (from_center_id),
    INDEX idx_transfer_to (to_center_id)
);
```

### Columnas nuevas en tablas existentes:
- `items.current_center_id` INT NULL → FK a `centers`
- `donations.center_id` INT NULL → FK a `centers`
- `distributions.center_id` INT NULL → FK a `centers`

---

## Backend — Cambios

### Archivos nuevos:
| Archivo | Descripción |
|---------|-------------|
| `src/models/Center.js` | Modelo Sequelize |
| `src/models/TokenTransfer.js` | Modelo Sequelize |
| `src/controllers/centerController.js` | CRUD + deploy de contrato |
| `src/controllers/transferController.js` | Transferencias entre centros |
| `src/routes/centers.js` | Rutas REST |
| `src/routes/transfers.js` | Rutas REST |
| `src/services/blockchain/contrato_entregas/src/lib.rs` | Contrato Rust |
| `src/services/blockchain/contrato_entregas/Cargo.toml` | Config Rust |
| `src/services/blockchain/contrato_centro/src/lib.rs` | Contrato Rust (template) |
| `src/services/blockchain/contrato_centro/Cargo.toml` | Config Rust |

### Archivos modificados:
| Archivo | Cambio |
|---------|--------|
| `stellarService.js` | Soportar múltiples contract IDs, deploy programático, métodos por contrato |
| `contrato_donaciones/src/lib.rs` | Eliminar distribución/entrega, dejar solo minteo |
| `ensureSchema.js` | Agregar tablas `centers`, `token_transfers`, columnas `center_id` |
| `models/index.js` | Registrar nuevos modelos y asociaciones |
| `donationController.js` | `center_id` obligatorio, asignar item al centro |
| `distributionController.js` | Llamar a `contrato_entregas` |
| `server.js` | Registrar rutas nuevas |

### stellarService.js — Cambios clave:

```javascript
// _invocarContrato ahora recibe contractId como parámetro
async _invocarContrato(contractId, metodo, args, { readOnly = false } = {})

// Nuevo: subir WASM una vez, guardar hash
async uploadCenterWasm(wasmPath)
// → usa Operation.uploadContractWasm({ wasm: Buffer })
// → retorna { wasmHash } (32 bytes, se guarda en .env como CENTRO_WASM_HASH)

// Nuevo: crear instancia de contrato para un centro
async deployCenterContract(wasmHash, salt)
// → usa Operation.createCustomContract({ address, wasmHash, salt })
// → retorna { contractId, txId }

// Nuevo: inicializar centro recién deployado
async initializeCenter(contractId, { nombre, lat_e6, lng_e6, geo_hash })

// Nuevo: registrar ingreso en un centro específico
async registrarIngreso(contractId, { itemId, cantidad, origen, firma, motivo })

// Nuevo: registrar egreso en un centro específico
async registrarEgreso(contractId, { itemId, cantidad, destino, firma, motivo })

// Nuevo: obtener inventario de un centro
async obtenerInventario(contractId)

// Modificado: entregas van a contrato_entregas
async recordVerifiedDelivery({ ...params })
// → llama a SOROBAN_CONTRACT_ENTREGAS en vez de SOROBAN_CONTRACT_ID
```

**Env vars:**
```
SOROBAN_CONTRACT_DONACIONES=C...    # contrato de donaciones (existente, redeploy)
SOROBAN_CONTRACT_ENTREGAS=C...      # contrato de entregas (nuevo)
CENTRO_WASM_HASH=abc123...          # hash del WASM de contrato_centro (para crear instancias)
```

### API Endpoints nuevos:
```
POST   /api/centers              — crear centro + deploy contrato
  body: { name, latitude, longitude }
  response: { id, name, ..., blockchain_contract_id }

GET    /api/centers              — listar centros
GET    /api/centers/:id          — obtener centro
DELETE /api/centers/:id          — desactivar centro
GET    /api/centers/:id/inventory — items en custodia (lee del contrato on-chain)

POST   /api/transfers            — transferir entre centros
  body: { item_id, from_center_id, to_center_id, quantity, reason }
GET    /api/transfers?item_id=N  — historial de movimientos de un item
GET    /api/transfers?center_id=N — movimientos de un centro
```

### centerController.create — Flujo detallado:
```javascript
exports.create = async (req, res, next) => {
  // 1. Validar input
  // 2. Crear row en MySQL (sin contract_id aún)
  // 3. Generar salt único (crypto.randomBytes(32))
  // 4. stellarService.deployCenterContract(wasmHash, salt)
  //    → obtiene contractId
  // 5. stellarService.initializeCenter(contractId, { nombre, lat, lng, geoHash })
  // 6. Actualizar row con blockchain_contract_id y blockchain_deploy_tx
  // 7. Retornar centro creado
};
```

---

## Deploy — Orden de ejecución

### Paso 1: Compilar los 3 contratos
```bash
# contrato_donaciones (refactorizado)
cd backend/src/services/blockchain/contrato_donaciones
stellar contract build

# contrato_entregas (nuevo)
cd backend/src/services/blockchain/contrato_entregas
stellar contract build

# contrato_centro (template)
cd backend/src/services/blockchain/contrato_centro
stellar contract build
```

### Paso 2: Deploy contrato_donaciones y contrato_entregas
```bash
# Deploy donaciones (nuevo contract ID por cambios en el código)
stellar contract deploy \
  --wasm contrato_donaciones/target/wasm32-unknown-unknown/release/contrato_donaciones.wasm \
  --source accion-del-sur-deployer --network testnet
# → SOROBAN_CONTRACT_DONACIONES=C...

# Deploy entregas
stellar contract deploy \
  --wasm contrato_entregas/target/wasm32-unknown-unknown/release/contrato_entregas.wasm \
  --source accion-del-sur-deployer --network testnet
# → SOROBAN_CONTRACT_ENTREGAS=C...
```

### Paso 3: Subir WASM de contrato_centro (una sola vez)
```bash
# Esto solo sube el código, no crea instancia
stellar contract upload \
  --wasm contrato_centro/target/wasm32-unknown-unknown/release/contrato_centro.wasm \
  --source accion-del-sur-deployer --network testnet
# → Retorna WASM hash → CENTRO_WASM_HASH=...
```
O hacerlo programáticamente desde el backend con `stellarService.uploadCenterWasm()`.

### Paso 4: Actualizar .env
```env
SOROBAN_CONTRACT_DONACIONES=C...nuevo...
SOROBAN_CONTRACT_ENTREGAS=C...nuevo...
CENTRO_WASM_HASH=abc123...
```

### Paso 5: Reiniciar backend
`ensureSchema` crea tablas `centers` y `token_transfers` automáticamente.

### Paso 6: Crear 2 centros dummy de prueba
```bash
# Centro A
curl -X POST http://localhost:3001/api/centers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Centro Distribución Norte", "latitude": -34.5708, "longitude": -58.4370}'
# → Deploy contrato_centro instancia 1 on-chain

# Centro B
curl -X POST http://localhost:3001/api/centers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Centro Distribución Sur", "latitude": -34.6500, "longitude": -58.5100}'
# → Deploy contrato_centro instancia 2 on-chain
```

---

## Pendiente (futuro)
- [ ] **Autenticación de transferencias con firma digital** (dedo) — placeholder por ahora
- [ ] **División parcial de tokens** (ej: 50 camisas → 30 a Centro A + 20 a Centro B)
- [ ] **Paginación de historial on-chain** para centros con muchos movimientos
- [ ] **Rollback automático** si falla el ingreso después del egreso

---

## Estado: IMPLEMENTADO Y TESTEADO ✅ (2026-03-27)

### Contratos deployados en Stellar Testnet:
| Contrato | Contract ID |
|----------|-------------|
| `contrato_donaciones` | `CAXAUOQRZZUIVVOKJGFUI6O6HQCYGHPILDXWB3LRNUBPHSX6GZIG6WRA` |
| `contrato_entregas` | `CBZ4A2X3WCI5WQRLFIICPRGI6L3RKHHBFLFPUELUXYYS3D5SCEKJKWW6` |
| `contrato_centro` WASM | `7bc95fb5877feca0d433c48f866334dbb1aeacfd626ce147aa836584fdbee3e7` |

### Test E2E: 74/74 pasando (`backend/scripts/e2e/full-centers-test.js`)
- [x] Auth + Login
- [x] Centers: crear con deploy on-chain, listar, obtener, inventario on-chain
- [x] Donations: crear con minteo en contrato_donaciones
- [x] Transfers: egreso en centro origen + ingreso en centro destino (ambos on-chain)
- [x] Distribution: flujo completo 4 pasos con anchor en contrato_entregas
- [x] Blockchain verification: token verificado, info centro, custodia correcta
- [x] Edge cases: mismo centro, centro incorrecto, 404s, desactivación
