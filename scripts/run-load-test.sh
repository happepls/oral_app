#!/usr/bin/env bash
set -euo pipefail

target=""
production=false
confirmed=false

usage() {
  echo "Usage: $0 --target https://host [--production --confirm-production-read-only]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) target="${2:-}"; shift 2 ;;
    --production) production=true; shift ;;
    --confirm-production-read-only) confirmed=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

if [[ -z "$target" || ! "$target" =~ ^https?://[^/]+/?$ ]]; then
  echo "A scheme and host-only --target is required." >&2
  exit 2
fi

if [[ "$production" == true && "$confirmed" != true ]]; then
  echo "Production load tests require --confirm-production-read-only." >&2
  exit 2
fi

if [[ "$target" =~ ^https://(www\.)?guajiguaji\.top/?$ && "$production" != true ]]; then
  echo "The production host requires --production and --confirm-production-read-only." >&2
  exit 2
fi

python3 -m locust \
  -f scripts/load/locustfile.py \
  --host "$target" \
  --headless \
  --csv "${LOAD_TEST_REPORT_PREFIX:-/tmp/guaji-readonly-load}" \
  --only-summary
