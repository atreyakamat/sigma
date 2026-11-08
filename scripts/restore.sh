#!/usr/bin/env sh
# Restores a backup made by scripts/backup.sh into the running stack. Existing data is replaced.
# Usage: scripts/restore.sh <backup-dir>
set -eu
SRC="${1:?backup directory required}"
[ -f "$SRC/database.dump" ] || { echo "No database.dump in $SRC" >&2; exit 1; }
COMPOSE="docker compose${COMPOSE_ENV_FILE:+ --env-file $COMPOSE_ENV_FILE}"
DB_USER="${POSTGRES_USER:-sigma}"
DB_NAME="${POSTGRES_DB:-sigma}"

echo "Stopping the API so no writes race the restore…"
$COMPOSE stop api >/dev/null

echo "Restoring database $DB_NAME…"
$COMPOSE exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$SRC/database.dump"

if [ -f "$SRC/assets.tar" ]; then
  echo "Restoring uploaded assets…"
  $COMPOSE run --rm --no-deps -T --entrypoint sh api -c 'rm -rf /data/* && cd /data && tar -xf -' < "$SRC/assets.tar"
fi

$COMPOSE start api >/dev/null
echo "Restore complete."
