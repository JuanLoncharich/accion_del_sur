#!/usr/bin/env bash
set -euo pipefail

if ! command -v opencode >/dev/null 2>&1; then
  echo "Error: opencode no está instalado en PATH." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHATLLM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$CHATLLM_DIR/../.." && pwd)"
BACKEND_DIR="$(cd "$CHATLLM_DIR/.." && pwd)"
PROMPT_FILE="$CHATLLM_DIR/agent_prompt_mysql.txt"
LOCAL_CONFIG_FILE="$CHATLLM_DIR/opencode.json"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: no existe $PROMPT_FILE" >&2
  exit 1
fi

BASE_PROMPT="$(cat "$PROMPT_FILE")"

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

cd "$PROJECT_ROOT"

echo "Chat MySQL (agente: mysql_qa). Escribe 'salir' para terminar."
while true; do
  read -r -p "> " QUESTION
  if [[ -z "$QUESTION" ]]; then
    continue
  fi
  if [[ "$QUESTION" == "salir" || "$QUESTION" == "exit" ]]; then
    break
  fi

  FULL_PROMPT="$BASE_PROMPT

Pregunta del usuario:
$QUESTION"

  opencode -p "$FULL_PROMPT" || {
    echo "Error ejecutando opencode -p" >&2
  }
  echo

done
