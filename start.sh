#!/usr/bin/env bash
# Arranca el proyecto (versión diagrama de clases) en sus propios puertos.
#   Backend  -> http://localhost:3012
#   Frontend -> http://localhost:5000
# Uso:  ./start.sh    (levanta ambos, persistente)
#       ./stop.sh     (los detiene)
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDIR="$DIR/.logs"
mkdir -p "$LOGDIR"

start_one() {
  local name="$1" cwd="$2" cmd="$3" port="$4"
  if ss -ltn 2>/dev/null | grep -q ":$port "; then
    echo "  [$name] ya hay algo en :$port — omito"
    return
  fi
  ( cd "$cwd" && setsid bash -c "$cmd" > "$LOGDIR/$name.log" 2>&1 < /dev/null & )
  echo "  [$name] lanzado -> log: $LOGDIR/$name.log"
}

echo "Levantando proyecto (diagrama de clases)..."
start_one backend  "$DIR/backend"  "node server.js"  3012
start_one frontend "$DIR/frontend" "npm run dev"     5000

echo "Esperando a que respondan..."
for i in $(seq 1 20); do
  b=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://localhost:3012/api/health 2>/dev/null)
  f=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://localhost:5000/ 2>/dev/null)
  [ "$b" = "200" ] && [ "$f" = "200" ] && break
  sleep 1
done
echo ""
echo "  Backend  :3012 -> ${b:-sin respuesta}"
echo "  Frontend :5000 -> ${f:-sin respuesta}"
echo ""
echo "Abrí:  http://localhost:5000"
echo "Login: admin / admin123   (o maria.gomez@acciondelsur.org / volante123)"
