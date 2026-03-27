#!/bin/bash
# Script para verificar todas las transacciones en blockchain

echo "=========================================="
echo "VERIFICACIÓN DE TRANSACCIONES BLOCKCHAIN"
echo "=========================================="
echo ""

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NDYwNzg2MCwiZXhwIjoxNzc1MjEyNjYwfQ.7qpdOGx17ZpdvSorYQgkEZQf97C_ea4uj9xe-c-hHk4"
BASE_URL="http://localhost:3001/api"

echo "1. Verificando donaciones (blockchain hashes):"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/donations?limit=5" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for d in data['data']:
    print(f\"  Donación {d['id']}: {d['status']} | hash: {d.get('blockchain_hash', 'N/A')[:20]}... | tx: {d.get('blockchain_tx_id', 'N/A')[:20]}...\")
"
echo ""

echo "2. Verificando distribuciones (blockchain hashes):"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/distributions?limit=5" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for d in data['data']:
    print(f\"  Distribución {d['id']}: {d['status']} | hash: {d.get('blockchain_hash', 'N/A')[:20] if d.get('blockchain_hash') else 'N/A'}... | tx: {d.get('blockchain_tx_id', 'N/A')[:20] if d.get('blockchain_tx_id') else 'N/A'}...\")
"
echo ""

echo "3. Verificando transferencias (blockchain hashes):"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/transfers?limit=5" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data['data']:
    print(f\"  Transfer {t['id']}: {t['status']}\")
    print(f\"    Egreso hash: {t.get('egreso_blockchain_hash', 'N/A')[:20] if t.get('egreso_blockchain_hash') else 'N/A'}...\")
    print(f\"    Ingreso hash: {t.get('ingreso_blockchain_hash', 'N/A')[:20] if t.get('ingreso_blockchain_hash') else 'N/A'}...\")
"
echo ""

echo "4. Verificando centros (contracts):"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/centers" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for c in data.get('data', [])[:5]:
    print(f\"  Centro {c['id']}: {c['name']}\")
    print(f\"    Contract: {c.get('blockchain_contract_id', 'N/A')[:20] if c.get('blockchain_contract_id') else 'N/A'}...\")
    print(f\"    Deploy TX: {c.get('blockchain_deploy_tx', 'N/A')[:20] if c.get('blockchain_deploy_tx') else 'N/A'}...\")
    print(f\"    Init TX: {c.get('blockchain_init_tx', 'N/A')[:20] if c.get('blockchain_init_tx') else 'N/A'}...\")
"
echo ""

echo "5. Verificando items (tokens):"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/items?limit=5" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for i in data['data']:
    print(f\"  Item {i['id']}: {i['name'][:40]}\")
    print(f\"    Token status: {i.get('token_status', 'N/A')}\")
    print(f\"    Hash: {i.get('blockchain_hash', 'N/A')[:20] if i.get('blockchain_hash') else 'N/A'}...\")
"
echo ""

echo "=========================================="
echo "VERIFICACIÓN COMPLETADA"
echo "=========================================="
