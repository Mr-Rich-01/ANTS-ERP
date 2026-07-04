#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
ENV_FILE="${ENV_FILE:-.env.staging}"
BACKUP_DIR="${BACKUP_DIR:-backups/staging}"

usage() {
  cat <<'USAGE'
Usage:
  pnpm ops:staging:backup
  sh scripts/ops/staging-backup-db.sh

Creates a PostgreSQL custom-format dump from the staging Docker database.
Output: backups/staging/ants-erp-staging-YYYYMMDD-HHMMSS.dump

Environment overrides:
  COMPOSE_FILE=docker-compose.staging.yml
  ENV_FILE=.env.staging
  BACKUP_DIR=backups/staging
USAGE
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it from .env.staging.example before backing up staging." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%d-%H%M%S)"
backup_file="$BACKUP_DIR/ants-erp-staging-$timestamp.dump"

echo "Creating staging PostgreSQL backup: $backup_file"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres sh -c '
  set -eu
  pg_dump \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --format=custom \
    --no-owner \
    --no-privileges
' > "$backup_file"

if [ ! -s "$backup_file" ]; then
  echo "Backup file is empty: $backup_file" >&2
  rm -f "$backup_file"
  exit 1
fi

bytes="$(wc -c < "$backup_file" | tr -d ' ')"
echo "Backup created: $backup_file ($bytes bytes)"
