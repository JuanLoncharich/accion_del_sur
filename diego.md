# Acción del Sur — Guía Completa del Proyecto

Todo lo que necesitás saber para entender, levantar, usar y extender el sistema.

---

## Qué es esto

**Acción del Sur** es un sistema web de gestión de donaciones para un centro de crisis operado por una ONG. Cubre el ciclo completo:

```
Donación entra → Se registra en inventario → Se distribuye a un receptor
```

Cada paso queda registrado en una base de datos MySQL **y** en la blockchain **Stellar Testnet** mediante un smart contract escrito en Rust (Soroban). El sistema está pensado para ser usado por un encargado de logística — alguien no técnico — por lo que la interfaz es completamente en español, con pasos guiados e íconos grandes.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express 5 |
| ORM | Sequelize 6 |
| Base de datos | MySQL 8 (Docker) |
| Autenticación | JWT + bcrypt |
| Frontend | React 19 + Vite 8 |
| Estilos | Tailwind CSS v4 |
| Gráficos | Recharts |
| Blockchain | Stellar Testnet + Soroban (Rust) |
| SDK Stellar | `@stellar/stellar-sdk` v14 |

---

## Estructura del proyecto

```
accion-del-sur/
├── backend/
│   ├── server.js                          ← Punto de entrada Express
│   ├── .env                               ← Variables de entorno (claves reales)
│   ├── .env.example                       ← Plantilla sin valores sensibles
│   ├── uploads/                           ← Fotos de ítems subidas por Multer
│   └── src/
│       ├── config/database.js             ← Conexión Sequelize → MySQL
│       ├── models/                        ← User, Category, CategoryAttribute,
│       │                                     Item, Donation, Distribution
│       ├── controllers/                   ← Lógica de negocio por recurso
│       ├── routes/                        ← Rutas Express
│       ├── middleware/
│       │   ├── auth.js                    ← Verificación JWT, requireAdmin
│       │   └── errorHandler.js            ← Manejo centralizado de errores
│       ├── seeders/index.js               ← Datos iniciales (categorías + admin)
│       └── services/blockchain/
│           ├── stellarService.js          ← Integración real con Stellar
│           ├── contrato_donaciones/       ← Smart contract Rust/Soroban
│           │   ├── Cargo.toml
│           │   └── src/lib.rs
│           └── scripts/
│               ├── generar-cuenta.js      ← Genera keypair y fondea testnet
│               └── deploy-contrato.sh     ← Compila y despliega el contrato
├── frontend/
│   ├── vite.config.js                     ← Proxy /api → :3001
│   └── src/
│       ├── App.jsx                        ← Router + rutas protegidas
│       ├── main.jsx
│       ├── index.css                      ← Tailwind + estilos base
│       ├── context/AuthContext.jsx        ← Estado global de autenticación
│       ├── hooks/useToast.js
│       ├── services/api.js                ← Axios con interceptor JWT
│       ├── components/
│       │   ├── Layout.jsx                 ← Wrapper con sidebar + toast
│       │   ├── Sidebar.jsx                ← Navegación lateral responsiva
│       │   └── Toast.jsx                  ← Notificaciones
│       └── pages/
│           ├── Login.jsx
│           ├── Dashboard.jsx              ← Stats + 3 gráficos + actividad reciente
│           ├── NuevaDonacion.jsx          ← Wizard 4 pasos con formulario dinámico
│           ├── Inventario.jsx             ← Tabla con filtros + export CSV
│           ├── NuevaDistribucion.jsx      ← Selector de ítem + datos receptor
│           ├── Distribuciones.jsx         ← Historial con filtros
│           ├── AdminCategorias.jsx        ← ABM categorías + atributos + preview
│           └── AdminUsuarios.jsx          ← ABM usuarios
├── stellar-guide-vendimia-tech/           ← Guía de referencia clonada de GitHub
├── BLOCKCHAIN.md                          ← Documentación técnica de blockchain
├── diego.md                               ← Este archivo
└── README.md                              ← Instalación rápida
```

---

## Cómo levantar el sistema

### Pre-requisitos

- Node.js 18+
- Docker (para MySQL)
- Rust + target wasm32 (solo si vas a recompilar el contrato)

### 1. MySQL con Docker

```bash
docker run -d \
  --name accion-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=accion_del_sur \
  -p 3306:3306 \
  mysql:8.0

# Esperar ~15 segundos y verificar
docker exec accion-mysql mysqladmin ping -uroot -proot --silent
```

### 2. Backend

```bash
cd backend

# Instalar dependencias
npm install

# Crear tablas y cargar datos iniciales
npm run seed

# Iniciar servidor (puerto 3001)
npm start
```

