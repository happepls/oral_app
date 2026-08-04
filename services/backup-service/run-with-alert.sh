#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set +e
"${SCRIPT_DIR}/backup.sh"
code=$?
set -e
if [[ "${code}" -eq 0 ]]; then
  exit 0
fi

STATUS_FILE="${BACKUP_STATUS_FILE:-/var/lib/oral-backup/status.json}"
mkdir -p "$(dirname "${STATUS_FILE}")"
printf '{"status":"failed","failed_at":"%s","exit_code":%d}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${code}" > "${STATUS_FILE}"

if [[ -n "${BACKUP_ALERT_WEBHOOK:-}" ]]; then
  curl --silent --show-error \
    -H 'Content-Type: application/json' \
    -d "{\"status\":\"failed\",\"exit_code\":${code}}" \
    "${BACKUP_ALERT_WEBHOOK}" >/dev/null || true
fi
exit "${code}"
