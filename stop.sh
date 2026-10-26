#!/usr/bin/env bash
# Detiene lo que haya levantado ./start.sh (mismas variables BACKEND_PORT / FRONTEND_PORT).
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_PORT=$(grep -E '^PORT=' "$DIR/backend/.env" 2>/dev/null | cut -d= -f2)
for port in "${BACKEND_PORT:-${ENV_PORT:-3012}}" "${FRONTEND_PORT:-5000}"; do
  PID=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
  if [ -n "${PID:-}" ]; then
    kill "$PID" 2>/dev/null && echo "  :$port detenido (pid $PID)"
  else
    echo "  :$port ya estaba libre"
  fi
done
