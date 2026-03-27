#!/bin/bash
# Test final para verificar 100% éxito en transferencias

BASE_URL="http://localhost:3001/api"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NDYwNzg2MCwiZXhwIjoxNzc1MjEyNjYwfQ.7qpdOGx17ZpdvSorYQgkEZQf97C_ea4uj9xe-c-hHk4"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TRANSFERENCIAS_EXITOSAS=0
TRANSFERENCIAS_FALLIDAS=0
TOTAL_TESTS=5

echo "=========================================="
echo "TEST 100% TRANSFERENCIAS BLOCKCHAIN"
echo "=========================================="
echo ""

for i in $(seq 1 $TOTAL_TESTS); do
    echo -e "${YELLOW}TEST $i/$TOTAL_TESTS${NC}"
    echo "-------------------------------------------"

    # 1. Crear item
    ITEM_RESP=$(curl -s -X POST "$BASE_URL/donations" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
          \"category_id\": 2,
          \"quantity\": 100,
          \"attributes\": {\"tipo\": \"test_$i\", \"marca\": \"Test100\"},
          \"center_name\": \"Centro Test $i\",
          \"center_latitude\": -34.6037,
          \"center_longitude\": -58.3816,
          \"notes\": \"Test 100% transferencias\"
        }")

    ITEM_ID=$(echo "$ITEM_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('item', {}).get('id', 'N/A'))" 2>/dev/null)

    if [ "$ITEM_ID" = "N/A" ]; then
        echo -e "${RED}✗ Error creando item${NC}"
        continue
    fi

    echo "  Item creado: ID=$ITEM_ID"

    # 2. Obtener centros
    CENTROS_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/centers")
    CENTER_1=$(echo "$CENTROS_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); centers=[c for c in data.get('data', []) if c.get('is_active')]; print(centers[0]['id'] if len(centers) > 0 else 'N/A')" 2>/dev/null)
    CENTER_2=$(echo "$CENTROS_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); centers=[c for c in data.get('data', []) if c.get('is_active')]; print(centers[1]['id'] if len(centers) > 1 else 'N/A')" 2>/dev/null)

    if [ "$CENTER_1" = "N/A" ] || [ "$CENTER_2" = "N/A" ]; then
        echo -e "${RED}✗ No hay suficientes centros${NC}"
        continue
    fi

    # 3. Asignar item a centro origen (esto debería registrar en blockchain)
    UPDATE_RESP=$(curl -s -X PUT "$BASE_URL/items/$ITEM_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"current_center_id\": $CENTER_1}")

    sleep 2

    # 4. Transferir
    TRANSFER_RESP=$(curl -s -X POST "$BASE_URL/transfers" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
          \"item_id\": $ITEM_ID,
          \"from_center_id\": $CENTER_1,
          \"to_center_id\": $CENTER_2,
          \"quantity\": 20,
          \"reason\": \"Test 100% transferencia $i\"
        }")

    TRANSFER_STATUS=$(echo "$TRANSFER_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('status', 'N/A'))" 2>/dev/null)

    if [ "$TRANSFER_STATUS" = "anchored" ]; then
        echo -e "${GREEN}✓ Transferencia $i EXITOSA (anchored)${NC}"
        ((TRANSFERENCIAS_EXITOSAS++))
    else
        echo -e "${RED}✗ Transferencia $i FALLÓ (status: $TRANSFER_STATUS)${NC}"
        ((TRANSFERENCIAS_FALLIDAS++))
    fi

    echo ""
done

# Resumen
echo "=========================================="
echo "RESUMEN"
echo "=========================================="
echo ""
echo "Transferencias exitosas: $TRANSFERENCIAS_EXITOSAS/$TOTAL_TESTS"
echo "Transferencias fallidas: $TRANSFERENCIAS_FALLIDAS/$TOTAL_TESTS"
echo ""

PORCENTAJE=$((TRANSFERENCIAS_EXITOSAS * 100 / TOTAL_TESTS))

if [ $TRANSFERENCIAS_EXITOSAS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}✅ 100% ÉXITO - TODAS LAS TRANSFERENCIAS FUNCIONAN${NC}"
    echo ""
    echo "La solución fue exitosa:"
    echo "✅ Los items se registran en los centros al asignarse"
    echo "✅ Las transferencias funcionan al 100%"
    echo "✅ Blockchain funciona correctamente"
    exit 0
else
    echo -e "${RED}❌ FALLO - Solo $PORCENTAJE% éxito${NC}"
    echo ""
    echo "Se necesita más investigación"
    exit 1
fi
