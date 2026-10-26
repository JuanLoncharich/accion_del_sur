# Blockchain: trazabilidad en Stellar/Soroban

## Idea general

El inventario se representa como **tokens semi-fungibles (SFT)**. Cada insumo tiene un token y
cada centro tiene un saldo de ese token. La regla que mantiene el sistema es:

> **El saldo on-chain de un centro para un insumo es igual al stock de ese insumo en la base de
> datos, cuando el insumo está ubicado en ese centro.**

Así, cualquiera puede comparar lo que declara la aplicación con lo que hay en la blockchain, que
es pública y no se puede modificar retroactivamente.

| Operación en la aplicación | Operación on-chain | Efecto |
|---|---|---|
| Alta de centro | despliegue de un `contrato_centro` | el centro obtiene su dirección `C…` |
| Donación registrada | `mint` en `contrato_sft` | sube el saldo del centro |
| Recepción con QR finalizada | `mint` + anclaje en `contrato_entregas` | sube el saldo; el detalle queda verificable |
| Transferencia entre centros | `transfer` en `contrato_sft` | el saldo pasa de un centro a otro |
| Envío confirmado | `burn` en `contrato_sft` | baja el saldo (la ayuda salió del inventario) |

## Contratos (`contracts/`)

Workspace de Cargo con tres contratos (`soroban-sdk` 22). La cuenta que los despliega es la
**administradora** (`STELLAR_SECRET_KEY` del backend) y es la única que puede escribir en ellos.

### `contrato_sft` — inventario como tokens

- `initialize(admin)` — una sola vez.
- `mint(to, token_id, metadata, cantidad, firma_hash)` — admin.
- `transfer(from, to, token_id, cantidad, motivo_hash)` — admin; falla si no hay saldo.
- `burn(from, token_id, cantidad, recipient_commitment, signature_hash, operator_id)` — admin.
- Lecturas: `balance_of(owner, token_id)`, `total_supply(token_id)`, `get_token(token_id)`,
  `get_inventory(center)`.
- Emite eventos `mint` / `transfer` / `burn` con el `token_id` como segundo topic.

`token_id = SHA-256(item_id como u64 big-endian)`: es determinista, así que se puede recalcular
desde el id del insumo. La metadata (`item_id`, `categoria`, `nombre`, `attributes_hash`) se
guarda la primera vez que se mintea.

### `contrato_entregas` — anclaje de recepciones

- `initialize(admin)`.
- `registrar_entrega_verificada(id, item_id, cantidad, recipient_commitment, signature_hash,
  receipt_hash, operator_id, assurance_level, lat_e6, lng_e6)` — admin; **no permite sobrescribir**
  un id ya registrado.
- `verificar_hashes(id, signature_hash, receipt_hash)` y `obtener_entrega(id)` — públicas.

Al finalizar una recepción con QR, el backend calcula un hash del detalle (qué se recibió, qué se
aceptó, qué se rechazó y por qué) y lo ancla aquí con el id de la recepción. La página pública del
donante (`/confirmacion-donacion/:token`) puede verificar que el detalle mostrado coincide con lo
anclado. El email del donante nunca va on-chain: solo un compromiso con sal
(`backend/src/utils/cryptoEvidence.js`).

### `contrato_centro` — identidad de cada centro

Se despliega una instancia por centro a partir del mismo WASM (`CENTRO_WASM_HASH`). El constructor
recibe el nombre, las coordenadas y un hash de los datos del centro, así que despliegue e
inicialización son una sola operación. Su dirección es la "cuenta" que acumula saldos en el SFT.
Lectura: `obtener_info()`.

## Implementación en el backend

| Archivo | Rol |
|---|---|
| `backend/src/services/blockchain/stellarService.js` | Conexión al RPC, firma, envío y polling de transacciones; despliegue de WASM y contratos; anclaje de recepciones. |
| `backend/src/services/blockchain/sftService.js` | Operaciones del contrato SFT (mint, transfer, burn, consultas). |
| `backend/src/services/blockchain/anclaje.js` | Reglas de negocio: qué operación on-chain corresponde a cada movimiento. |

**La base de datos es la fuente de verdad operativa.** Cada operación se confirma primero en
MySQL (en una transacción) y después se ancla. Si la red no responde, la operación **no se pierde
ni se bloquea**: queda con estado `local` y se repara después con `npm run stellar:sincronizar`.

Cada registro guarda su estado y el hash de la transacción:

| Tabla | Columnas |
|---|---|
| `donaciones` | `blockchain_status`, `blockchain_tx` |
| `envios` / `detalles_envio` | `blockchain_status` / `blockchain_tx` (una tx de burn por línea) |
| `transfers` | `status`, `egreso_blockchain_tx` |
| `recepciones` | `blockchain_tx` (anclaje) |
| `centros_recepcion` | `blockchain_contract_id`, `blockchain_deploy_tx` |
| `insumos` | `token_id` |

Estados posibles: `anchored` (confirmado on-chain), `local` (falló o el centro no tiene contrato),
`disabled` (blockchain apagada).

