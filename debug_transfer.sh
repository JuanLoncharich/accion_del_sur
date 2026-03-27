#!/bin/bash
# Test específico para debuggear transferencias

BASE_URL="http://localhost:3001/api"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NDYwNzg2MCwiZXhwIjoxNzc1MjEyNjYwfQ.7qpdOGx17ZpdvSorYQgkEZQf97C_ea4uj9xe-c-hHk4"

echo "=========================================="
echo "DEBUG TRANSFERENCIAS BLOCKCHAIN"
echo "=========================================="
echo ""

# 1. Obtener centros con contratos
echo "1. Obteniendo centros activos con contratos..."
CENTROS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/centers")

echo "$CENTROS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for c in data.get('data', [])[:4]:
    if c.get('is_active'):
        print(f\"Centro {c['id']}: {c['name']}\")
        print(f\"  Contract: {c.get('blockchain_contract_id', 'SIN CONTRACT')}\")
        print(f\"  Init TX: {c.get('blockchain_init_tx', 'NO INICIALIZADO')}\")
        print()
"
echo ""

# 2. Crear un item de prueba
echo "2. Creando item de prueba..."
ITEM_DATA='{
  "category_id": 2,
  "quantity": 50,
  "attributes": {"tipo": "test_transfer", "marca": "Debug"},
  "center_name": "Centro Debug",
  "center_latitude": -34.6037,
  "center_longitude": -58.3816,
  "notes": "Item para debug de transferencias"
}'

ITEM_RESP=$(curl -s -X POST "$BASE_URL/donations" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$ITEM_DATA")

ITEM_ID=$(echo "$ITEM_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('item', {}).get('id', 'N/A'))" 2>/dev/null)
echo "Item ID: $ITEM_ID"
echo ""

# 3. Obtener dos centros para transferir
echo "3. Obteniendo centros para transferencia..."
CENTER_1_ID=$(echo "$CENTROS" | python3 -c "import sys, json; data=json.load(sys.stdin); centers=[c for c in data.get('data', []) if c.get('is_active')]; print(centers[0]['id'] if len(centers) > 0 else 'N/A')" 2>/dev/null)
CENTER_2_ID=$(echo "$CENTROS" | python3 -c "import sys, json; data=json.load(sys.stdin); centers=[c for c in data.get('data', []) if c.get('is_active')]; print(centers[1]['id'] if len(centers) > 1 else 'N/A')" 2>/dev/null)

echo "Centro Origen: $CENTER_1_ID"
echo "Centro Destino: $CENTER_2_ID"
echo ""

# 4. Asignar item al centro origen
echo "4. Asignando item al centro origen..."
curl -s -X PUT "$BASE_URL/items/$ITEM_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"current_center_id\": $CENTER_1_ID}" | python3 -m json.tool
echo ""
sleep 2

# 5. Obtener detalles de los centros
echo "5. Obteniendo detalles completos de los centros..."
CENTER_1_INFO=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/centers/$CENTER_1_ID")
CENTER_2_INFO=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/centers/$CENTER_2_ID")

echo "Centro Origen:"
echo "$CENTER_1_INFO" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"  Name: {data.get('name', 'N/A')}\")
print(f\"  Contract ID: {data.get('blockchain_contract_id', 'N/A')}\")
print(f\"  Contract ID Length: {len(data.get('blockchain_contract_id', ''))}\")
print(f\"  Is Active: {data.get('is_active', False)}\")
"

echo "Centro Destino:"
echo "$CENTER_2_INFO" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"  Name: {data.get('name', 'N/A')}\")
print(f\"  Contract ID: {data.get('blockchain_contract_id', 'N/A')}\")
print(f\"  Contract ID Length: {len(data.get('blockchain_contract_id', ''))}\")
print(f\"  Is Active: {data.get('is_active', False)}\")
"
echo ""

# 6. Verificar contract IDs formato
echo "6. Verificando formato de Contract IDs..."
FROM_CONTRACT=$(echo "$CENTER_1_INFO" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('blockchain_contract_id', ''))" 2>/dev/null)
TO_CONTRACT=$(echo "$CENTER_2_INFO" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('blockchain_contract_id', ''))" 2>/dev/null)

echo "FROM_CONTRACT: $FROM_CONTRACT"
echo "TO_CONTRACT: $TO_CONTRACT"

# Validar que son 56 caracteres (formato Stellar Contract ID)
if [ ${#FROM_CONTRACT} -eq 56 ] && [ ${#TO_CONTRACT} -eq 56 ]; then
    echo "✓ Contract IDs tienen formato correcto (56 caracteres)"
else
    echo "✗ ERROR: Contract IDs no tienen formato correcto"
    echo "  FROM_CONTRACT length: ${#FROM_CONTRACT}"
    echo "  TO_CONTRACT length: ${#TO_CONTRACT}"
fi
echo ""

# 7. Realizar transferencia con verbose
echo "7. Realizando transferencia..."
echo "=========================================="

TRANSFER_DATA="{
  \"item_id\": $ITEM_ID,
  \"from_center_id\": $CENTER_1_ID,
  \"to_center_id\": $CENTER_2_ID,
  \"quantity\": 10,
  \"reason\": \"Test debug transferencia\"
}"

echo "Request:"
echo "$TRANSFER_DATA"
echo ""
echo "Response:"

TRANSFER_RESP=$(curl -s -X POST "$BASE_URL/transfers" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$TRANSFER_DATA")

echo "$TRANSFER_RESP" | python3 -m json.tool
echo ""

# 8. Verificar resultado
TRANSFER_STATUS=$(echo "$TRANSFER_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('status', 'N/A'))" 2>/dev/null)

if [ "$TRANSFER_STATUS" = "anchored" ]; then
    echo "✅ TRANSFERENCIA EXITOSA"
    echo ""
    echo "Hash Egreso:"
    echo "$TRANSFER_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('egreso_blockchain_hash', 'N/A'))"
    echo ""
    echo "Hash Ingreso:"
    echo "$TRANSFER_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('ingreso_blockchain_hash', 'N/A'))"
else
    echo "❌ TRANSFERENCIA FALLÓ"
    echo ""
    echo "Verificando logs del backend..."
    echo ""
    echo "Últimas líneas del log:"
    tail -50 /home/shared/proyecto_cgic/accion_del_sur/backend/backend.log | grep -A 5 "Transfer\|Error\|Stellar"
fi

echo ""
echo "=========================================="
echo "DEBUG COMPLETADO"
echo "=========================================="
