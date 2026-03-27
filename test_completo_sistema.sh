#!/bin/bash
# Test Exhaustivo del Sistema de Donaciones - Acción del Sur
# Este script prueba todo el flujo: desde la recepción de la donación hasta la entrega final

BASE_URL="http://localhost:3001/api"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NDYwNzg2MCwiZXhwIjoxNzc1MjEyNjYwfQ.7qpdOGx17ZpdvSorYQgkEZQf97C_ea4uj9xe-c-hHk4"

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables globales para guardar IDs
DONATION_ID=""
ITEM_ID=""
TRANSFER_1_ID=""
TRANSFER_2_ID=""
DISTRIBUTION_ID=""

echo "=========================================="
echo "TEST EXHAUSTIVO - SISTEMA DONACIONES"
echo "=========================================="
echo ""

# Función para hacer peticiones HTTP
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

# Función para verificar errores
check_response() {
    local response=$1
    local test_name=$2

    if echo "$response" | grep -q '"error"'; then
        echo -e "${RED}✗ $test_name FALLÓ${NC}"
        echo "Error: $response"
        return 1
    else
        echo -e "${GREEN}✓ $test_name OK${NC}"
        return 0
    fi
}

# ==================== TEST 1: Recepción de Donación ====================
echo -e "${YELLOW}TEST 1: Recepción de Donación en Centro de Acopio${NC}"
echo "-------------------------------------------"

# Obtener categorías
echo "Obteniendo categorías..."
CATEGORIES=$(api_call "GET" "/categories")
check_response "$CATEGORIES" "Obtener categorías"

# Obtener primera categoría
CATEGORY_ID=$(echo "$CATEGORIES" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data[0]['id'] if data else 1)" 2>/dev/null || echo "1")
echo "Usando categoría ID: $CATEGORY_ID"
echo ""

# Crear donación
echo "Creando donación de 50 unidades de alimentos..."
DONATION_DATA=$(cat <<EOF
{
  "category_id": $CATEGORY_ID,
  "quantity": 50,
  "attributes": {
    "tipo": "no_perecedible",
    "marca": "TestBrand"
  },
  "center_name": "Centro de Acopio Principal",
  "center_latitude": -34.6037,
  "center_longitude": -58.3816,
  "notes": "Donación de prueba - test exhaustivo"
}
EOF
)

DONATION_RESPONSE=$(api_call "POST" "/donations" "$DONATION_DATA")
check_response "$DONATION_RESPONSE" "Crear donación"

# Extraer IDs
DONATION_ID=$(echo "$DONATION_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', 'N/A'))" 2>/dev/null || echo "N/A")
ITEM_ID=$(echo "$DONATION_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('item', {}).get('id', 'N/A'))" 2>/dev/null || echo "N/A")

echo "Donación ID: $DONATION_ID"
echo "Item ID: $ITEM_ID"
echo ""

echo "Detalles de la donación:"
echo "$DONATION_RESPONSE" | python3 -m json.tool
echo ""

# ==================== TEST 2: Obtener Centros ====================
echo -e "${YELLOW}TEST 2: Obtener Centros de Distribución${NC}"
echo "-------------------------------------------"

CENTERS=$(api_call "GET" "/centers")
check_response "$CENTERS" "Obtener centros"

echo "$CENTERS" | python3 -m json.tool
echo ""

# Obtener IDs de centros (manejo más robusto)
CENTER_COUNT=$(echo "$CENTERS" | python3 -c "import sys, json; data=json.load(sys.stdin); centers=data.get('centers', []); print(len(centers))" 2>/dev/null || echo "0")

if [ "$CENTER_COUNT" -lt 2 ]; then
    echo "Creando centros de prueba..."

    # Centro 1 - Regional
    CENTER1_DATA='{
      "name": "Centro Regional Buenos Aires",
      "center_type": "regional",
      "latitude": -34.6037,
      "longitude": -58.3816,
      "blockchain_contract_id": "CDCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB"
    }'
    CENTER1_RESPONSE=$(api_call "POST" "/centers" "$CENTER1_DATA")
    CENTER_1_ID=$(echo "$CENTER1_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', 'N/A'))" 2>/dev/null || echo "N/A")

    # Centro 2 - Local
    CENTER2_DATA='{
      "name": "Centro Local Flores",
      "center_type": "local",
      "latitude": -34.6200,
      "longitude": -58.4500,
      "blockchain_contract_id": "CDCEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC"
    }'
    CENTER2_RESPONSE=$(api_call "POST" "/centers" "$CENTER2_DATA")
    CENTER_2_ID=$(echo "$CENTER2_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', 'N/A'))" 2>/dev/null || echo "N/A")

    echo "Centro 1 ID: $CENTER_1_ID"
    echo "Centro 2 ID: $CENTER_2_ID"
