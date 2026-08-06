#!/usr/bin/env bash
set -euo pipefail

# Local compose already keeps Tencent COS credentials in the ignored media
# service env file. Accept those names while retaining COS_* for production
# least-privilege credentials.
COS_SECRET_ID="${COS_SECRET_ID:-${TENCENT_SECRET_ID:-}}"
COS_SECRET_KEY="${COS_SECRET_KEY:-${TENCENT_SECRET_KEY:-}}"

required=(POSTGRES_HOST POSTGRES_PORT POSTGRES_DB POSTGRES_USER PGPASSWORD MONGO_URI BACKUP_COS_BUCKET BACKUP_COS_REGION COS_SECRET_ID COS_SECRET_KEY)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "missing required environment variable: ${name}" >&2
    exit 2
  fi
done

COS_PREFIX="${BACKUP_COS_PREFIX:-backups/oral-app}"
if [[ "${COS_PREFIX}" != "backups/oral-app" && "${COS_PREFIX}" != backups/oral-app/* ]]; then
  echo "BACKUP_COS_PREFIX must stay under backups/oral-app" >&2
  exit 2
fi

BACKUP_TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "${BACKUP_TMP_DIR}"' EXIT
COS_ARGS=(
  --init-skip=true
  --secret-id "${COS_SECRET_ID}"
  --secret-key "${COS_SECRET_KEY}"
  --endpoint "cos.${BACKUP_COS_REGION}.myqcloud.com"
  --disable-log
)
if [[ -n "${COS_SESSION_TOKEN:-}" ]]; then
  COS_ARGS+=(--token "${COS_SESSION_TOKEN}")
fi

STAMP="$(TZ=Asia/Shanghai date +%Y%m%dT%H%M%S%z)"
DAY="$(TZ=Asia/Shanghai date +%Y-%m-%d)"
MONTH="$(TZ=Asia/Shanghai date +%Y-%m)"
BUNDLE="${BACKUP_TMP_DIR}/${STAMP}"
mkdir -p "${BUNDLE}"

pg_dump \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${BUNDLE}/postgres.dump"

mongodump \
  --uri="${MONGO_URI}" \
  --archive="${BUNDLE}/mongo.archive.gz" \
  --gzip

(
  cd "${BUNDLE}"
  sha256sum postgres.dump mongo.archive.gz > SHA256SUMS
)

tar -C "${BUNDLE}" -czf "${BACKUP_TMP_DIR}/${STAMP}.tar.gz" .
(
  cd "${BACKUP_TMP_DIR}"
  sha256sum "${STAMP}.tar.gz" > "${STAMP}.tar.gz.sha256"
)

upload() {
  local source="$1"
  local destination="$2"
  coscli cp "${source}" "cos://${BACKUP_COS_BUCKET}/${destination}" \
    --encryption-type SSE-COS \
    --server-side-encryption AES256 \
    --forbid-overwrite=true \
    "${COS_ARGS[@]}"
}

DAILY_KEY="${COS_PREFIX}/daily/${DAY}/${STAMP}.tar.gz"
upload "${BACKUP_TMP_DIR}/${STAMP}.tar.gz" "${DAILY_KEY}"
upload "${BACKUP_TMP_DIR}/${STAMP}.tar.gz.sha256" "${DAILY_KEY}.sha256"

if [[ "$(TZ=Asia/Shanghai date +%d)" == "01" ]]; then
  MONTHLY_KEY="${COS_PREFIX}/monthly/${MONTH}/${STAMP}.tar.gz"
  upload "${BACKUP_TMP_DIR}/${STAMP}.tar.gz" "${MONTHLY_KEY}"
  upload "${BACKUP_TMP_DIR}/${STAMP}.tar.gz.sha256" "${MONTHLY_KEY}.sha256"
fi

STATUS_FILE="${BACKUP_STATUS_FILE:-/var/lib/oral-backup/status.json}"
mkdir -p "$(dirname "${STATUS_FILE}")"
printf '{"status":"ok","completed_at":"%s","object":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${DAILY_KEY}" > "${STATUS_FILE}"

if [[ -n "${BACKUP_ALERT_WEBHOOK:-}" ]]; then
  curl --fail --silent --show-error \
    -H 'Content-Type: application/json' \
    -d "{\"status\":\"ok\",\"object\":\"${DAILY_KEY}\"}" \
    "${BACKUP_ALERT_WEBHOOK}" >/dev/null
fi

echo "backup complete: ${DAILY_KEY}"
