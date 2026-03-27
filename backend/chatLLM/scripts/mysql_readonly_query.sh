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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHATLLM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$(cd "$CHATLLM_DIR/.." && pwd)"

if [[ -f "$BACKEND_DIR/.env" ]]; then
  set -a
  source "$BACKEND_DIR/.env"
  set +a
fi

if [[ -f "$CHATLLM_DIR/.env" ]]; then
  set -a
  source "$CHATLLM_DIR/.env"
  set +a
fi

DB_HOST="${LLM_DB_HOST:-${DB_HOST:-localhost}}"
DB_PORT="${LLM_DB_PORT:-${DB_PORT:-3306}}"
DB_USER="${LLM_DB_USER:-${DB_USER:-llm_reader}}"
DB_PASSWORD="${LLM_DB_PASSWORD:-${DB_PASSWORD:-}}"
DB_NAME="${LLM_DB_NAME:-${DB_NAME:-accion_del_sur}}"

if command -v mysql >/dev/null 2>&1; then
  mysql \
    --protocol=TCP \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --password="$DB_PASSWORD" \
    --database="$DB_NAME" \
    --table \
    --raw \
    --batch \
    --execute "$SQL_TRIMMED"
else
  node "$SCRIPT_DIR/mysql_readonly_query_node.js" "$SQL_TRIMMED"
fi
