#!/bin/sh
# Decrypt and authenticate completely before touching the disposable restore database.
set -eu
umask 077
: "${BACKUP_DIR:?set BACKUP_DIR}"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LATEST="$(ls -1t "$BACKUP_DIR"/boardcue-*.dump.enc | head -n1)"
RAW=$(mktemp "$BACKUP_DIR/.boardcue-restore.XXXXXX")
NAME="boardcue-restore-test-$$"
trap 'rm -f "$RAW"; docker stop "$NAME" >/dev/null 2>&1 || true' EXIT HUP INT TERM
if [ "$(head -c 16 "$LATEST")" = 'BOARDCUE-BACKUP2' ]; then
  node "$SCRIPT_DIR/backup-crypto.mjs" decrypt "$LATEST" "$RAW"
else
  # Transitional support for existing CBC backups; never send partial output to pg_restore.
  openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$LATEST" -out "$RAW"
fi
[ -s "$RAW" ]
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=boardcue postgres:16-alpine >/dev/null
ATTEMPTS=0
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1)); [ "$ATTEMPTS" -lt 60 ] || exit 1; sleep 1
done
docker exec -i "$NAME" pg_restore -U postgres -d boardcue --no-owner --exit-on-error < "$RAW"
docker exec "$NAME" psql -U postgres -d boardcue -v ON_ERROR_STOP=1 -At -c 'SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Workspace") AS boards, (SELECT count(*) FROM "Card") AS cards, (SELECT max("finished_at") FROM "_prisma_migrations") AS last_migration;'
echo "restore drill OK from $LATEST"