### 3. Frontend

```bash
cd frontend

npm install
npm run dev   # corre en http://localhost:5173
```

### Credenciales por defecto

| Campo | Valor |
|-------|-------|
| Usuario | `admin` |
| Contraseña | `admin123` |
| Rol | Administrador |

---

## Modelo de datos

### `users`
Quiénes pueden usar el sistema. Roles: `admin` o `logistica`.

### `categories`
Las 6 categorías de donación precargadas: Prendas, Alimentos, Bebidas, Productos de Limpieza, Medicamentos, Herramientas. Un admin puede crear, editar y desactivar categorías (soft delete).

### `category_attributes`
Define los campos dinámicos de cada categoría. Prendas tiene Tipo, Género, Talle y Estado. Medicamentos tiene Tipo, Fecha de vencimiento y Requiere receta. Tipos posibles: `text`, `number`, `date`, `select`.

### `items`
Cada ítem único en el inventario. Un ítem es la combinación de una categoría + sus atributos. Ejemplo: "Remera / Hombre / Talle M / Nuevo" es un ítem distinto de "Remera / Mujer / Talle L / Buen estado". El campo `quantity` sube con donaciones y baja con distribuciones.

Campos blockchain: `blockchain_hash`, `blockchain_tx_id`, `token_status` (`pending` / `minted` / `failed`).

### `donations`
Cada lote que entra. Apunta a un `item_id` y registra cuántas unidades llegaron, quién las cargó y cuándo.

### `distributions`
Cada entrega a un receptor. Apunta a un `item_id`, registra cuántas unidades salieron, el identificador del receptor (texto libre hoy, biométrico en el futuro), y su hash SHA-256 para privacidad. Campo `blockchain_hash` para la transacción en Stellar.

---

## Lógica de deduplicación de ítems

Cuando se registra una donación, el sistema **no crea un ítem nuevo si ya existe uno con los mismos atributos en la misma categoría**. En cambio, suma la cantidad al stock existente.

La comparación se hace en JavaScript normalizando las keys del JSON con `.sort()` para evitar falsos negativos por orden distinto:

```javascript
const attrsStr = JSON.stringify(
  Object.keys(attributes).sort().reduce((acc, k) => { acc[k] = attributes[k]; return acc; }, {})
);
```

Esto evita que "Remera / Hombre / M / Nuevo" aparezca duplicada en el inventario si se registra más de una donación del mismo tipo.

---

## Páginas del frontend

### Login (`/login`)
Formulario simple, redirige al dashboard tras autenticarse.

### Dashboard (`/`)
- 4 tarjetas: total donaciones, ítems en stock, distribuciones, categorías activas
- Gráfico de barras: stock por categoría
- Gráfico de líneas: donaciones por semana (últimas 8 semanas)
- Gráfico de torta: distribución porcentual del inventario
- Tablas de últimas 10 donaciones y últimas 10 distribuciones

### Registrar Donación (`/donaciones/nueva`)
Wizard de 4 pasos:
1. Elegir categoría (cards grandes con íconos)
2. Completar atributos dinámicos (los campos se generan según la categoría)
3. Cantidad + observaciones + foto opcional
4. Confirmar y guardar

### Inventario (`/inventario`)
Tabla con filtros por categoría y búsqueda por nombre. Click en una fila expande los detalles completos (atributos, foto, estado blockchain). Botón para exportar todo a CSV.

### Registrar Distribución (`/distribuciones/nueva`)
Selector de ítem (con búsqueda y filtro por categoría, solo muestra ítems con stock > 0), campo de cantidad con validación de stock, campo de identificador del receptor.

### Historial de Distribuciones (`/distribuciones`)
Tabla con filtros por receptor, categoría y rango de fechas. Expandible por fila.

### Gestión de Categorías (`/admin/categorias`) — solo admin
ABM completo de categorías. ABM de atributos por categoría con reordenamiento (drag&drop con flechas). Vista previa del formulario de carga en tiempo real.

### Gestión de Usuarios (`/admin/usuarios`) — solo admin
ABM de usuarios. Modal para crear/editar. No permite eliminarse a uno mismo.

---

## API — Endpoints principales

