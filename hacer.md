PLAN DE MIGRACIÓN A SFT — DECISIONES RESUELTAS

OBJETIVO

Reemplazar los 3 contratos desconectados actuales por un único contrato SFT donde el
token viaja criptográficamente desde la recepción física hasta el beneficiario final.
Blockchain es obligatorio: si falla, el sistema no guarda nada.

---
DECISIONES ARQUITECTÓNICAS

token_id
  SHA256(item_id) — uno por tipo de ítem en la DB.
  Todas las donaciones del mismo ítem acumulan balance en el mismo token.
  Determinista: se recalcula en cualquier momento desde el item_id.

Historial de movimientos
  El contrato SFT emite eventos nativos de Soroban en cada mint/transfer/burn.
  Consultables via Horizon API con la dirección del contrato.
  El contrato_centro_v2 solo guarda metadata del centro (nombre, coords).
  No hay vectores de movimientos en storage — los eventos son el audit trail.

Cuándo se mintea el token
  En donationReceptionController.finalize — cuando el ítem llega físicamente y
  se confirman las quantities_accepted. NO en donationController.create (eso
  es solo un registro de intención, antes de la entrega física).

Autorización en blockchain
  El backend firma todo con el admin keypair (STELLAR_SECRET_KEY).
  La firma digital del receptor en el teléfono es evidencia off-chain:
  su hash se guarda como parámetro en el evento de blockchain.

Sin graceful degradation
  Blockchain falla → endpoint retorna 503 → MySQL no se toca.
  No existen registros pending, failed ni sft_failed.
  Un registro en la DB = está verificado en blockchain.
  Flujo en cada controlador:
    1. Calcular hashes (off-chain)
    2. Llamar SFT (await confirmación)
    3. Si falla → throw → 503
    4. Si ok → abrir tx MySQL → guardar con blockchain_tx_id → commit

---
CONTRATO SFT — ESPECIFICACIÓN

Archivo: backend/src/services/blockchain/contrato_sft/src/lib.rs

Storage keys:
  Admin                          → Address del administrador
  Token(BytesN<32>)              → TokenMetadata (item_id, categoria, nombre, attributes_hash)
  Balance(Address, BytesN<32>)  → u64 (balance de un centro para un token)
  Supply(BytesN<32>)             → u64 (supply total del token)

Funciones:
  initialize(admin: Address)
  mint(to, token_id, metadata, cantidad, firma_hash)
    → evento: topic ["mint", token_id], data {to, cantidad, firma_hash}
  transfer(from, to, token_id, cantidad, motivo_hash)
    → evento: topic ["transfer", token_id], data {from, to, cantidad, motivo_hash}
  burn(from, token_id, cantidad, recipient_commitment, signature_hash, operator_id)
    → evento: topic ["burn", token_id], data {from, cantidad, recipient_commitment, signature_hash}
  balance_of(owner, token_id) → u64       (readonly)
  get_token(token_id) → TokenMetadata     (readonly)
  get_inventory(center) → Vec<BytesN<32>> (readonly)

Auth:
  mint y burn: admin.require_auth()
  transfer: from.require_auth() — el admin keypair firma, cumple la condición

Errores (no panic):
  1 = InsufficientBalance
  2 = TokenNotFound
  3 = Unauthorized
  4 = AlreadyInitialized

---
CONTRATO CENTRO V2 — ESPECIFICACIÓN

Archivo: backend/src/services/blockchain/contrato_centro_v2/src/lib.rs

Storage:
  Metadata → { name, lat_e6, lng_e6, geo_hash, sft_contract }
  Initialized → bool

Funciones:
  initialize(name, lat_e6, lng_e6, geo_hash, sft_contract)
  get_metadata() → CenterMetadata

No tiene inventario propio. El balance real lo da SFT.balance_of(centro_address, token_id).

---
FASES DE IMPLEMENTACIÓN

FASE 1 — Contrato SFT (Rust)
  - Crear contrato_sft/ con structs, funciones y eventos según especificación
  - Tests unitarios:
      test_mint_and_balance
      test_transfer_updates_balances
      test_burn_reduces_supply
      test_insufficient_balance (error, no panic)
      test_unauthorized (error, no panic)
      test_same_item_same_token_id
  - Compilar WASM

FASE 2 — sftService.js
  - Crear backend/src/services/blockchain/sftService.js
  - Reutiliza stellarService._invocarContrato() y _pollTransaccion()
  - Métodos:
      computeTokenId(itemId) → SHA256(item_id) como hex
      mintToCenter({ toCenterAddress, tokenId, metadata, cantidad, firmaHash })
      transferBetweenCenters({ fromAddress, toAddress, tokenId, cantidad, motivoHash })
      burnForDistribution({ fromAddress, tokenId, cantidad, recipientCommitment, signatureHash, operatorId })
      getBalance(centerAddress, tokenId) → u64
      getCenterInventory(centerAddress) → array de token_ids

