#!/bin/sh
# Requires Node.js 22+ on the backup host. No pipeline can mask pg_dump failures.
set -eu
umask 077
: "${BACKUP_DIR:?set BACKUP_DIR}"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
command -v node >/dev/null
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CONTAINER="${DB_CONTAINER:-$(docker ps --filter "label=com.docker.compose.service=db" --filter "name=boardcue" --format '{{.Names}}' | head -n1)}"
[ -n "$CONTAINER" ] || { echo "No database container" >&2; exit 1; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
RAW=$(mktemp "$BACKUP_DIR/.boardcue-dump.XXXXXX")
trap 'rm -f "$RAW"' EXIT HUP INT TERM
docker exec "$CONTAINER" pg_dump -U boardcue -d boardcue --format=custom --no-owner > "$RAW"
[ -s "$RAW" ]
docker exec -i "$CONTAINER" pg_restore --list < "$RAW" >/dev/null
node "$SCRIPT_DIR/backup-crypto.mjs" encrypt "$RAW" "$BACKUP_DIR/boardcue-$STAMP.dump.enc"
# Only validated, authenticated backups trigger retention.
find "$BACKUP_DIR" -name 'boardcue-*.dump.enc' -mtime +14 -delete
echo "backup written: $BACKUP_DIR/boardcue-$STAMP.dump.enc"