### Verificación

`GET /api/items/:id/trazabilidad` devuelve la línea de tiempo del insumo, con el hash de cada
transacción, y consulta en vivo `balance_of` del centro actual para compararlo con el stock. En el
frontend: **Inventario → Ver trazabilidad**. Cada transacción enlaza a
[stellar.expert](https://stellar.expert/explorer/testnet).

## Puesta en marcha

Requisitos para compilar: Rust, el target `wasm32v1-none` y (opcional)
[Stellar CLI](https://developers.stellar.org/docs/tools/cli). El servidor solo necesita Node: los
WASM se pueden compilar en otra máquina y copiar a `contracts/target/wasm32v1-none/release/`.

```bash
# 1. Compilar y testear los contratos
cd contracts
cargo test
stellar contract build              # o: rustup target add wasm32v1-none && cargo build --target wasm32v1-none --release

# 2. Cuenta administradora (testnet, fondeada con Friendbot) → backend/.env
cd ../backend
npm run stellar:cuenta

# 3. Desplegar contrato_sft y contrato_entregas, subir el WASM de centro → backend/.env
npm run stellar:desplegar

# 4. Desplegar los contratos de los centros existentes y cargar el stock actual on-chain
npm run stellar:sincronizar

# 5. Reiniciar el backend para que lea el .env nuevo
```

`npm run stellar:sincronizar` es idempotente: compara saldo on-chain con stock en la base y
mintea o quema solo la diferencia. `-- --verificar` informa diferencias sin escribir nada, y
`-- --reiniciar` redespliega todos los centros (necesario si se cambia el contrato SFT).

Variables (`backend/.env`): `STELLAR_ENABLED`, `STELLAR_NETWORK`, `STELLAR_PUBLIC_KEY`,
`STELLAR_SECRET_KEY`, `SOROBAN_CONTRACT_SFT`, `SOROBAN_CONTRACT_ENTREGAS`, `CENTRO_WASM_HASH` y,
opcionales, `STELLAR_RPC_URL`, `STELLAR_TX_TIMEOUT_SEC`, `STELLAR_POLL_INTERVAL_MS`.

## Despliegue actual (testnet, 2026-10-26)

| | Dirección |
|---|---|
| Cuenta admin | [`GA2SCJHHGLOH7ZPU2O6C2SFC373WXVOK3ZPN4VDH2676GPRJVHECQN6H`](https://stellar.expert/explorer/testnet/account/GA2SCJHHGLOH7ZPU2O6C2SFC373WXVOK3ZPN4VDH2676GPRJVHECQN6H) |
| `contrato_sft` | [`CCKAGSZAB5L6WHN647S3BGJF4AADRNEBUF4YZ2MF5YIPYCMQPHK62OKK`](https://stellar.expert/explorer/testnet/contract/CCKAGSZAB5L6WHN647S3BGJF4AADRNEBUF4YZ2MF5YIPYCMQPHK62OKK) |
| `contrato_entregas` | [`CDXHZXBITYV6MV5F32IO4UGPZBEWZWNESXV54U25AF2OBSHBYYOQHSYZ`](https://stellar.expert/explorer/testnet/contract/CDXHZXBITYV6MV5F32IO4UGPZBEWZWNESXV54U25AF2OBSHBYYOQHSYZ) |
| WASM de `contrato_centro` | `697144e9e7f40c565a3d003ab9deb05534f93b73eedd8e3161fe73ae89954c66` |

La clave secreta solo está en `backend/.env` de la VM. El equipo que reciba el proyecto debería
generar **su propia cuenta** (`npm run stellar:cuenta -- --forzar`) y redesplegar.

**Testnet se reinicia periódicamente** (Stellar la resetea cada algunos meses): cuando eso pase,
hay que repetir los pasos 2 a 4. La base de datos no se ve afectada.

## Limitaciones conocidas

- **Eventos del RPC**: el RPC público de Soroban retiene eventos por unos 7 días. Por eso la
  trazabilidad se arma con los hashes guardados en la base (que no vencen) y no con eventos. Para
  consultar eventos históricos hace falta un indexador propio o un explorador como stellar.expert.
- **Transferencias**: una transferencia mueve la ubicación del insumo completo
  (`insumos.current_center_id`). Si se transfiere solo una parte del stock, el saldo on-chain
  queda bien, pero la base considera todo el insumo en el centro destino. Corregirlo requiere
  modelar stock por centro (ver [estado-y-pendientes.md](estado-y-pendientes.md)).
- **Identidad del centro**: los datos del `contrato_centro` se fijan al desplegarlo. Renombrar un
  centro en la aplicación no actualiza el contrato.
- **Custodia**: el backend firma todas las operaciones con una sola cuenta admin. La blockchain
  garantiza que el registro no se altere después, no que lo cargado sea verdad. La confianza está
  en la cuenta admin; si se filtra su clave, hay que rotarla y redesplegar.
- **Costos**: en testnet son gratis. En mainnet cada operación cuesta una fracción de XLM y la
  cuenta admin debe tener fondos.
