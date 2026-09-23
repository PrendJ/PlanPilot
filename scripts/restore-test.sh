#!/bin/sh
# Monthly restore drill: restores the latest encrypted dump into a throwaway container and checks row counts.
#   BACKUP_DIR=/var/backups/boardcue BACKUP_PASSPHRASE=... ./scripts/restore-test.sh
set -eu
: "${BACKUP_DIR:?set BACKUP_DIR}"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
LATEST="$(ls -1t "$BACKUP_DIR"/boardcue-*.dump.enc | head -n1)"
NAME="boardcue-restore-test-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=boardcue postgres:16-alpine >/dev/null
trap 'docker stop "$NAME" >/dev/null 2>&1 || true' EXIT
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$LATEST" | docker exec -i "$NAME" pg_restore -U postgres -d boardcue --no-owner
docker exec "$NAME" psql -U postgres -d boardcue -At -c 'SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Workspace") AS boards, (SELECT count(*) FROM "Card") AS cards, (SELECT max("finished_at") FROM "_prisma_migrations") AS last_migration;'
echo "restore drill OK from $LATEST"
