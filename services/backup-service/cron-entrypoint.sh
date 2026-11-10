#!/usr/bin/env bash
set -euo pipefail

# Normalize local aliases before exporting the restricted cron environment.
COS_SECRET_ID="${COS_SECRET_ID:-${TENCENT_SECRET_ID:-}}"
COS_SECRET_KEY="${COS_SECRET_KEY:-${TENCENT_SECRET_KEY:-}}"

names=(
  POSTGRES_HOST POSTGRES_PORT POSTGRES_DB POSTGRES_USER PGPASSWORD MONGO_URI
  BACKUP_COS_BUCKET BACKUP_COS_REGION BACKUP_COS_PREFIX BACKUP_ALERT_WEBHOOK
  BACKUP_STATUS_FILE BACKUP_MONITOR_ENABLED COS_SECRET_ID COS_SECRET_KEY COS_SESSION_TOKEN
)
umask 077
: > /run/oral-backup.env
for name in "${names[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    printf 'export %s=%q\n' "${name}" "${!name}" >> /run/oral-backup.env
  fi
done

exec cron -f