else
    CENTER_1_ID=$(echo "$CENTERS" | python3 -c "import sys, json; data=json.load(sys.stdin); centers=data.get('centers', []); print(centers[0]['id'] if len(centers) > 0 else 'N/A')" 2>/dev/null || echo "N/A")
    CENTER_2_ID=$(echo "$CENTERS" | python3 -c "import sys, json; data=json.load(sys.stdin); centers=data.get('centers', []); print(centers[1]['id'] if len(centers) > 1 else 'N/A')" 2>/dev/null || echo "N/A")
fi

echo "Centro 1 ID: $CENTER_1_ID"
echo "Centro 2 ID: $CENTER_2_ID"
echo ""

# ==================== TEST 3: Verificar y Actualizar Ubicación del Item ====================
echo -e "${YELLOW}TEST 3: Actualizar Ubicación del Item${NC}"
echo "-------------------------------------------"

if [ "$ITEM_ID" != "N/A" ] && [ "$CENTER_1_ID" != "N/A" ]; then
    echo "Actualizando ubicación del item al centro 1..."
    UPDATE_RESPONSE=$(curl -s -X PUT "$BASE_URL/items/$ITEM_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"current_center_id\": $CENTER_1_ID}")
    echo "$UPDATE_RESPONSE" | python3 -m json.tool
    echo ""
    sleep 2
fi

# ==================== TEST 4: Transferencia a Centro Regional ====================
echo -e "${YELLOW}TEST 4: Transferencia a Centro Regional${NC}"
echo "-------------------------------------------"

if [ "$ITEM_ID" != "N/A" ] && [ "$CENTER_1_ID" != "N/A" ] && [ "$CENTER_2_ID" != "N/A" ]; then
    echo "Transferiendo 30 unidades del centro $CENTER_1_ID al centro $CENTER_2_ID..."
    TRANSFER1_DATA=$(cat <<EOF
{
  "item_id": $ITEM_ID,
  "from_center_id": $CENTER_1_ID,
  "to_center_id": $CENTER_2_ID,
  "quantity": 30,
  "reason": "Transferencia a centro regional"
}
EOF
)

    TRANSFER1_RESPONSE=$(api_call "POST" "/transfers" "$TRANSFER1_DATA")

    if check_response "$TRANSFER1_RESPONSE" "Transferencia a centro regional"; then
        TRANSFER_1_ID=$(echo "$TRANSFER1_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', 'N/A'))" 2>/dev/null || echo "N/A")
        echo "Transfer ID: $TRANSFER_1_ID"
    fi

    echo ""
    echo "Detalles de la transferencia:"
    echo "$TRANSFER1_RESPONSE" | python3 -m json.tool
    echo ""
else
    echo -e "${RED}Saltando transferencia: IDs no válidos${NC}"
    echo ""
fi

# ==================== TEST 5: Verificar Estado del Item ====================
echo -e "${YELLOW}TEST 5: Verificar Estado del Item${NC}"
echo "-------------------------------------------"

if [ "$ITEM_ID" != "N/A" ]; then
    ITEM_STATUS=$(api_call "GET" "/items/$ITEM_ID")
    check_response "$ITEM_STATUS" "Obtener estado del item"

    echo "Estado actual del item:"
    echo "$ITEM_STATUS" | python3 -m json.tool
    echo ""
else
    echo -e "${RED}Saltando verificación: ITEM_ID no válido${NC}"
    echo ""
fi

# ==================== TEST 6: Preparar Distribución (Entrega Final) ====================
echo -e "${YELLOW}TEST 6: Preparar Entrega Final a Beneficiario${NC}"
echo "-------------------------------------------"

if [ "$ITEM_ID" != "N/A" ]; then
    DISTRIBUTION_DATA=$(cat <<EOF
{
  "item_id": $ITEM_ID,
  "quantity": 5,
  "notes": "Entrega a beneficiario final - prueba exhaustiva",
  "center_name": "Centro Local Flores",
  "center_latitude": -34.6200,
  "center_longitude": -58.4500
}
EOF
)

    DISTRIBUTION_RESPONSE=$(api_call "POST" "/distributions" "$DISTRIBUTION_DATA")

    if check_response "$DISTRIBUTION_RESPONSE" "Preparar distribución"; then
        DISTRIBUTION_ID=$(echo "$DISTRIBUTION_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', 'N/A'))" 2>/dev/null || echo "N/A")
        echo "Distribution ID: $DISTRIBUTION_ID"
    fi
    echo ""