FASE 3 — Deploy en testnet
  - Upload WASM SFT → guardar SFT_WASM_HASH en .env
  - Deploy instancia SFT → initialize(admin_pubkey) → guardar SOROBAN_CONTRACT_SFT
  - Re-deploy centro_v2 para cada centro existente → actualizar blockchain_contract_id en DB
  - Variables nuevas: SOROBAN_CONTRACT_SFT, SFT_WASM_HASH
  - Variables a eliminar: SOROBAN_CONTRACT_DONACIONES, SOROBAN_CONTRACT_ENTREGAS, CENTRO_WASM_HASH

FASE 4 — Actualizar controladores

  donationReceptionController.finalize (mint):
    - Por cada ítem aceptado: computeTokenId(item_id) → mintToCenter()
    - Si cualquier mint falla → 503, nada guardado
    - Si todos ok → MySQL transaction → commit con blockchain_tx_id

  distributionController.finalize (burn):
    - computeTokenId(item_id) → burnForDistribution()
    - Si falla → 503
    - Si ok → MySQL → actualizar stock → guardar tx_id → commit

  transferController.create (transfer):
    - computeTokenId(item_id) → transferBetweenCenters()
    - Si falla → 503
    - Si ok → MySQL → guardar TokenTransfer con tx_id → commit

  donationController.create:
    - Eliminar llamada a stellarService.mintDonationToken() — ya no mintea aquí

FASE 5 — Limpiar código viejo
  - Mover contrato_donaciones/, contrato_entregas/, contrato_centro/ a contratos_legacy/
    (no borrar — necesarios para entender blockchain_hash en registros históricos)
  - Eliminar de stellarService.js: mintDonationToken, recordVerifiedDistribution,
    anchorDonationReception, registrarIngresoCentro, registrarEgresoCentro,
    verifyToken, getVerifiedDistribution, verifyDeliveryHashes, obtenerInventarioCentro
  - Mantener en stellarService.js: _init(), _invocarContrato(), _pollTransaccion(), helpers
  - Registrar rutas /transfers y /centers en server.js si no están activas
  - Eliminar campo token_status de Item (ya no hay estados intermedios)

FASE 6 — Datos legacy
  - Donaciones antes de fecha de corte: donation.status = 'legacy'
  - No mintear retroactivamente
  - Dashboard: separar "legacy (solo DB)" de "SFT (verificable en blockchain)"

FASE 7 — Frontend
  - HistorialTransacciones.jsx: reemplazar mockBlockchainData por API real
  - AuditoriaIntegridad.jsx: reemplazar mock por datos reales
  - Badge "Verificado en blockchain" solo si blockchain_tx_id existe

---
ARCHIVOS CRÍTICOS

  CREAR:
    backend/src/services/blockchain/contrato_sft/src/lib.rs
    backend/src/services/blockchain/sftService.js

  MODIFICAR:
    backend/src/services/blockchain/stellarService.js  (eliminar métodos alto nivel)
    backend/src/controllers/donationReceptionController.js  (mint aquí, blockchain-first)
    backend/src/controllers/distributionController.js  (burn, blockchain-first)
    backend/src/controllers/transferController.js  (transfer SFT, blockchain-first)
    backend/src/controllers/donationController.js  (eliminar mintDonationToken)
    backend/server.js  (registrar rutas transfers y centers)
    backend/.env.example  (actualizar variables)
    frontend/src/pages/HistorialTransacciones.jsx
    frontend/src/pages/AuditoriaIntegridad.jsx

  MOVER (no borrar):
    backend/src/services/blockchain/contrato_donaciones/ → contratos_legacy/
    backend/src/services/blockchain/contrato_entregas/   → contratos_legacy/
    backend/src/services/blockchain/contrato_centro/     → contratos_legacy/

---
VERIFICACIÓN

  1. Recibir donación → POST /donation-receptions/:id/finalize
     → respuesta contiene blockchain_tx_id
     → consultar evento en Horizon testnet con contract address

  2. Transferir entre centros → POST /transfers
     → getBalance(centroA) disminuyó, getBalance(centroB) aumentó

  3. Distribuir a beneficiario → POST /distributions/:id/finalize
     → supply del token disminuyó (burn confirmado)

  4. Simular fallo blockchain (contract id inválido)
     → endpoint retorna 503
     → MySQL no tiene el registro nuevo

---
ROLLBACK

  Trigger: más del 10% de operaciones fallan con SFT

  Procedimiento:
    1. SFT_ENABLED=false en .env
    2. Los contratos legacy siguen deployados en testnet/mainnet (no se destruyen)
    3. Revertir controladores a usar stellarService viejo
    4. Marcar registros SFT en MySQL como sft_rollback
    5. Data gap documentado para el equipo
