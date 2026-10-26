#!/usr/bin/env bash
# Levanta el entorno de desarrollo: backend (node) + frontend (Vite) en segundo plano.
#
#   ./start.sh            puertos por defecto: backend 3012, frontend 5000
#   BACKEND_PORT=3020 FRONTEND_PORT=5020 ./start.sh
#
# El backend toma su puerto de BACKEND_PORT o, si no está, de PORT en backend/.env.
# Logs en .logs/. Para detener: ./stop.sh (con las mismas variables).
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_PORT=$(grep -E '^PORT=' "$DIR/backend/.env" 2>/dev/null | cut -d= -f2)
BACKEND_PORT="${BACKEND_PORT:-${ENV_PORT:-3012}}"
FRONTEND_PORT="${FRONTEND_PORT:-5000}"
LOGDIR="$DIR/.logs"
mkdir -p "$LOGDIR"

start_one() {
  local name="$1" cwd="$2" cmd="$3" port="$4"
  if ss -ltn 2>/dev/null | grep -q ":$port "; then
    echo "  [$name] el puerto :$port ya está en uso — no se lanza"
    return
  fi
  ( cd "$cwd" && setsid bash -c "$cmd" > "$LOGDIR/$name.log" 2>&1 < /dev/null & )
  echo "  [$name] lanzado en :$port (log: .logs/$name.log)"
}

echo "Levantando Acción del Sur..."
start_one backend  "$DIR/backend"  "PORT=$BACKEND_PORT node server.js" "$BACKEND_PORT"
start_one frontend "$DIR/frontend" "PORT=$FRONTEND_PORT API_URL=http://localhost:$BACKEND_PORT npm run dev" "$FRONTEND_PORT"

for _ in $(seq 1 30); do
  b=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://localhost:$BACKEND_PORT/api/health")
  f=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://localhost:$FRONTEND_PORT/")
  [ "$b" = "200" ] && [ "$f" = "200" ] && break
  sleep 1
done
echo ""
echo "  Backend  :$BACKEND_PORT -> HTTP ${b:-sin respuesta}"
echo "  Frontend :$FRONTEND_PORT -> HTTP ${f:-sin respuesta}"
echo ""
echo "Abrir http://localhost:$FRONTEND_PORT  ·  usuario demo: admin / admin123"
