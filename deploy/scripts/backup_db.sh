#!/usr/bin/env bash
# Backup diario de la base MySQL de Acción del Sur.
#   - mysqldump --single-transaction (consistente sin bloquear tablas InnoDB)
#   - comprimido con gzip, permisos 600 (contiene emails y hashes de contraseñas)
#   - rotación: se borran los backups con más de 7 días
# Credenciales: se leen de backend/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
# y se pasan a mysqldump por un archivo temporal de opciones, nunca por la línea de comandos.
#
# Uso:  deploy/scripts/backup_db.sh            (destino por defecto: ~/backups/accion_del_sur)
#       BACKUP_DIR=/otra/ruta deploy/scripts/backup_db.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../../backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/accion_del_sur}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

[ -r "$ENV_FILE" ] || { echo "No se puede leer $ENV_FILE" >&2; exit 1; }

# Lee una variable de .env sin ejecutar el archivo (quita comillas simples/dobles).
env_get() {
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -E "s/^['\"](.*)['\"]$/\1/"
}
DB_HOST="$(env_get DB_HOST)"; DB_HOST="${DB_HOST:-localhost}"
DB_PORT="$(env_get DB_PORT)"; DB_PORT="${DB_PORT:-3306}"
DB_NAME="$(env_get DB_NAME)"
DB_USER="$(env_get DB_USER)"
DB_PASSWORD="$(env_get DB_PASSWORD)"
[ -n "$DB_NAME" ] && [ -n "$DB_USER" ] || { echo "Faltan DB_NAME/DB_USER en $ENV_FILE" >&2; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
OPTS="$(mktemp)"
trap 'rm -f "$OPTS"' EXIT
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASSWORD" > "$OPTS"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}_${STAMP}.sql.gz"
TMP="$OUT.partial"

mysqldump --defaults-extra-file="$OPTS" --single-transaction --routines --triggers \
  --no-tablespaces "$DB_NAME" | gzip -9 > "$TMP"
gzip -t "$TMP"
mv "$TMP" "$OUT"

# Rotación: solo archivos de esta base con más de RETENTION_DAYS días.
find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}_*.sql.gz" -mtime "+$((RETENTION_DAYS - 1))" -print -delete \
  | sed 's/^/[backup] borrado por rotación: /'

echo "[backup] $(date -Is) OK -> $OUT ($(du -h "$OUT" | cut -f1))"
