#!/usr/bin/env bash
# Detiene el backend (:3012) y frontend (:5000) de este proyecto.
set -u
for port in 3012 5000; do
  PID=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
  if [ -n "${PID:-}" ]; then
    kill "$PID" 2>/dev/null && echo "  :$port detenido (pid $PID)"
  else
    echo "  :$port ya estaba libre"
  fi
done
