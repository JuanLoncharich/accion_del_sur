#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/agent_prompt_mysql.txt"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
CONFIG_FILE="$CONFIG_DIR/opencode.json"
LOCAL_CONFIG_FILE="$SCRIPT_DIR/opencode.json"

mkdir -p "$CONFIG_DIR"

if [[ -f "$BACKEND_DIR/.env" ]]; then
  set -a
  source "$BACKEND_DIR/.env"
  set +a
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  cat > "$CONFIG_FILE" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "default": "allow"
  },
  "agent": {},
  "agents": {}
}
JSON
fi

if [[ ! -f "$LOCAL_CONFIG_FILE" ]]; then
  cat > "$LOCAL_CONFIG_FILE" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "default": "allow"
  },
  "agent": {},
  "agents": {}
}
JSON
fi

if ! jq empty "$CONFIG_FILE" >/dev/null 2>&1; then
  echo "Error: $CONFIG_FILE no es JSON válido." >&2
  exit 1
fi

if ! jq empty "$LOCAL_CONFIG_FILE" >/dev/null 2>&1; then
  echo "Error: $LOCAL_CONFIG_FILE no es JSON válido." >&2
  exit 1
fi

PROMPT_CONTENT="$(cat "$PROMPT_FILE")"

MODEL_FROM_ENV="${OPENCODE_AGENT_MODEL:-${OPENAI_MODEL:-}}"
if [[ -n "$MODEL_FROM_ENV" && "$MODEL_FROM_ENV" != */* ]]; then
  MODEL_FROM_ENV="openai/$MODEL_FROM_ENV"
fi

apply_config() {
  local target_file="$1"

  if [[ -n "$MODEL_FROM_ENV" ]]; then
    jq \
      --arg prompt "$PROMPT_CONTENT" \
      --arg model "$MODEL_FROM_ENV" \
      '
      .model = $model |
  .default_agent = "mysql_qa" |
  .agent = (.agent // {}) |
      .agent.coder = {
        "description": "Asistente general con herramientas para el proyecto",
        "mode": "primary",
        "model": $model,
        "bash": true,
        "edit": false,
        "write": false,
        "permission": {
          "default": "allow",
          "bash": "allow"
        },
        "prompt": $prompt
      } |
      .agent.mysql_qa = {
        "description": "Chat SQL de solo lectura para MySQL del proyecto",
        "mode": "primary",
        "model": $model,
        "bash": true,
        "edit": false,
        "write": false,
        "permission": {
          "default": "allow",
          "bash": "allow"
        },
        "prompt": $prompt
      } |
      del(.agents)
      ' "$target_file" > "$target_file.tmp"
  else
    jq \
      --arg prompt "$PROMPT_CONTENT" \
      '
  .default_agent = "mysql_qa" |
  .agent = (.agent // {}) |
      .agent.coder = {
        "description": "Asistente general con herramientas para el proyecto",
        "mode": "primary",
        "bash": true,
        "edit": false,
        "write": false,
        "permission": {
          "default": "allow",
          "bash": "allow"
        },
        "prompt": $prompt
      } |
      .agent.mysql_qa = {
        "description": "Chat SQL de solo lectura para MySQL del proyecto",
        "mode": "primary",
        "bash": true,
        "edit": false,
        "write": false,
        "permission": {
          "default": "allow",
          "bash": "allow"
        },
        "prompt": $prompt
      } |
      del(.agents)
      ' "$target_file" > "$target_file.tmp"
  fi

  mv "$target_file.tmp" "$target_file"
}

apply_config "$CONFIG_FILE"
apply_config "$LOCAL_CONFIG_FILE"

echo "Agentes coder y mysql_qa configurados en: $CONFIG_FILE"
echo "Config local para este proyecto: $LOCAL_CONFIG_FILE"
echo "Siguiente paso: ejecutar ./scripts/chat_terminal.sh"
