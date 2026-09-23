#!/bin/sh
# Encrypted PostgreSQL backup for BoardCue (run on the Docker host, e.g. from Coolify "Scheduled tasks" or cron).
#   BACKUP_DIR=/var/backups/boardcue BACKUP_PASSPHRASE=... ./scripts/backup-db.sh
# Keeps 14 daily dumps locally; copy BACKUP_DIR off the server (Storage Box, S3, rclone).
set -eu
: "${BACKUP_DIR:?set BACKUP_DIR}"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
CONTAINER="${DB_CONTAINER:-$(docker ps --filter "label=com.docker.compose.service=db" --filter "name=boardcue" --format '{{.Names}}' | head -n1)}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
docker exec "$CONTAINER" pg_dump -U boardcue -d boardcue --format=custom --no-owner \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$BACKUP_DIR/boardcue-$STAMP.dump.enc"
find "$BACKUP_DIR" -name 'boardcue-*.dump.enc' -mtime +14 -delete
echo "backup written: $BACKUP_DIR/boardcue-$STAMP.dump.enc"