```
POST   /api/auth/login                        Login → devuelve JWT
GET    /api/auth/me                           Usuario actual

GET    /api/dashboard/summary                 Datos completos del dashboard

GET    /api/categories                        Lista categorías con atributos
POST   /api/categories                        Crear (admin)
PUT    /api/categories/:id                    Editar (admin)
DELETE /api/categories/:id                    Desactivar (admin)
GET    /api/categories/:id/attributes         Atributos de una categoría
POST   /api/categories/:id/attributes         Agregar atributo (admin)
PUT    /api/categories/:id/attributes/:attrId Editar atributo (admin)
DELETE /api/categories/:id/attributes/:attrId Eliminar atributo (admin)

POST   /api/donations                         Registrar donación (+ minteo Stellar)
GET    /api/donations                         Listar con paginación y filtros
GET    /api/donations/stats                   Estadísticas

GET    /api/items                             Listar inventario con filtros
GET    /api/items/:id                         Detalle de ítem
PUT    /api/items/:id                         Editar ítem
DELETE /api/items/:id                         Soft delete
GET    /api/items/export/csv                  Exportar inventario
GET    /api/items/stock-by-category           Stock agrupado por categoría

POST   /api/distributions                     Registrar distribución (+ registro Stellar)
GET    /api/distributions                     Listar con filtros
GET    /api/distributions/stats               Estadísticas

GET    /api/users                             Listar usuarios (admin)
POST   /api/users                             Crear usuario (admin)
PUT    /api/users/:id                         Editar usuario (admin)
DELETE /api/users/:id                         Eliminar usuario (admin)
```

Todos los endpoints requieren `Authorization: Bearer <token>` excepto `/api/auth/login`.

---

## Blockchain — Estado actual

### Qué funciona hoy

El sistema está integrado con **Stellar Testnet** y funciona en producción (testnet). Cada vez que se registra una donación o una distribución, se ejecuta una transacción real en la blockchain.

**Contrato deployado:**
- Contract ID: `CASFE4OQYEQIEXKPVOCTXYDMPESJKWCRXHMB2MNAEP7W7IN6ZXQBSL55`
- Red: Testnet
- Ver en explorer: https://stellar.expert/explorer/testnet/contract/CASFE4OQYEQIEXKPVOCTXYDMPESJKWCRXHMB2MNAEP7W7IN6ZXQBSL55

**Cuenta operadora:**
- Public Key: `GCGVSCO3R6Z62SHGA36JZKO4AZ66AYILS3MM3WBC6L3RSCTKP3NX4AYC`
- Ver en explorer: https://stellar.expert/explorer/testnet/account/GCGVSCO3R6Z62SHGA36JZKO4AZ66AYILS3MM3WBC6L3RSCTKP3NX4AYC

### Flujo de una donación

```
1. Frontend envía POST /api/donations
2. Backend valida y guarda en MySQL (transacción atómica)
3. Backend llama a stellarService.mintDonationToken()
4. stellarService llama al contrato Soroban: mint_token_donacion(item_id, metadata, cantidad)
5. Patrón: simulate → prepareTransaction → sign → sendTransaction → polling
6. Si confirma: guarda blockchain_hash + blockchain_tx_id + token_status='minted' en el ítem
7. Si falla: marca token_status='failed' (el sistema sigue funcionando igual)
```

### Flujo de una distribución 

```
1. Frontend envía POST /api/distributions
2. Backend valida stock, calcula SHA-256 del receptor, guarda en MySQL
3. Backend llama a stellarService.recordDistribution()
4. stellarService llama al contrato: registrar_distribucion(item_id, receptor_hash, cantidad)
5. Mismo patrón de transacción
6. Si confirma: guarda blockchain_hash en la distribución
```

### Flujo extremo a extremo (detalle operativo)

Esta sección baja el flujo a nivel pantalla + request + controlador + contrato para que se vea exactamente qué pasa en cada capa.

#### 0) Autenticación previa (obligatoria)

Antes de poder registrar donaciones o distribuciones:

1. Frontend (`Login.jsx`) llama `POST /api/auth/login`.
2. Backend (`authController.login`) valida usuario/contraseña y responde JWT.
3. Frontend guarda `token` y `user` en `localStorage` (`AuthContext.jsx`).
4. Axios (`services/api.js`) agrega automáticamente `Authorization: Bearer <token>` a todas las llamadas.
5. En backend, `middleware/auth.js` valida token en cada endpoint protegido y carga `req.user`.

Sin este paso, `POST /api/donations` y `POST /api/distributions` devuelven 401.

#### 1) Flujo frontend de donación (pantallas y llamadas)

Pantalla usada: `frontend/src/pages/NuevaDonacion.jsx`

1. Al abrir la pantalla, frontend llama `GET /api/categories` para traer categorías + atributos dinámicos.
2. Usuario recorre wizard de 4 pasos:
  - Paso 1: selecciona categoría.
  - Paso 2: completa atributos dinámicos.
  - Paso 3: define cantidad, notas y foto opcional.
  - Paso 4: confirma.
