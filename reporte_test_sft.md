# Reporte de Pruebas E2E — Plan SFT

**Fecha:** 2026-03-27T16:24:14.245Z
**Total:** 49 pruebas — **49 PASS** / **0 FAIL** (100.0% éxito)


## Configuración Blockchain

| Variable | Valor |
|----------|-------|
| STELLAR_ENABLED | true |
| STELLAR_NETWORK | testnet |
| SOROBAN_CONTRACT_SFT | CCISEHSBEQLCNKGCXGEM66VGXTCQVUDDUVWC77BG3RPH7MOVFWWHMFSL |
| Centro A | Centro Sur (id=2) → `CD6NMCOFQTPE5SWHVQMN5CAYA5X26LGYUL6TZVC4YGIG2TLTEWTNSALN` |
| Centro B | Centro Norte (id=1) → `CB3VW3JS56FDI2JJQTZAWRED25VGTEVDVZF7CJNNLF6KIKIIUU6MC32D` |
| Ítem de prueba | #1 "Alimentos - Arroz - 1kg" |


## Resultados Detallados

| Estado | Prueba | Detalle |
|--------|--------|---------|
| ✅ PASS | Login como admin | user_id=1 |
| ✅ PASS | STELLAR_ENABLED=true | STELLAR_ENABLED=true |
| ✅ PASS | SOROBAN_CONTRACT_SFT configurado | CCISEHSBEQLCNKGCXGEM66VGXTCQVUDDUVWC77BG3RPH7MOVFWWHMFSL |
| ✅ PASS | GET /api/centers/ | 2 centros |
| ✅ PASS | 2 centros con contrato blockchain | A=Centro Sur(2) B=Centro Norte(1) |
| ✅ PASS | GET /api/items/ | 1 ítems |
| ✅ PASS | token_id determinista calculado para item 1 | cd2662154e6d76b2... |
| ✅ PASS | Cuenta Stellar disponible para pruebas | GCGVSCO3R6Z62SHG... |
| ✅ PASS | POST /api/donation-receptions/ (crear intención) | id=17, status=processing |
| ✅ PASS | Status inicial = processing | processing |
| ✅ PASS | Sin transacción blockchain en intención | anchored_tx_id ausente ✓ |
| ✅ PASS | DB: intención creada en DonationReception | id=17 |
| ✅ PASS | DB: intención sin anchored_tx_id | VACÍO |
| ✅ PASS | Finalizar recepción #17 (MINT) | status=completed |
| ✅ PASS | Respuesta incluye info blockchain (mints) | tx_id=c4eb850e10549787... |
| ✅ PASS | anchored_hash presente en respuesta | 950646fd158c84ab... |
| ✅ PASS | DB: anchored_tx_id guardado en DonationReception | c4eb850e10549787 |
| ✅ PASS | DB: status = completed | completed |
| ✅ PASS | DB: Item #1 quantity aumentó en 3 | antes=28, después=31 |
| ✅ PASS | DB: Item #1.current_center_id = 2 (Centro Sur) | current_center_id=2 |
| ✅ PASS | token_id = SHA256(item_id=1) correcto | expected=cd2662154e6d76b2... |
| ✅ PASS | Blockchain: balance Centro Sur +3 por mint | antes=10, después=13 |
| ✅ PASS | Blockchain: total_supply +3 por mint | antes=18, después=21 |
| ✅ PASS | Blockchain: evento {mint} registrado | mint_events=11, esperado>=11 |
| ✅ PASS | POST /api/transfers/ (TRANSFER) | id=10, status=anchored |
| ✅ PASS | Transfer status = anchored | anchored |
| ✅ PASS | Transfer.egreso_blockchain_tx presente | 318110b3ea7ff72c |
| ✅ PASS | DB: Item.current_center_id cambió a 1 | current_center_id=1 |
| ✅ PASS | DB: TokenTransfer guardado con egreso_blockchain_tx | 318110b3ea7ff72c |
| ✅ PASS | Blockchain: balance Centro Sur ajustado por transfer | delta=-2, esperado=-2 |
| ✅ PASS | Blockchain: balance Centro Norte ajustado por transfer | delta=2, esperado=2 |
| ✅ PASS | Blockchain: evento {transfer} registrado | transfer_events=9, esperado>=9 |
| ✅ PASS | POST /api/distributions/prepare | id=11, status=draft |
| ✅ PASS | Distribution status = draft | draft |
| ✅ PASS | identify-manual OK | recipient_commitment=390d5a14986e478b... |
| ✅ PASS | sign OK | signature_hash=bfca652f5e96a3de... |
| ✅ PASS | POST /api/distributions/finalize (BURN) | id=11, status=anchored |
| ✅ PASS | Distribution status = anchored | anchored |
| ✅ PASS | Distribution.blockchain_tx_id presente | 010e25a1029c8544 |
| ✅ PASS | DB: Item.quantity disminuyó en 1 | antes=31, después=30 |
| ✅ PASS | Blockchain: balance Centro Norte -1 por burn | delta=-1, esperado=-1 |
| ✅ PASS | Blockchain: total_supply -1 por burn | delta=-1, antes=21, después=20 |
| ✅ PASS | Blockchain: evento {burn} registrado | burn_events=9, esperado>=9 |
| ✅ PASS | Backend levantó con config rota | Responde en puerto 3001 |
| ✅ PASS | Intención de donación funciona sin blockchain | HTTP 201 |
| ✅ PASS | Mint con contrato SFT inválido retorna 503/500 | HTTP 503: {"error":"Error al registrar en blockchain. No se guardó ningún dato.","detail":"Account not found: GCGVSCO3R6Z62SHGA36JZKO4AZ66AYILS3MM3WBC6L3RSCTKP3NX4AYC"} |
| ✅ PASS | DB: Recepción sigue en "processing" (rollback OK) | status=processing |
| ✅ PASS | DB: Item.quantity no cambió (sin escritura en DB) | qty=30 (esperado 30) |
| ✅ PASS | Backend restaurado con .env original | OK |

## Resumen por Fase

| Fase | Descripción | Estado |
|------|-------------|--------|
| Fase 0 | Autenticación | ✅ |
| Fase 1 | Reconocimiento del Entorno | ✅ |
| Fase 2a | Intención de Donación (sin blockchain) | ✅ |
| Fase 2b | Recepción + MINT blockchain | ✅ |
| Fase 2c | Transferencia entre centros (TRANSFER) | ✅ |
| Fase 2d | Distribución final (BURN) | ✅ |
| Fase 3 | Fail-Fast / Resiliencia | ✅ |

## Arquitectura Verificada

El sistema implementa un patrón **blockchain-first**:
1. **MINT** → Se ejecuta en Soroban ANTES de escribir en MySQL. Si falla: HTTP 503, rollback DB.
2. **TRANSFER** → Mueve balance SFT entre centros. Si falla: HTTP 503, sin cambios en DB.
3. **BURN** → Reduce supply al distribuir a beneficiario. Si falla: HTTP 503, rollback DB.

`token_id = SHA256(item_id serializado en 8 bytes big-endian)` — determinista y reproducible.

---
*Generado por test_sft_e2e.js*
