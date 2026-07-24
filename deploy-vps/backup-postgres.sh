#!/usr/bin/env bash
# Daily Postgres backup for the V2 database.
# Cron:  0 3 * * *  /opt/v2/app/deploy-vps/backup-postgres.sh >> /var/log/v2/backup.log 2>&1
#
# Keeps 14 daily snapshots locally. Offload to GCS/S3 is recommended as a
# second copy — see the TODO near the bottom.

set -euo pipefail

# --- config ---
APP_ENV="/opt/v2/app/.env"
BACKUP_DIR="/var/backups/v2"
KEEP_DAYS=14
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
CONTAINER="v2-postgres"
DB="english_learning"
USER="v2"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Load password (optional: also available inside the container).
if [[ -f "$APP_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a; . "$APP_ENV"; set +a
fi

OUTFILE="$BACKUP_DIR/english_learning-${TIMESTAMP}.sql.gz"

echo "[$(date -Is)] backing up -> $OUTFILE"

# Run pg_dump INSIDE the container (no need to install pg client on host),
# stream through gzip on the host.
docker exec "$CONTAINER" \
  pg_dump -U "$USER" -d "$DB" --clean --if-exists --no-owner --no-privileges \
  | gzip -9 > "$OUTFILE"

# Sanity check: a non-empty gzip.
if [[ ! -s "$OUTFILE" ]]; then
  echo "[$(date -Is)] ERROR: empty backup, aborting" >&2
  exit 1
fi

SIZE=$(du -h "$OUTFILE" | cut -f1)
echo "[$(date -Is)] backup OK ($SIZE)"

# Prune local snapshots older than KEEP_DAYS.
find "$BACKUP_DIR" -name 'english_learning-*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete \
  | sed 's/^/pruned: /'

# --- TODO (offsite copy, strongly recommended) ---
# gsutil cp "$OUTFILE" gs://your-backup-bucket/v2/  || \
# rclone copy "$OUTFILE" remote:v2-backups/         || \
# aws s3 cp "$OUTFILE" s3://your-bucket/v2/         || true

exit 0