3. Frontend arma `FormData` y envía `POST /api/donations` con:
  - `category_id`
  - `attributes` (JSON serializado)
  - `quantity`
  - `notes`
  - `image` (archivo opcional)
4. Si backend responde OK, frontend redirige a `/inventario`.

#### 2) Flujo backend de donación (controlador y transacción)

Endpoint: `POST /api/donations`
Ruta: `backend/src/routes/donations.js`
Controlador: `backend/src/controllers/donationController.js`

Paso a paso real:

1. `authenticate` valida JWT.
2. `multer` procesa archivo (`image`) y guarda en `uploads/`.
3. `express-validator` valida:
  - `category_id` entero.
  - `quantity` entero > 0.
4. Arranca transacción SQL (`sequelize.transaction()`).
5. Busca ítems candidatos activos de esa categoría.
6. Aplica deduplicación por atributos normalizados (keys ordenadas):
  - Si ya existe ítem equivalente, reutiliza ese `item`.
  - Si no existe, crea nuevo `item` con `quantity: 0`, `attributes`, `name` y `image_url`.
7. Sube stock del ítem: `item.quantity += quantity`.
8. Crea registro en tabla `donations` con `item_id`, `quantity`, `notes`, `registered_by`.
9. Hace `commit` de la transacción.

Hasta acá ya quedó persistido en MySQL, aunque la blockchain falle.

#### 3) Minteo después del commit (graceful degradation)

Después del commit SQL:

1. `donationController.create` llama `stellarService.mintDonationToken({ item, donation })`.
2. Si `STELLAR_ENABLED=false` o no hay contrato configurado, retorna estado pendiente sin romper operación.
3. Si está activo, `stellarService` invoca contrato Soroban método `mint_token_donacion` con:
  - `item_id` (u64)
  - `metadata` (map con `categoria` y `nombre`)
  - `cantidad` (u64)
4. Patrón técnico:
  - `simulateTransaction`
  - `prepareTransaction`
  - firma con la cuenta operadora (clave secreta en backend)
  - `sendTransaction`
  - polling de confirmación
5. Si confirma:
  - actualiza ítem en DB con `blockchain_hash`, `blockchain_tx_id`, `token_status='minted'`.
6. Si falla:
  - actualiza `token_status='failed'`.
  - no revierte la donación en DB (donación sigue válida operacionalmente).

#### 4) Dónde va lo minteado exactamente

Contrato: `backend/src/services/blockchain/contrato_donaciones/src/lib.rs`

Al mintear (`mint_token_donacion`), on-chain se guarda:

1. `ClaveAlmacen::Token(item_id)` → `TokenDonacion` con:
  - `item_id`
  - `categoria`
  - `nombre`
  - `timestamp`
  - `cantidad_inicial`
2. `ClaveAlmacen::HistorialDonacion(item_id)` → vector histórico de `TokenDonacion`.
3. Retorna un hash SHA-256 del token (bytes 32).

Ese hash retornado se persiste en MySQL en `items.blockchain_hash`. Además, `items.blockchain_tx_id` guarda el hash/ID de transacción Stellar para trazabilidad de explorer.

#### 5) Qué queda en blockchain vs qué queda solo en base de datos

Se guarda en blockchain:

- Donación minteada: `item_id`, metadata mínima (`categoria`, `nombre`), `cantidad_inicial`, `timestamp`, hash calculado.
- Distribución: `item_id`, `receptor_hash` (no dato en claro), `cantidad`, `timestamp`, `distribucion_id`, hash calculado.

Se guarda solo en MySQL:

- Usuario autenticado que operó (`registered_by`).
- Notas internas (`notes`) de donación/distribución.
- Foto del ítem (`image_url`).
- Identificador del receptor en claro (`receiver_identifier`) para operación diaria.
- Estado operativo de inventario (`items.quantity`, `is_active`, etc.).
- Estados de integración (`token_status`, `blockchain_tx_id`, `blockchain_hash` en tablas SQL).

#### 6) Cómo recibe hoy una persona la donación (estado actual)

Pantalla usada: `frontend/src/pages/NuevaDistribucion.jsx`

Flujo actual implementado:

1. Frontend carga ítems con stock (`GET /api/items`) y categorías (`GET /api/categories`).
2. Operador selecciona ítem, cantidad y carga `receiver_identifier` (texto libre: DNI, nombre, código, etc.).
3. Frontend envía `POST /api/distributions` con `item_id`, `quantity`, `receiver_identifier`, `notes`.
4. Backend (`distributionController.create`):
  - valida stock,
  - calcula `receiver_hash = SHA-256(receiver_identifier)`,
  - descuenta stock,
  - guarda distribución en DB,
  - luego registra on-chain vía `registrar_distribucion(item_id, receptor_hash, cantidad)`.
