#!/usr/bin/env bash
set -euo pipefail

COS_SECRET_ID="${COS_SECRET_ID:-${TENCENT_SECRET_ID:-}}"
COS_SECRET_KEY="${COS_SECRET_KEY:-${TENCENT_SECRET_KEY:-}}"

if [[ $# -ne 1 ]]; then
  echo "usage: restore.sh cos://bucket/backups/oral-app/.../bundle.tar.gz" >&2
  exit 2
fi
if [[ "${ALLOW_BACKUP_RESTORE:-}" != "true" ]]; then
  echo "set ALLOW_BACKUP_RESTORE=true only for an isolated restore target" >&2
  exit 2
fi
if [[ -z "${RESTORE_POSTGRES_URL:-}" || -z "${RESTORE_MONGO_URI:-}" || -z "${RESTORE_MONGO_TARGET_DB:-}" || -z "${BACKUP_COS_REGION:-}" || -z "${COS_SECRET_ID:-}" || -z "${COS_SECRET_KEY:-}" ]]; then
  echo "RESTORE_POSTGRES_URL, RESTORE_MONGO_URI, RESTORE_MONGO_TARGET_DB, BACKUP_COS_REGION, COS_SECRET_ID and COS_SECRET_KEY are required" >&2
  exit 2
fi

RESTORE_MONGO_SOURCE_DB="${RESTORE_MONGO_SOURCE_DB:-oral_app_history}"
if [[ ! "${RESTORE_MONGO_TARGET_DB}" =~ ^[A-Za-z0-9_-]{1,63}$ ]] || [[ "${RESTORE_MONGO_TARGET_DB}" =~ ^(oral_app_history|admin|config|local)$ ]]; then
  echo "RESTORE_MONGO_TARGET_DB must be an explicitly named isolated database" >&2
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
  EXPECTED_BUNDLE_SHA256="$(awk 'NR == 1 { print $1 }' bundle.tar.gz.sha256)"
  ACTUAL_BUNDLE_SHA256="$(sha256sum bundle.tar.gz | awk '{ print $1 }')"
  if [[ ! "${EXPECTED_BUNDLE_SHA256}" =~ ^[0-9a-fA-F]{64}$ ]] || [[ "${EXPECTED_BUNDLE_SHA256}" != "${ACTUAL_BUNDLE_SHA256}" ]]; then
    echo "bundle.tar.gz: FAILED checksum verification" >&2
    exit 1
  fi
  echo "bundle.tar.gz: OK"
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
  --nsFrom="${RESTORE_MONGO_SOURCE_DB}.*" \
  --nsTo="${RESTORE_MONGO_TARGET_DB}.*" \
  --drop

echo "restore completed and checksums verified"
