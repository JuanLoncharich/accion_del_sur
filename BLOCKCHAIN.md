# Integración Blockchain — Stellar + Soroban (Rust)

Documentación del estado actual de la integración blockchain en **Acción del Sur**.

---

## Estado general

| Componente | Estado | Detalle |
|---|---|---|
| Campos en base de datos | ✅ Listo | `blockchain_hash`, `blockchain_tx_id`, `token_status`, `receiver_hash` |
| Contrato Soroban (Rust) | ✅ **Deployado** | `CASFE4OQYEQIEXKPVOCTXYDMPESJKWCRXHMB2MNAEP7W7IN6ZXQBSL55` en testnet |
| `stellarService.js` | ✅ **Implementado** | Flujo completo: simulate → prepare → sign → send → poll |
| Minteo de donaciones | ✅ **Funcionando** | Cada donación nueva mintea un token en Stellar |
| Registro de distribuciones | ✅ **Funcionando** | Cada distribución queda registrada on-chain |
| Hash del receptor | ✅ Listo | SHA-256 generado en cada distribución |
| Graceful degradation | ✅ Listo | Si blockchain falla, el sistema sigue funcionando |
| Variables de entorno | ✅ Configuradas | Claves y contract ID en `.env` |
| Smart contract en Mainnet | ⏳ Pendiente | Requiere fondear cuenta real y re-deployar |
| Biometría del receptor | ⏳ Pendiente | Campo preparado, sin proveedor definido aún |

---

## Infraestructura desplegada

### Cuenta Stellar (Testnet)
- **Public Key:** `GCGVSCO3R6Z62SHGA36JZKO4AZ66AYILS3MM3WBC6L3RSCTKP3NX4AYC`
- **Red:** Testnet (fondeada con Friendbot)
- **Explorer:** https://stellar.expert/explorer/testnet/account/GCGVSCO3R6Z62SHGA36JZKO4AZ66AYILS3MM3WBC6L3RSCTKP3NX4AYC

### Contrato Soroban (Testnet)
- **Contract ID:** `CASFE4OQYEQIEXKPVOCTXYDMPESJKWCRXHMB2MNAEP7W7IN6ZXQBSL55`
- **Código fuente:** `backend/src/services/blockchain/contrato_donaciones/src/lib.rs`
- **WASM:** `contrato_donaciones/target/wasm32-unknown-unknown/release/contrato_donaciones.wasm`
- **Lab:** https://lab.stellar.org/r/testnet/contract/CASFE4OQYEQIEXKPVOCTXYDMPESJKWCRXHMB2MNAEP7W7IN6ZXQBSL55

---

## Flujo activo

### Al registrar una donación
```
POST /api/donations
  → guarda en MySQL (transacción)
  → stellarService.mintDonationToken(item, donation)
      → Contract.call('mint_token_donacion', item_id, metadata, cantidad)
      → simulate → prepare → sign → send → poll
      → item.update({ blockchain_hash, blockchain_tx_id, token_status: 'minted' })
```

### Al registrar una distribución
```
POST /api/distributions
  → valida stock en MySQL (transacción)
  → stellarService.recordDistribution(distribution, item)
      → Contract.call('registrar_distribucion', item_id, receptor_hash_bytes, cantidad)
      → simulate → prepare → sign → send → poll
      → distribution.update({ blockchain_hash })
```

---

## Contrato Soroban — Métodos disponibles

| Método | Argumentos | Retorna | Descripción |
|--------|-----------|---------|-------------|
| `mint_token_donacion` | `item_id: u64`, `metadata: Map<Symbol,String>`, `cantidad: u64` | `BytesN<32>` | Mintea token para un ítem |
| `registrar_distribucion` | `item_id: u64`, `receptor_hash: BytesN<32>`, `cantidad: u64` | `BytesN<32>` | Registra entrega on-chain |
| `verificar_token` | `item_id: u64` | `bool` | Verifica si un ítem tiene token |
| `obtener_historial_distribuciones` | `item_id: u64` | `Vec<RegistroDistribucion>` | Historial de entregas del ítem |
| `obtener_token` | `item_id: u64` | `Option<TokenDonacion>` | Datos del token |
| `total_distribuciones` | — | `u64` | Total de distribuciones registradas |

---

## Estructura de archivos

```
backend/src/services/blockchain/
├── stellarService.js                  ← Servicio Node.js (implementado)
├── contrato_donaciones/
│   ├── Cargo.toml
│   ├── src/lib.rs                     ← Contrato Rust/Soroban
│   └── target/wasm32-unknown-unknown/
│       └── release/
│           └── contrato_donaciones.wasm  ← WASM compilado (7.3 KB)
└── scripts/
    ├── generar-cuenta.js              ← Genera keypair y fondea en testnet
    └── deploy-contrato.sh             ← Compila y despliega el contrato
```

---

## Comandos

```bash
cd backend

# Generar nueva cuenta Stellar y fondear en testnet
npm run stellar:cuenta

# Compilar y deployar el contrato
npm run stellar:deploy

# Compilar contrato manualmente (Rust)
cd src/services/blockchain/contrato_donaciones
cargo build --target wasm32-unknown-unknown --release

# Correr tests del contrato
cargo test
```

---

## Configuración en `.env`

```env
STELLAR_ENABLED=true                    # false = stub (no blockchain)
STELLAR_NETWORK=testnet                 # o 'mainnet'
STELLAR_PUBLIC_KEY=GCGVSCO3R6...        # clave pública de la cuenta
STELLAR_SECRET_KEY=SB7EWOKU...          # ⚠️ NUNCA commitear con valor real
SOROBAN_CONTRACT_ID=CASFE4OQ...         # ID del contrato deployado
```

---

## Pasar a Mainnet

1. Crear una cuenta Stellar real (Freighter, Lobstr, o exchange)
2. Fondear con XLM real (mínimo ~10 XLM para el deploy + fees)
3. Actualizar `.env`:
   ```env
   STELLAR_NETWORK=mainnet
   STELLAR_PUBLIC_KEY=<nueva clave pública>
   STELLAR_SECRET_KEY=<nueva clave secreta>
   ```
4. Re-deployar: `npm run stellar:deploy`
5. Actualizar `SOROBAN_CONTRACT_ID` con el nuevo ID de mainnet

---

## Lo que falta

### Biometría del receptor
El campo `receiver_identifier` actualmente acepta texto libre (DNI, nombre, etc.).
Cuando se integre un proveedor biométrico:
- El frontend enviará el template biométrico en lugar del texto
- El backend calcula el SHA-256 igual, sin cambios estructurales
- Agregar validación del formato en middleware si es necesario

### Mainnet
Ver sección "Pasar a Mainnet" arriba. No requiere cambios de código.