5. Si transacción blockchain confirma, guarda `distribution.blockchain_hash`.

Importante: hoy NO existe una firma criptográfica del receptor en frontend ni backend. La firma de la transacción blockchain la hace la cuenta operadora del backend.

#### 7) “Firma del receptor”: qué existe y qué no

Existe hoy:

- “Prueba” de recepción operacional: registro en DB + hash del receptor + registro inmutable on-chain de esa entrega.

No existe hoy:

- Captura de firma manuscrita digital.
- Firma criptográfica del receptor con wallet propia (Freighter u otra).
- Challenge de consentimiento firmado por clave privada del receptor.

Si se quiere firma real del receptor, hay que agregar una capa nueva de identidad/firma (wallet o biometría con consentimiento) antes de confirmar `POST /api/distributions`.

### El contrato Soroban (Rust)

Ubicación: `backend/src/services/blockchain/contrato_donaciones/src/lib.rs`

Métodos:

| Método | Qué hace |
|--------|----------|
| `mint_token_donacion` | Registra token de trazabilidad para un ítem, con sus metadatos y cantidad inicial |
| `registrar_distribucion` | Registra una entrega on-chain con hash del receptor (privacidad), item y cantidad |
| `verificar_token` | Confirma si un ítem tiene token registrado |
| `obtener_historial_distribuciones` | Retorna todas las entregas de un ítem |
| `obtener_token` | Retorna los datos del token de un ítem |
| `total_distribuciones` | Total de distribuciones registradas en el contrato |

### Activar / desactivar blockchain

En `.env`:
```env
STELLAR_ENABLED=true    # true = blockchain activa, false = modo stub
```

Con `false`, el sistema funciona exactamente igual pero sin tocar Stellar. Útil para desarrollo local sin conexión.

### Pasar a Mainnet

1. Crear cuenta Stellar real con al menos ~10 XLM
2. Actualizar `.env`:
   ```env
   STELLAR_NETWORK=mainnet
   STELLAR_PUBLIC_KEY=<nueva clave>
   STELLAR_SECRET_KEY=<nueva clave secreta>
   ```
3. Correr `npm run stellar:deploy` → retorna nuevo `SOROBAN_CONTRACT_ID`
4. Actualizar `SOROBAN_CONTRACT_ID` en `.env`

No hay cambios de código necesarios.

---

## Comandos de referencia

```bash
# Backend
cd backend
npm start                    # Producción (puerto 3001)
npm run dev                  # Desarrollo con hot reload
npm run seed                 # Crear tablas + datos iniciales
npm run stellar:cuenta       # Generar keypair y fondear en testnet
npm run stellar:deploy       # Compilar contrato y deployar

# Frontend
cd frontend
npm run dev                  # Desarrollo (puerto 5173)
npm run build                # Build de producción

# Contrato Rust
cd backend/src/services/blockchain/contrato_donaciones
cargo build --target wasm32-unknown-unknown --release   # Compilar WASM
cargo test                                               # Correr tests

# Docker MySQL
docker start accion-mysql    # Iniciar contenedor existente
docker stop accion-mysql     # Detener
docker logs accion-mysql     # Ver logs
```

---

## Guía de la hackathon (referencia)

En `stellar-guide-vendimia-tech/` hay documentación de Vendimia Tech 2026 que sirvió de referencia para la integración Stellar. Documentos relevantes:

- `Setup_Dev.md` — cómo configurar Stellar CLI y Soroban
- `Recursos_Hackathon.md` — protocolos DeFi en Stellar, anchors, repos de ejemplo
- `Lendara_Protocol.md` — SDK de inversiones tokenizadas (`@lendara/sdk`)
- `Prompts_Iniciales.md` — prompts útiles para trabajar con Claude Code en proyectos Stellar

---

## Lo que falta

### Biometría del receptor
El campo `receiver_identifier` hoy acepta texto libre (DNI, nombre, código). Cuando se integre biometría:
- El frontend enviará el dato biométrico
- El backend calcula SHA-256 igual, sin cambios estructurales
- El `receiver_hash` ya se guarda en cada distribución

### Mainnet
Ver sección arriba. Solo variables de entorno y un deploy.

### Freighter Wallet (opcional)
Si se quiere que los receptores o donantes firmen transacciones desde el navegador, integrar `@stellar/freighter-api`. Por ahora la cuenta operadora firma todo desde el backend.
