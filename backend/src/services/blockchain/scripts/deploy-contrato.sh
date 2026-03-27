#!/bin/bash
# deploy-contrato.sh
#
# Compila y despliega el contrato Soroban en Stellar Testnet.
#
# Pre-requisitos:
#   - Rust con target wasm32-unknown-unknown instalado
#   - Stellar CLI instalado (cargo install stellar-cli --locked)
#   - STELLAR_SECRET_KEY configurada en .env o en variable de entorno
#   - La cuenta debe tener XLM en testnet (correr generar-cuenta.js primero)
#
# Uso:
#   cd backend
#   source .env (o exportar STELLAR_SECRET_KEY manualmente)
#   bash src/services/blockchain/scripts/deploy-contrato.sh

set -e  # Salir si cualquier comando falla

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRATO_DIR="$SCRIPT_DIR/../contrato_donaciones"
NETWORK="testnet"
IDENTITY="accion-del-sur-deployer"

echo "🚀 Deploy Contrato Donaciones — Acción del Sur"
echo "   Red: $NETWORK"
echo ""

# Cargar .env si existe
ENV_FILE="$(dirname "$SCRIPT_DIR")/../../../../.env"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
  echo "✅ .env cargado desde $ENV_FILE"
fi

# Verificar que tenemos la clave secreta
if [ -z "$STELLAR_SECRET_KEY" ]; then
  echo "❌ STELLAR_SECRET_KEY no está configurada en .env"
  exit 1
fi

# ── 1. Configurar red en Stellar CLI ──────────────────────────────────────────
echo ""
echo "📡 Configurando red testnet en Stellar CLI..."
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  2>/dev/null || echo "   (red ya configurada)"

# ── 2. Importar identidad desde clave secreta ─────────────────────────────────
echo ""
echo "🔑 Importando identidad de deploy..."
echo "$STELLAR_SECRET_KEY" | stellar keys add "$IDENTITY" --secret-key --network testnet 2>/dev/null || \
  stellar keys add "$IDENTITY" --secret-key --network testnet << EOF
$STELLAR_SECRET_KEY
EOF

# ── 3. Compilar el contrato ───────────────────────────────────────────────────
echo ""
echo "🔨 Compilando contrato Rust..."
cd "$CONTRATO_DIR"
stellar contract build

WASM_PATH="$CONTRATO_DIR/target/wasm32-unknown-unknown/release/contrato_donaciones.wasm"

if [ ! -f "$WASM_PATH" ]; then
  echo "❌ No se encontró el WASM en: $WASM_PATH"
  exit 1
fi

echo "   ✅ WASM compilado: $(wc -c < "$WASM_PATH") bytes"

# ── 4. Deploy ─────────────────────────────────────────────────────────────────
echo ""
echo "📤 Desplegando en $NETWORK..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --network "$NETWORK" \
  --source "$IDENTITY")

echo ""
echo "✅ ¡Contrato desplegado exitosamente!"
echo ""
echo "   Contract ID: $CONTRACT_ID"
echo ""
echo "📝 Agregá esto a tu .env:"
echo "   SOROBAN_CONTRACT_ID=$CONTRACT_ID"
echo "   STELLAR_ENABLED=true"
echo ""
echo "🔗 Ver contrato en explorer:"
echo "   https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID"
