#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
ENV_FILE="${ENV_FILE:-.env.staging}"
RESTORE_TARGET_ENV="${RESTORE_TARGET_ENV:-staging}"
REQUIRED_CONFIRMATION="I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA"

usage() {
  cat <<'USAGE'
Usage:
  CONFIRM_RESTORE=I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA pnpm ops:staging:restore -- backups/staging/<file>.dump
  CONFIRM_RESTORE=I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA sh scripts/ops/staging-restore-db.sh backups/staging/<file>.dump

Destructively replaces the staging/local PostgreSQL database with a custom-format dump.

Required:
  CONFIRM_RESTORE=I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA

Optional:
  RESTORE_TARGET_ENV=staging|local  (default: staging)
  COMPOSE_FILE=docker-compose.staging.yml
  ENV_FILE=.env.staging
USAGE
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

backup_file="${1:-}"

if [ -z "$backup_file" ]; then
  usage >&2
  exit 1
fi

if [ ! -f "$backup_file" ]; then
  echo "Backup file not found: $backup_file" >&2
  exit 1
fi

case "$RESTORE_TARGET_ENV" in
  staging|local)
    ;;
  production)
    echo "Refusing to restore into production from this staging/local script." >&2
    exit 1
    ;;
  *)
    echo "RESTORE_TARGET_ENV must be staging or local. Got: $RESTORE_TARGET_ENV" >&2
    exit 1
    ;;
esac

if [ "${CONFIRM_RESTORE:-}" != "$REQUIRED_CONFIRMATION" ]; then
  echo "Restore is destructive. Set CONFIRM_RESTORE=$REQUIRED_CONFIRMATION to continue." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it from .env.staging.example before restoring staging." >&2
  exit 1
fi

echo "Restoring $backup_file into $RESTORE_TARGET_ENV database defined by $COMPOSE_FILE."
echo "Stopping web/worker to avoid active application connections during restore."

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d postgres
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop web worker >/dev/null 2>&1 || true

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres sh -c '
  set -eu
  dropdb --if-exists --force -U "$POSTGRES_USER" "$POSTGRES_DB"
  createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
  pg_restore --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"
' < "$backup_file"

echo "Restore completed. Run migrations if needed, then start staging and validate health/login."
