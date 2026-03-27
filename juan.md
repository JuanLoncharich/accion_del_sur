PLAN DE MIGRACIÓN A SFT (SEMI-FUNGIBLE TOKENS)

  OBJETIVO

  Transformar el sistema de registro de eventos a un modelo de tokens transferibles donde los
  centros son dueños de los tokens y las transferencias representan el movimiento físico de ítems.

  ---
  FASE 1: DISEÑO DEL CONTRATO SFT

  1.1 Especificación del Contrato Único SFT

  - Nombre: SupplyChainSFT
  - Funcionalidad principal: Gestión de tokens semi-fungibles representando ítems de inventario
  - Storage keys:
    - Token(BytesN<32>) → Metadata del token (item_id, categoría, nombre, attributes_hash,
  ubicación)
    - Balance(Address, BytesN<32>) → Balance de tokens por dirección (centro)
    - Supply(BytesN<32>) → Supply total de cada token
    - Admin → Dirección del administrador del sistema
    - TransferCounter → Contador para generar token_ids únicos

  1.2 Funciones Principales

  - initialize(admin: Address) - Configurar administrador
  - mint(to: Address, item_id, metadata, cantidad, lat, lng) → token_id - Crear tokens y asignar a
  centro
  - transfer(from: Address, to: Address, token_id, cantidad, motivo) - Mover tokens entre centros
  - burn(from: Address, token_id, cantidad, recipient_commitment, signature_hash, operator_id) -
  Destruir tokens (entrega final)
  - balance_of(owner: Address, token_id) → u64 - Consultar balance
  - total_supply(token_id) → u64 - Supply total de un token
  - get_token(token_id) → TokenBatch - Metadata del token
  - get_inventory(center: Address) → Vec<BytesN<32>> - Tokens con balance > 0 de un centro

  1.3 Identificación de Tokens Idénticos

  - token_id = SHA256(item_id + attributes_hash + center_lat + center_lng + nonce)
  - Dos ítems con mismos atributos → mismo attributes_hash → mismo token_id si coinciden ubicación y
   batch
  - Balance acumulado: 50 unidades + 20 unidades = 70 unidades del mismo token

  ---
  FASE 2: CONTRATO CENTRO V2 (SIMPLIFICADO)

  2.1 Propósito

  - Solo almacena metadata del centro (nombre, coordenadas, geo_hash)
  - Referencia al contrato SFT
  - NO gestiona inventario (lo hace el SFT via balance_of)

  2.2 Estructura

  - Storage:
    - Metadata → { name, lat_e6, lng_e6, geo_hash, sft_contract }
    - Initialized → bool

  2.3 Funciones

  - initialize(name, lat_e6, lng_e6, geo_hash, sft_contract) - Configurar centro
  - get_metadata() → CenterMetadata - Obtener info del centro
  - get_balance(token_id) → u64 - Proxy a SFT.balance_of(this_address, token_id)

  ---
  FASE 3: SERVICIO BACKEND SFT

  3.1 Archivo Nuevo: sftService.js

  - Wrapper para interactuar con contrato SFT
  - Métodos principales:
    - mintToCenter({item, quantity, centerContractId, attributes})
    - transferBetweenCenters({fromCenterContractId, toCenterContractId, tokenId, cantidad, motivo})
    - burnForDistribution({centerContractId, tokenId, cantidad, recipientCommitment, signatureHash, 
  operatorId})
    - getBalanceOfCenter(centerContractId, tokenId)
    - getCenterInventory(centerContractId)
  - Manejo de errores con graceful degradation
  - Conversión de coordenadas a microgrados
  - Hash de atributos JSON ordenado alfabéticamente

  ---
  FASE 4: ACTUALIZACIÓN DE CONTROLADORES

  4.1 Cambios en donationController.create

  Antes:
  - Llamaba a stellarService.mintDonationToken() (contrato donaciones)

  Después:
  - Busca centro por nombre/coordenadas
  - Valida que center.blockchain_contract_id exista
  - Llama a sftService.mintToCenter()
  - Guarda token_id (no hash genérico) en item.blockchain_hash y donation.blockchain_hash

  Condición: Solo para donaciones nuevas (created_at ≥ fecha de corte)

  4.2 Cambios en distributionController.finalize

  Antes:
  - Llamaba a stellarService.recordVerifiedDistribution() (contrato entregas)

  Después:
  - Obtiene tokenId de item.blockchain_hash
  - Valida que el centro tenga contrato blockchain
  - Llama a sftService.burnForDistribution()
  - Actualiza stock en MySQL
  - Guarda TX hash en distribution.blockchain_tx_id

  4.3 Eliminación de Integraciones Viejas

  - Remover llamadas a stellarService.mintDonationToken()
  - Remover llamadas a stellarService.recordVerifiedDistribution()
  - Remover llamadas a stellarService.registrarIngresoCentro() y registrarEgresoCentro()
  - Eliminar contratos viejos del código (mantener solo como referencia)

  4.4 Graceful Degradation

  - Si blockchain falla: marcar con status sft_failed
  - El sistema continúa operando con MySQL
  - Log de error para debugging

  ---
  FASE 5: DEPLOY DE NUEVOS CONTRATOS

  5.1 Compilación

  cd backend/src/services/blockchain/contrato_sft
  cargo build --target wasm32-unknown-unknown --release

  5.2 Upload a Stellar Testnet

  - Subir WASM del contrato SFT
  - Guardar SFT_WASM_HASH en variables de entorno

  5.3 Deploy Contrato SFT

  - Crear instancia del contrato SFT
  - Ejecutar initialize(admin_address)
  - Guardar SOROBAN_CONTRACT_SFT en .env

  5.4 Redesplegar Contratos Centro

  - Para cada centro existente:
    - Deploy nueva instancia de contrato centro_v2
    - Ejecutar initialize() con SFT contract address
    - Actualizar center.blockchain_contract_id en MySQL

  ---
  FASE 6: MIGRACIÓN DE CENTROS EXISTENTES

  6.1 Script de Migración de Centros

  - Leer todos los centros de MySQL con blockchain_contract_id no NULL
  - Para cada centro:
    - Desplegar nuevo contrato centro_v2
    - Inicializar con metadata del centro + SFT contract address
    - Actualizar blockchain_contract_id con nueva dirección
    - Guardar TX hash en blockchain_deploy_tx
    - Marcar contrato viejo como "deprecated" en logs

  6.2 Validación

  - Verificar que todos los centros tengan contrato válido
  - Probar get_metadata() en cada contrato
  - Verificar balance inicial = 0 para todos los tokens

  ---
  FASE 7: DATOS HISTÓRICOS

  7.1 Decisión: NO MIGRAR

  - Las donaciones anteriores a fecha de corte quedan como "legacy"
  - Marcar en MySQL:
    - donation.status = 'legacy' WHERE created_at < fecha_corte
    - item.token_status = 'legacy' WHERE blockchain_hash NULL y created_at < fecha_corte
  - El contrato donaciones viejo se mantiene en READ-ONLY para auditoría

  7.2 Acceso a Datos Históricos

  - Consultas de inventario:
    - Donaciones nuevas: leer balance del SFT
    - Donaciones viejas: sumar donation.quantity de MySQL
  - Dashboard: Mostrar ambos datasets por separado

  7.3 Herramienta Administrativa (Opcional)

  - Script para migrar donaciones específicas bajo demanda
  - Requiere aprobación manual de administrador
  - Marca donación como migrated_to_sft = true

  ---
  FASE 8: ELIMINACIÓN DE CONTRATOS VIEJOS

  8.1 Contratos a Eliminar del Código

  1. contrato_donaciones (/backend/src/services/blockchain/contrato_donaciones/)
    - Eliminar carpeta después de confirmar que no hay referencias
  2. contrato_entregas (/backend/src/services/blockchain/contrato_entregas/)
    - Eliminar carpeta
  3. contrato_centro (versión vieja) (/backend/src/services/blockchain/contrato_centro/)
    - Eliminar carpeta (reemplazada por contrato_centro_v2)

  8.2 Limpieza de Código

  - Eliminar métodos obsoletos de stellarService.js:
    - mintDonationToken()
    - recordVerifiedDistribution()
    - verifyToken()
    - getVerifiedDistribution()
    - verifyDeliveryHashes()
    - anchorDonationReception()
    - registrarIngresoCentro()
    - registrarEgresoCentro()
    - obtenerInventarioCentro()
  - Mantener solo:
    - _invocarContrato() (método genérico)
    - _pollTransaccion()
    - Helpers de conversión

  8.3 Actualización de Variables de Entorno

  - Eliminar:
    - SOROBAN_CONTRACT_DONACIONES
    - SOROBAN_CONTRACT_ENTREGAS
    - CENTRO_WASM_HASH
  - Agregar:
    - SOROBAN_CONTRACT_SFT
    - SFT_WASM_HASH

  ---
  FASE 9: TESTING

  9.1 Unit Tests (Rust)

  - test_mint_and_balance: Mintear tokens y verificar balance
  - test_transfer_between_centers: Transferir y verificar balances actualizados
  - test_burn_with_evidence: Burn y verificar supply reducido
  - test_insufficient_balance: Panic al transferir más del disponible
  - test_unauthorized_transfer: Panic sin autorización del from
  - test_identical_items_same_token: Verificar que items idénticos generan mismo token_id

  9.2 Integración (JavaScript)

  - Test mintToCenter(): Verificar mint correcto, balance actualizado, TX guardada
  - Test transferBetweenCenters(): Verificar transferencia, balances correctos
  - Test burnForDistribution(): Verificar burn, evidencia guardada
  - Test graceful degradation: Verificar fallback cuando blockchain falla
  - Test getCenterInventory(): Verificar listado de tokens

  9.3 End-to-End

  1. Flujo completo de donación:
    - Crear donación nueva
    - Verificar mint en SFT
    - Verificar balance en contrato centro
    - Consultar inventory del centro
  2. Flujo de transferencia:
    - Transferir entre centro A y centro B
    - Verificar balances actualizados
    - Verificar evento emitido
  3. Flujo de distribución:
    - Preparar distribución
    - Identificar destinatario
    - Capturar firma
    - Finalizar (burn)
    - Verificar supply reducido
    - Verificar stock actualizado en MySQL

  9.4 Edge Cases

  - Donación con centro sin contrato blockchain → error 400
  - Distribución con item sin token_id → error 400
  - Transferir más del balance disponible → panic en contrato
  - Blockchain caída → graceful degradation, status = sft_failed

  ---
  FASE 10: DEPLOY EN PRODUCCIÓN

  10.1 Pre-deploy

  - Backup completo de MySQL
  - Verificar que testnet funciona correctamente
  - Preparar script de rollback rápido

  10.2 Corte y Cambio

  1. Fecha/hora de corte: Definir timestamp exacto
  2. Deploy de contratos en mainnet:
    - Upload WASM SFT
    - Deploy contrato SFT
    - Inicializar con admin address
  3. Migrar centros a contratos v2
  4. Actualizar .env con nuevos contract IDs
  5. Deploy del código backend actualizado
  6. Verificar primera donación post-corte

  10.3 Post-deploy

  - Monitorear logs por 48 horas
  - Verificar que todas las donaciones nuevas usen SFT
  - Verificar graceful degradation si hay fallos
  - Documentar cualquier incidente

  ---
  FASE 11: ROLLBACK PLAN

  11.1 Trigger de Rollback

  - Más del 10% de donaciones fallan con SFT
  - Bug crítico en contrato SFT
  - Problemas de gas/stellar network

  11.2 Procedimiento

  1. Cambiar feature flag: SFT_ENABLED=false
  2. Reactivar contratos viejos (mantener deploy activos pero no usarlos)
  3. Revertir controladores a usar stellarService viejo
  4. Marcar datos SFT como sft_rollback en MySQL
  5. Notificar al equipo sobre data gap

  11.3 Prevención

  - Mantener contratos viejos en mainnet por 30 días
  - Script de rollback probado en testnet
  - Documentación de reversión accesible

  ---
  FASE 12: DOCUMENTACIÓN

  12.1 Actualizar flujos.md

  - Nueva sección: "Modelo SFT - Tokens Transferibles"
  - Actualizar diagramas de secuencia
  - Explicar que items idénticos comparten token_id
  - Documentar graceful degradation

  12.2 Guía de Operaciones

  - Cómo verificar balance de un centro
  - Cómo auditar transferencias entre centros
  - Cómo investigar donaciones fallidas
  - Cómo interpretar eventos del SFT

  12.3 API Documentation

  - Actualizar endpoints con nuevo modelo blockchain
  - Documentar nuevos campos en respuestas
  - Explicar diferencias entre donaciones legacy y SFT