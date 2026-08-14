#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 \"<SQL>\"" >&2
  exit 1
fi

SQL_RAW="$*"
SQL_TRIMMED="$(echo "$SQL_RAW" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
SQL_LOWER="$(echo "$SQL_TRIMMED" | tr '[:upper:]' '[:lower:]')"

if [[ ! "$SQL_LOWER" =~ ^(select|with|show|describe|desc|explain)[[:space:]] ]]; then
  echo "Error: solo se permiten consultas de lectura (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN)." >&2
  exit 2
fi

if echo "$SQL_LOWER" | grep -Eq '(^|[^a-z])(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|commit|rollback|start|lock|unlock|set)($|[^a-z])'; then
  echo "Error: consulta bloqueada por contener palabras no permitidas." >&2
  exit 3
fi

if echo "$SQL_LOWER" | grep -Eq '(^|[^a-z_])(email|password|contact)([^a-z_]|$)'; then
  echo "Error: consulta bloqueada por solicitar columnas sensibles." >&2
  exit 4
fi

if echo "$SQL_LOWER" | grep -Eq '^select[[:space:]]+([a-z0-9_]+\.)?\*'; then
  echo "Error: SELECT * no está permitido; especifica columnas no sensibles." >&2
  exit 5
fi

if echo "$SQL_LOWER" | grep -Eq '(^|[^a-z_])(users|donations|items|distributions|centers|token_transfers|donation_receptions)([^a-z_]|$)'; then
  echo "Error: consulta bloqueada por referenciar una tabla del esquema antiguo." >&2
  exit 6
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# El helper Node carga los .env con dotenv. No se usa `source`: los archivos
# dotenv no son scripts de shell y pueden contener valores que Bash interpreta.
node "$SCRIPT_DIR/mysql_readonly_query_v2.js" "$SQL_TRIMMED"
