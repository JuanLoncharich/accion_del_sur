#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHATLLM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$CHATLLM_DIR/../.." && pwd)"
BACKEND_DIR="$(cd "$CHATLLM_DIR/.." && pwd)"
PROMPT_FILE="$CHATLLM_DIR/agent_prompt_mysql.txt"
LOCAL_CONFIG_FILE="$CHATLLM_DIR/opencode.json"
READONLY_SQL_SCRIPT="$SCRIPT_DIR/mysql_readonly_query.sh"
LAST_RESPONSE_FILE="$CHATLLM_DIR/.last_llm_response.txt"
LAST_RESPONSE_FALLBACK="/tmp/opencode_last_response_${USER:-user}.txt"

HAS_OPENCODE=0
OPENCODE_CMD=(opencode)
if command -v opencode >/dev/null 2>&1; then
  HAS_OPENCODE=1
elif command -v npx >/dev/null 2>&1; then
  if npx -y opencode-ai --version >/dev/null 2>&1; then
    HAS_OPENCODE=1
    OPENCODE_CMD=(npx -y opencode-ai)
  fi
fi

OPENCODE_MODE=""
if [[ "$HAS_OPENCODE" -eq 1 ]]; then
  if "${OPENCODE_CMD[@]}" --help 2>/dev/null | grep -q "opencode run"; then
    OPENCODE_MODE="run"
  else
    OPENCODE_MODE="legacy-p"
  fi
fi

if [[ ! -x "$READONLY_SQL_SCRIPT" ]]; then
  echo "Error: no existe o no es ejecutable $READONLY_SQL_SCRIPT" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq no está instalado en PATH (requerido para parsear salida JSON de opencode)." >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: no existe $PROMPT_FILE" >&2
  exit 1
fi

BASE_PROMPT="$(cat "$PROMPT_FILE")"

FINAL_RESPONSE_APPEND=$'\n\nInstrucciones de salida FINAL (obligatorias):\n- En la respuesta final al usuario, muestra SOLO la respuesta final.\n- No muestres proceso, pasos, SQL ejecutado, tablas, comandos, razonamiento ni secciones.\n- No menciones base de datos, SQL, tablas, consultas, scripts, sistema interno ni aspectos técnicos.\n- Responde para una persona no técnica en español claro.\n- Usa un único bloque breve (máximo 2 frases).'

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

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  OPENAI_API_KEY="${OPENAI_API_KEY%\'}"
  OPENAI_API_KEY="${OPENAI_API_KEY#\'}"
  export OPENAI_API_KEY
fi

if [[ -f "$LOCAL_CONFIG_FILE" ]]; then
  export OPENCODE_CONFIG="$LOCAL_CONFIG_FILE"
fi

persist_last_response() {
  local content="$1"
  if ! (printf '%s\n' "$content" > "$LAST_RESPONSE_FILE") 2>/dev/null; then
    (printf '%s\n' "$content" > "$LAST_RESPONSE_FALLBACK") 2>/dev/null || true
  fi
}

cd "$PROJECT_ROOT"

if [[ "$HAS_OPENCODE" -eq 1 ]]; then
  if [[ "${OPENCODE_CMD[0]}" == "opencode" ]]; then
    echo "Chat MySQL (agente: mysql_qa). Escribe 'salir' para terminar."
  else
    echo "Chat MySQL (agente: mysql_qa, ejecutando via npx opencode-ai). Escribe 'salir' para terminar."
  fi
else
  echo "Aviso: opencode no está instalado en PATH."
  echo "Modo fallback activado: ejecuta SQL de solo lectura directamente (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN)."
  echo "Ejemplo: SELECT COUNT(*) AS total FROM llm_donations;"
  echo "Escribe 'salir' para terminar."
fi

LAST_FINAL_RESPONSE=""

while true; do
  if ! read -r -p "> " QUESTION; then
    echo
    break
  fi
  if [[ -z "$QUESTION" ]]; then
    continue
  fi
  if [[ "$QUESTION" == "salir" || "$QUESTION" == "exit" ]]; then
    break
  fi

  if [[ "$HAS_OPENCODE" -eq 0 ]]; then
    QUESTION_LOWER="$(echo "$QUESTION" | tr '[:upper:]' '[:lower:]')"
    if [[ "$QUESTION_LOWER" =~ ^[[:space:]]*(select|with|show|describe|desc|explain)[[:space:]] ]]; then
      "$READONLY_SQL_SCRIPT" "$QUESTION" || {
        echo "Error ejecutando consulta SQL de solo lectura." >&2
      }
    else
      echo "Sin opencode, solo puedo ejecutar SQL de lectura."
      echo "Prueba con: SELECT COUNT(*) AS total FROM llm_donations;"
    fi
    echo
    continue
  fi

  FULL_PROMPT="$BASE_PROMPT

$FINAL_RESPONSE_APPEND

Pregunta del usuario:
$QUESTION"

  if [[ "$OPENCODE_MODE" == "run" ]]; then
    OPCODE_RAW_OUTPUT=""
    if ! OPCODE_RAW_OUTPUT="$("${OPENCODE_CMD[@]}" run --agent mysql_qa --format json "$FULL_PROMPT" 2>&1)"; then
      echo "Error ejecutando opencode run" >&2
      echo "$OPCODE_RAW_OUTPUT" | tail -n 5 >&2
      echo
      continue
    fi

    LAST_FINAL_RESPONSE="$(
      printf '%s\n' "$OPCODE_RAW_OUTPUT" \
        | sed -n '/^[[:space:]]*{/p' \
        | jq -r 'select(type=="object" and .type=="text" and .part.text != null) | .part.text' 2>/dev/null \
        | tail -n 1 || true
    )"

    if [[ -z "$LAST_FINAL_RESPONSE" ]]; then
      LAST_FINAL_RESPONSE="No pude parsear una respuesta estructurada de opencode en este intento."
      echo "$LAST_FINAL_RESPONSE" >&2
      echo "Detalle de salida (ultimas 10 lineas):" >&2
      echo "$OPCODE_RAW_OUTPUT" | tail -n 10 >&2
    fi

    export LAST_FINAL_RESPONSE
    persist_last_response "$LAST_FINAL_RESPONSE"
    printf '%s\n\n' "$LAST_FINAL_RESPONSE"
  else
    "${OPENCODE_CMD[@]}" -p "$FULL_PROMPT" || {
      echo "Error ejecutando opencode -p" >&2
    }

    LAST_FINAL_RESPONSE="Modo legacy sin parseo estructurado: revisa salida de opencode arriba."
    export LAST_FINAL_RESPONSE
    persist_last_response "$LAST_FINAL_RESPONSE"
    echo
  fi

done
