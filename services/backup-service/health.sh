#!/usr/bin/env bash
set -euo pipefail

STATUS_FILE="${BACKUP_STATUS_FILE:-/var/lib/oral-backup/status.json}"
MAX_AGE_SECONDS="${BACKUP_MAX_AGE_SECONDS:-93600}"
[[ -f "${STATUS_FILE}" ]] || { echo '{"status":"missing"}'; exit 1; }

age=$(( $(date +%s) - $(stat -c %Y "${STATUS_FILE}") ))
cat "${STATUS_FILE}"
if (( age > MAX_AGE_SECONDS )); then
  echo "backup status is stale (${age}s)" >&2
  exit 1
fi
rg -q '"status":"ok"' "${STATUS_FILE}"
