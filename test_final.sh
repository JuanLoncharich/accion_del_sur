#!/bin/bash
# Test Final Completo - Sistema de Donaciones Acción del Sur

BASE_URL="http://localhost:3001/api"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NDYwNzg2MCwiZXhwIjoxNzc1MjEyNjYwfQ.7qpdOGx17ZpdvSorYQgkEZQf97C_ea4uj9xe-c-hHk4"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORES=()
EXITOS=()

echo "=========================================="
echo "TEST FINAL COMPLETO"
echo "=========================================="
echo ""

# Función para hacer API call
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3

    if [ -z "$data" ]; then
        curl -s -X "$method" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json"
    else
        curl -s -X "$method" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data"
    fi
}

# Función para verificar respuestas
check_test() {
    local response=$1
    local test_name=$2

    if echo "$response" | grep -q '"error"'; then
        echo -e "${RED}✗ $test_name FALLÓ${NC}"
        ERRORES+=("$test_name: $(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('error', 'Error desconocido'))" 2>/dev/null || echo "Error parsing")")
        return 1
    else
        echo -e "${GREEN}✓ $test_name OK${NC}"
        EXITOS+=("$test_name")
        return 0
    fi
}

# ==================== PASO 1: Crear Donación ====================
echo -e "${YELLOW}PASO 1: Crear Donación${NC}"
DONATION_DATA='{
  "category_id": 2,
  "quantity": 100,
  "attributes": {"tipo": "perecedero", "marca": "TestFinal"},
  "center_name": "Centro Acopio Test",
  "center_latitude": -34.6037,
  "center_longitude": -58.3816,
  "notes": "Test final exhaustivo"
}'

DONATION_RESP=$(api_call "POST" "/donations" "$DONATION_DATA")
check_test "$DONATION_RESP" "Crear donación"

DONATION_ID=$(echo "$DONATION_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', 'N/A'))" 2>/dev/null || echo "N/A")
ITEM_ID=$(echo "$DONATION_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('item', {}).get('id', 'N/A'))" 2>/dev/null || echo "N/A")

echo "  Donación ID: $DONATION_ID | Item ID: $ITEM_ID"
echo ""

# Verificar blockchain de donación
if [ "$ITEM_ID" != "N/A" ]; then
    BLOCKCHAIN_STATUS=$(echo "$DONATION_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('status', 'N/A'))" 2>/dev/null || echo "N/A")
    if [ "$BLOCKCHAIN_STATUS" = "anchored" ]; then
        echo -e "${GREEN}✓ Donación anclada en blockchain${NC}"
        EXITOS+=("Donación anclada en blockchain")
    else
        echo -e "${RED}✗ Donación NO anclada: $BLOCKCHAIN_STATUS${NC}"
        ERRORES+=("Donación no anclada: $BLOCKCHAIN_STATUS")
    fi
fi
echo ""

# ==================== PASO 2: Asignar Item a Centro ====================
echo -e "${YELLOW}PASO 2: Asignar Item a Centro${NC}"

# Obtener centros activos
CENTERS_RESP=$(api_call "GET" "/centers")
CENTER_1_ID=$(echo "$CENTERS_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); centers=[c for c in data.get('data', []) if c.get('is_active')]; print(centers[0]['id'] if len(centers) > 0 else 'N/A')" 2>/dev/null || echo "N/A")
CENTER_2_ID=$(echo "$CENTERS_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); centers=[c for c in data.get('data', []) if c.get('is_active')]; print(centers[1]['id'] if len(centers) > 1 else 'N/A')" 2>/dev/null || echo "N/A")

echo "  Centro 1 ID: $CENTER_1_ID | Centro 2 ID: $CENTER_2_ID"
echo ""

if [ "$ITEM_ID" != "N/A" ] && [ "$CENTER_1_ID" != "N/A" ]; then
    UPDATE_RESP=$(curl -s -X PUT "$BASE_URL/items/$ITEM_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"current_center_id\": $CENTER_1_ID}")
    check_test "$UPDATE_RESP" "Asignar item a centro"
    echo ""
fi

# ==================== PASO 3: Transferencia entre Centros ====================
echo -e "${YELLOW}PASO 3: Transferir entre Centros${NC}"

if [ "$ITEM_ID" != "N/A" ] && [ "$CENTER_1_ID" != "N/A" ] && [ "$CENTER_2_ID" != "N/A" ]; then
    TRANSFER_DATA="{
      \"item_id\": $ITEM_ID,
      \"from_center_id\": $CENTER_1_ID,
      \"to_center_id\": $CENTER_2_ID,
      \"quantity\": 30,
      \"reason\": \"Transferencia test final\"
    }"

    TRANSFER_RESP=$(api_call "POST" "/transfers" "$TRANSFER_DATA")
    check_test "$TRANSFER_RESP" "Crear transferencia"

    TRANSFER_ID=$(echo "$TRANSFER_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', 'N/A'))" 2>/dev/null || echo "N/A")
    TRANSFER_STATUS=$(echo "$TRANSFER_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('status', 'N/A'))" 2>/dev/null || echo "N/A")

    echo "  Transfer ID: $TRANSFER_ID | Status: $TRANSFER_STATUS"

    if [ "$TRANSFER_STATUS" = "anchored" ]; then
        echo -e "${GREEN}✓ Transferencia anclada en blockchain${NC}"
        EXITOS+=("Transferencia anclada en blockchain")
    else
        echo -e "${YELLOW}⚠ Transferencia status: $TRANSFER_STATUS${NC}"
        if [ "$TRANSFER_STATUS" = "failed" ]; then
            ERRORES+=("Transferencia falló en blockchain")
        fi
    fi
    echo ""
