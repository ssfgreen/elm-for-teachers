#!/bin/sh
# Starts Litestream (replicate, or restore) after checking the backup is not the file bucket.
# Usage: litestream-start.sh replicate | restore
set -eu
: "${BACKUP_S3_BUCKET:?set BACKUP_S3_BUCKET: the bucket for database backups}"
: "${BACKUP_S3_ENDPOINT:?set BACKUP_S3_ENDPOINT: the S3 address of the backup storage}"
files_endpoint="${S3_ENDPOINT:-}"
if [ "${BACKUP_S3_BUCKET}" = "${S3_BUCKET:-}" ] && [ "${BACKUP_S3_ENDPOINT%/}" = "${files_endpoint%/}" ]; then
  echo "refusing: BACKUP_S3_BUCKET is the file bucket (S3_BUCKET). Database backups go to University storage." >&2
  exit 1
fi
CONFIG=/etc/litestream/litestream.yml
DB=/var/lib/sqld/iku.db/dbs/default/data
case "${1:-}" in
  replicate) exec litestream replicate -config "$CONFIG" ;;
  # Only when the database is missing (a new or lost volume) and a backup exists: never overwrites.
  # RESTORE_TIMESTAMP (2026-11-21T14:00:00Z) goes back to that moment instead of the latest change.
  restore)
    if [ -n "${RESTORE_TIMESTAMP:-}" ]; then
      exec litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists -timestamp "$RESTORE_TIMESTAMP" "$DB"
    fi
    exec litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "$DB" ;;
  *) echo "usage: $0 replicate|restore" >&2; exit 2 ;;
esac
