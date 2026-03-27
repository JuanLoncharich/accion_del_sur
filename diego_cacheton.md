# Sistema Acción del Sur — Resumen del Plan Blockchain SFT

    ## Contexto general

    Sistema de gestión de donaciones para una ONG. Los productos físicos (alimentos,
    ropa, medicamentos) pasan por centros de distribución antes de llegar a beneficiarios.
    La blockchain garantiza que cada movimiento sea verificable públicamente.

    ---

    ## El problema que resolvemos

    El sistema anterior tenía tres contratos Soroban desconectados entre sí:
    - `contrato_donaciones`: minteaba tokens
    - `contrato_entregas`: registraba distribuciones
    - `contrato_centro`: gestionaba inventario por centro

    Estos contratos no se comunicaban. El token creado en donaciones nunca "viajaba"
    a los centros. No había cadena de custodia criptográfica. Eran registros paralelos
    sin vinculación.

    Además, el sistema tenía "graceful degradation": si blockchain fallaba, igual
    guardaba en MySQL. Esto creaba ítems que el frontend mostraba pero que no podían
    verificarse en blockchain — exactamente lo que no queremos.

    ---

    ## Decisiones arquitectónicas clave

    ### 1. Un contrato SFT para todo

    Reemplazamos los tres contratos por uno solo: `contrato_sft`.
    Semi-Fungible Token (como ERC-1155): un tipo de token por tipo de ítem,
    balance acumulable, transferible entre centros, destruible al entregar.

    ### 2. token_id = SHA256(item_id)

    El `item_id` ya es el identificador canónico de un *tipo* de producto en la DB
    (ej. "Arroz 1kg marca Los Andes"). Usarlo como semilla del hash hace que:
    - Todas las donaciones del mismo ítem acumulan balance en el mismo token
    - No hay nonces ni ambigüedad
    - El token_id es determinista y reproducible desde cualquier punto

    ### 3. Muchos mints del mismo token — eso es correcto

    Cada vez que llega físicamente una donación del mismo ítem, se llama
    `mint(centroA, token_arroz, cantidad_aceptada)`.
    El contrato hace `balance += cantidad`. Es el patrón SFT estándar.
    Los 50kg de enero y los 30kg de marzo son fungibles entre sí
    (ambos son "arroz aceptado de calidad suficiente").

    ### 4. El mint ocurre en la recepción física, no en el registro

    `donationController.create` = intención de donación (el ítem aún no llegó físicamente).
    `donationReceptionController.finalize` = ítem físicamente recibido y contado.

    El token solo se mintea cuando hay cantidades aceptadas confirmadas.
    Mintear antes crearía tokens de promesas no cumplidas.

    ### 5. El historial de movimientos son eventos Soroban

    El contrato SFT emite un evento en cada `mint`, `transfer` y `burn`.
    Estos eventos quedan en Stellar y son consultables via Horizon API / Soroban RPC
    con `getEvents(contractId, topic_filter)`.

    El frontend de trazabilidad consume un endpoint `/api/blockchain/items/:itemId/trace`
    que filtra eventos por `token_id` (topic[1] = BytesN<32> del token).

    Resultado visual:
    Arroz 1kg — token: abc123...
      ✅ 15 ene — Recibido: 45 unidades en Centro Norte  [tx: AAA...]
      ✅ 20 ene — Transferido: 20 unidades → Centro Sur  [tx: BBB...]
      ✅ 25 ene — Entregado a beneficiario: 5 unidades   [tx: CCC...]
      Balance actual: Centro Norte: 25 | Centro Sur: 15

    ### 6. Cada centro tiene su propio contrato (centro_v2)

    `contrato_centro_v2` es solo metadata del centro (nombre, coords, geo_hash).
    El balance real lo da el SFT via `balance_of(centro_address, token_id)`.
    El contrato de centro ya no gestiona inventario — eso lo hace el SFT.

    ### 7. Blockchain-first: sin fallback, sin graceful degradation

    Si blockchain falla → endpoint retorna 503 → MySQL NO se toca.
    No existen estados "pending", "failed" ni "sft_failed".
    Un registro en la DB = está verificado en blockchain.

    Flujo en cada controlador:
    1. Validar request
    2. Calcular hashes off-chain (rápido, no falla)
    3. Llamar al contrato SFT (await confirmación)
    4. Si falla → throw → middleware retorna 503, nada guardado
    5. Si ok → abrir transacción MySQL → guardar con blockchain_tx_id → commit

    Si `STELLAR_ENABLED=false` (desarrollo local) → funciona sin blockchain normalmente.
    Solo en producción con `STELLAR_ENABLED=true` blockchain es obligatorio.

    ### 8. Autorización: admin keypair firma todo

    El backend tiene un único `STELLAR_SECRET_KEY`. Ese keypair es el `admin`
    del contrato SFT. Todas las operaciones (mint, transfer, burn) requieren
    `admin.require_auth()` en el contrato Rust.

    La firma digital del receptor en el teléfono (cuando se implementa) será
    evidencia off-chain: su hash se almacena como parámetro en el evento de blockchain,
    no como keypair Stellar.

    ---

    ## Ciclo de vida completo de un token

    [DONADOR entrega físicamente]
      ↓
    finalize DonationReception
      → sftService.mintToCenter(centroA, token_arroz, 45)
      → Evento Stellar: {mint, token_arroz, centroA, 45, firma_operador}
      → MySQL: DonationReception con anchored_tx_id
      → centroA.balance[token_arroz] = 45

    [TRANSFERENCIA Centro A → Centro B]
      → sftService.transferBetweenCenters(centroA, centroB, token_arroz, 20)
      → Evento Stellar: {transfer, token_arroz, centroA, centroB, 20}
      → MySQL: TokenTransfer con blockchain_tx_id
      → centroA.balance = 25, centroB.balance = 20

    [DISTRIBUCIÓN a beneficiario]
      → sftService.burnForDistribution(centroB, token_arroz, 5, commitment, sig_hash)
      → Evento Stellar: {burn, token_arroz, centroB, 5, commitment, sig_hash}
      → MySQL: Distribution con blockchain_tx_id, item.quantity -= 5
      → centroB.balance = 15, supply_total -= 5

    ---

    ## Lo que se implementa

    ### Rust (nuevo contrato)
    - `contrato_sft/src/lib.rs`: funciones `initialize`, `mint`, `transfer`, `burn`,
      `balance_of`, `total_supply`, `get_token`, `get_inventory`
    - Errores tipados: `InsufficientBalance`, `TokenNotFound`, `Unauthorized`, `AlreadyInitialized`
    - Eventos en cada operación de estado
    - Tests unitarios cubriendo happy path y casos de error

    ### Node.js (nuevo servicio)
    - `sftService.js`: wrapper sobre la infraestructura de `stellarService`
    - `computeTokenId(itemId)` → SHA256 determinista
    - `mintToCenter`, `transferBetweenCenters`, `burnForDistribution`
    - `getBalance`, `getCenterInventory`, `getTokenTrace`

    ### Controladores modificados
    - `donationController.create`: elimina llamada blockchain (ya no mintea aquí)
    - `donationReceptionController.finalizeInternal`: mint blockchain-first,
      requiere `center_id` en el body para saber dónde mintear
    - `distributionController.finalize`: burn blockchain-first,
      usa `item.current_center_id` para saber qué centro quema
    - `transferController.create`: transfer blockchain-first

    ### Deploy
    - Upload WASM SFT → `SFT_WASM_HASH`
    - Deploy instancia → `initialize(admin_pubkey)` → `SOROBAN_CONTRACT_SFT`
    - Re-deploy `contrato_centro_v2` para cada centro existente
    - Variables eliminadas: `SOROBAN_CONTRACT_DONACIONES`, `SOROBAN_CONTRACT_ENTREGAS`, `CENTRO_WASM_HASH`

    ---

    ## Datos legacy

    Las donaciones anteriores a la fecha de corte se marcan `status = 'legacy'` en MySQL.
    No se migran retroactivamente a la blockchain.
    El dashboard muestra ambos datasets separados: "Legacy (solo DB)" y "SFT (verificable)".

    ---

    ## Lo que queda pendiente para después

    - Firma digital del receptor desde el teléfono móvil (hash → parámetro del burn)
    - Reemplazar datos mock en `HistorialTransacciones.jsx` y `AuditoriaIntegridad.jsx`
    - Endpoint `/api/blockchain/items/:itemId/trace` conectado a eventos Soroban reales
    - Script de migración de centros existentes a `contrato_centro_v2`