fi

# ==================== PASO 4: Distribución (Entrega Final) ====================
echo -e "${YELLOW}PASO 4: Distribución a Beneficiario${NC}"

if [ "$ITEM_ID" != "N/A" ]; then
    # Preparar distribución
    DIST_DATA="{
      \"item_id\": $ITEM_ID,
      \"quantity\": 10,
      \"notes\": \"Entrega test final\",
      \"center_name\": \"Centro de Entrega\",
      \"center_latitude\": -34.6200,
      \"center_longitude\": -58.4500
    }"

    DIST_RESP=$(api_call "POST" "/distributions" "$DIST_DATA")
    check_test "$DIST_RESP" "Preparar distribución"

    DIST_ID=$(echo "$DIST_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', 'N/A'))" 2>/dev/null || echo "N/A")
    echo "  Distribution ID: $DIST_ID"

    if [ "$DIST_ID" != "N/A" ]; then
        # Identificar
        IDENTIFY_DATA='{"receiver_identifier": "87654321", "doc_type": "DNI"}'
        IDENTIFY_RESP=$(curl -s -X POST "$BASE_URL/distributions/$DIST_ID/identify-manual" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$IDENTIFY_DATA")
        check_test "$IDENTIFY_RESP" "Identificar beneficiario"
        sleep 1

        # Firmar
        SIGN_DATA='{
          "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          "signature_mime": "image/png"
        }'
        SIGN_RESP=$(curl -s -X POST "$BASE_URL/distributions/$DIST_ID/sign" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$SIGN_DATA")
        check_test "$SIGN_RESP" "Firmar entrega"
        sleep 1

        # Finalizar
        FINALIZE_RESP=$(api_call "POST" "/distributions/$DIST_ID/finalize" "")
        check_test "$FINALIZE_RESP" "Finalizar entrega"

        DIST_STATUS=$(echo "$FINALIZE_RESP" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('status', 'N/A'))" 2>/dev/null || echo "N/A")

        if [ "$DIST_STATUS" = "anchored" ]; then
            echo -e "${GREEN}✓ Distribución anclada en blockchain${NC}"
            EXITOS+=("Distribución anclada en blockchain")
        else
            echo -e "${YELLOW}⚠ Distribución status: $DIST_STATUS${NC}"
        fi
    fi
    echo ""
fi

# ==================== PASO 5: Verificar Stock Final ====================
echo -e "${YELLOW}PASO 5: Verificar Stock Final${NC}"

if [ "$ITEM_ID" != "N/A" ]; then
    FINAL_ITEM=$(api_call "GET" "/items/$ITEM_ID")
    FINAL_QTY=$(echo "$FINAL_ITEM" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('quantity', 'N/A'))" 2>/dev/null || echo "N/A")
    FINAL_CENTER=$(echo "$FINAL_ITEM" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('current_center_id', 'N/A'))" 2>/dev/null || echo "N/A")

    echo "  Stock final: $FINAL_QTY | Centro actual: $FINAL_CENTER"

    # Esperado: 100 - 30 (transferido) - 10 (entregado) = 60
    if [ "$FINAL_QTY" = "60" ]; then
        echo -e "${GREEN}✓ Stock correcto${NC}"
        EXITOS+=("Stock correcto (60)")
    else
        echo -e "${RED}✗ Stock incorrecto: esperado 60, actual $FINAL_QTY${NC}"
        ERRORES+=("Stock incorrecto: esperado 60, actual $FINAL_QTY")
    fi
    echo ""
fi

# ==================== RESUMEN ====================
echo -e "${YELLOW}=========================================="
echo "RESUMEN FINAL"
echo "==========================================${NC}"
echo ""

echo -e "${GREEN}ÉXITOS (${#EXITOS[@]}):${NC}"
for exito in "${EXITOS[@]}"; do
    echo "  ✓ $exito"
done
echo ""

if [ ${#ERRORES[@]} -gt 0 ]; then
    echo -e "${RED}ERRORES (${#ERRORES[@]}):${NC}"
    for error in "${ERRORES[@]}"; do
        echo "  ✗ $error"
    done
    echo ""
    echo -e "${RED}TEST COMPLETADO CON ERRORES${NC}"
    exit 1
else
    echo -e "${GREEN}TEST COMPLETADO EXITOSAMENTE${NC}"
    echo ""
    echo "✓ Todas las donaciones se anclaron en blockchain"
    echo "✓ Todas las transferencias funcionaron correctamente"
    echo "✓ Todas las distribuciones se completaron"
    echo "✓ El stock se calculó correctamente"
    echo ""
    echo "Sistema funcionando correctamente ✨"
    exit 0
fi
