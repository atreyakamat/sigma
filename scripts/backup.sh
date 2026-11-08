#!/usr/bin/env sh
# Backs up the SIGMA stack: a PostgreSQL dump and the uploaded assets volume.
# Usage: scripts/backup.sh [output-dir]   (default: ./backups)
# Restore with scripts/restore.sh <backup-dir>.
set -eu
OUT="${1:-./backups}/sigma-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
COMPOSE="docker compose${COMPOSE_ENV_FILE:+ --env-file $COMPOSE_ENV_FILE}"
DB_USER="${POSTGRES_USER:-sigma}"
DB_NAME="${POSTGRES_DB:-sigma}"

echo "Dumping database $DB_NAME…"
$COMPOSE exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom > "$OUT/database.dump"

echo "Archiving uploaded assets…"
$COMPOSE exec -T api sh -c 'cd /data && tar -cf - .' > "$OUT/assets.tar"

cat > "$OUT/MANIFEST" <<MANIFEST
created=$(date -u +%Y-%m-%dT%H:%M:%SZ)
database=$DB_NAME
files=database.dump assets.tar
MANIFEST
echo "Backup written to $OUT"
ls -la "$OUT"
