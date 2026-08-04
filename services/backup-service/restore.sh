#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: restore.sh cos://bucket/backups/oral-app/.../bundle.tar.gz" >&2
  exit 2
fi
if [[ "${ALLOW_BACKUP_RESTORE:-}" != "true" ]]; then
  echo "set ALLOW_BACKUP_RESTORE=true only for an isolated restore target" >&2
  exit 2
fi
if [[ -z "${RESTORE_POSTGRES_URL:-}" || -z "${RESTORE_MONGO_URI:-}" || -z "${BACKUP_COS_REGION:-}" || -z "${COS_SECRET_ID:-}" || -z "${COS_SECRET_KEY:-}" ]]; then
  echo "RESTORE_POSTGRES_URL, RESTORE_MONGO_URI, BACKUP_COS_REGION, COS_SECRET_ID and COS_SECRET_KEY are required" >&2
  exit 2
fi

OBJECT="$1"
if [[ "${OBJECT}" != cos://*/backups/oral-app/*/*.tar.gz ]]; then
  echo "refusing restore object outside backups/oral-app" >&2
  exit 2
fi

RESTORE_TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "${RESTORE_TMP_DIR}"' EXIT
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
coscli cp "${OBJECT}" "${RESTORE_TMP_DIR}/bundle.tar.gz" "${COS_ARGS[@]}"
coscli cp "${OBJECT}.sha256" "${RESTORE_TMP_DIR}/bundle.tar.gz.sha256" "${COS_ARGS[@]}"
(
  cd "${RESTORE_TMP_DIR}"
  sha256sum -c bundle.tar.gz.sha256
  mkdir bundle
  tar -xzf bundle.tar.gz -C bundle
  cd bundle
  sha256sum -c SHA256SUMS
)

pg_restore \
  --dbname="${RESTORE_POSTGRES_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "${RESTORE_TMP_DIR}/bundle/postgres.dump"

mongorestore \
  --uri="${RESTORE_MONGO_URI}" \
  --archive="${RESTORE_TMP_DIR}/bundle/mongo.archive.gz" \
  --gzip \
  --drop

echo "restore completed and checksums verified"