else
    echo -e "${RED}Saltando distribución: ITEM_ID no válido${NC}"
    echo ""
fi

# ==================== TEST 7: Identificar Beneficiario ====================
echo -e "${YELLOW}TEST 7: Identificar Beneficiario${NC}"
echo "-------------------------------------------"

if [ "$DISTRIBUTION_ID" != "N/A" ]; then
    IDENTIFY_DATA=$(cat <<EOF
{
  "receiver_identifier": "12345678",
  "doc_type": "DNI"
}
EOF
)

    IDENTIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/distributions/$DISTRIBUTION_ID/identify-manual" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$IDENTIFY_DATA")
    check_response "$IDENTIFY_RESPONSE" "Identificar beneficiario"

    echo "$IDENTIFY_RESPONSE" | python3 -m json.tool
    echo ""
else
    echo -e "${RED}Saltando identificación: DISTRIBUTION_ID no válido${NC}"
    echo ""
fi

# ==================== TEST 8: Firmar Recepción ====================
echo -e "${YELLOW}TEST 8: Firmar Recepción${NC}"
echo "-------------------------------------------"

if [ "$DISTRIBUTION_ID" != "N/A" ]; then
    SIGNATURE_DATA='{
  "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "signature_mime": "image/png"
}'

    SIGN_RESPONSE=$(curl -s -X POST "$BASE_URL/distributions/$DISTRIBUTION_ID/sign" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$SIGNATURE_DATA")
    check_response "$SIGN_RESPONSE" "Firmar recepción"

    echo "$SIGN_RESPONSE" | python3 -m json.tool
    echo ""
else
    echo -e "${RED}Saltando firma: DISTRIBUTION_ID no válido${NC}"
    echo ""
fi

# ==================== TEST 9: Finalizar Entrega ====================
echo -e "${YELLOW}TEST 9: Finalizar Entrega (Anclar en Blockchain)${NC}"
echo "-------------------------------------------"

if [ "$DISTRIBUTION_ID" != "N/A" ]; then
    FINALIZE_RESPONSE=$(api_call "POST" "/distributions/$DISTRIBUTION_ID/finalize" "")
    check_response "$FINALIZE_RESPONSE" "Finalizar entrega"

    echo "Detalles de la entrega finalizada:"
    echo "$FINALIZE_RESPONSE" | python3 -m json.tool
    echo ""
else
    echo -e "${RED}Saltando finalización: DISTRIBUTION_ID no válido${NC}"
    echo ""
fi

# ==================== TEST 10: Verificar Stock Final ====================
echo -e "${YELLOW}TEST 10: Verificar Stock Final${NC}"
echo "-------------------------------------------"

if [ "$ITEM_ID" != "N/A" ]; then
    FINAL_ITEM_STATUS=$(api_call "GET" "/items/$ITEM_ID")
    check_response "$FINAL_ITEM_STATUS" "Verificar stock final"

    echo "Stock final del item:"
    echo "$FINAL_ITEM_STATUS" | python3 -m json.tool
    echo ""
else
    echo -e "${RED}Saltando verificación final: ITEM_ID no válido${NC}"
    echo ""
fi

# ==================== TEST 11: Listar todas las transferencias ====================
echo -e "${YELLOW}TEST 11: Listar Transferencias del Item${NC}"
echo "-------------------------------------------"

if [ "$ITEM_ID" != "N/A" ]; then
    TRANSFERS=$(api_call "GET" "/transfers?item_id=$ITEM_ID")
    echo "$TRANSFERS" | python3 -m json.tool
    echo ""
else
    echo -e "${RED}Saltando listado: ITEM_ID no válido${NC}"
    echo ""
fi

# ==================== RESUMEN ====================
echo -e "${YELLOW}=========================================="
echo "RESUMEN DEL TEST"
echo "==========================================${NC}"
echo ""
echo "Donación creada: ID=$DONATION_ID"
echo "Item creado: ID=$ITEM_ID"
echo "Transferencia realizada: ID=$TRANSFER_1_ID"
echo "Distribución realizada: ID=$DISTRIBUTION_ID"
echo ""
echo -e "${GREEN}Test completado. Verifique los logs arriba para detalles.${NC}"
