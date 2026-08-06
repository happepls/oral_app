#!/usr/bin/env bash
set -euo pipefail

action="${1:-}"
expected="${2:-}"
confirmation="${3:-}"

if [[ -z "${PGHOST:-}" || -z "${PGDATABASE:-}" || -z "${PGUSER:-}" ]]; then
  echo "PGHOST, PGDATABASE, and PGUSER must be provided through the environment." >&2
  exit 2
fi

count_abandoned() {
  psql -X -v ON_ERROR_STOP=1 -Atc \
    "SELECT COUNT(*) FROM user_goals WHERE status = 'abandoned';"
}

count_subscription_candidates() {
  psql -X -v ON_ERROR_STOP=1 -Atc \
    "SELECT COUNT(*) FROM users WHERE subscription_status = 'active' AND (NULLIF(stripe_customer_id, '') IS NULL OR NULLIF(stripe_subscription_id, '') IS NULL);"
}

case "$action" in
  count-abandoned)
    echo "abandoned_goal_candidates=$(count_abandoned)"
    ;;
  apply-abandoned)
    if [[ ! "$expected" =~ ^[0-9]+$ || "$confirmation" != "CONFIRM_ARCHIVE_ABANDONED" ]]; then
      echo "Usage: PGHOST=... PGDATABASE=... PGUSER=... PGPASSWORD=... $0 apply-abandoned <expected-count> CONFIRM_ARCHIVE_ABANDONED" >&2
      exit 2
    fi
    actual="$(count_abandoned)"
    if [[ "$actual" != "$expected" ]]; then
      echo "Candidate count changed; expected=$expected actual=$actual. No rows changed." >&2
      exit 1
    fi
    updated="$(psql -X -v ON_ERROR_STOP=1 -v expected="$expected" -Atq <<'SQL'
BEGIN;
LOCK TABLE user_goals IN SHARE ROW EXCLUSIVE MODE;
WITH candidate_count AS (
  SELECT COUNT(*) AS value FROM user_goals WHERE status = 'abandoned'
), updated AS (
  UPDATE user_goals
  SET status = 'archived', completed_at = NULL, updated_at = NOW()
  WHERE status = 'abandoned'
    AND (SELECT value FROM candidate_count) = :expected::bigint
  RETURNING 1
)
SELECT CASE
  WHEN (SELECT value FROM candidate_count) = :expected::bigint
  THEN (SELECT COUNT(*) FROM updated)
  ELSE -1
END;
COMMIT;
SQL
    )"
    if [[ "$updated" != "$expected" ]]; then
      echo "Candidate count changed inside the transaction. No rows changed." >&2
      exit 1
    fi
    echo "Archived the approved anonymous candidate set."
    ;;
  count-subscription-candidates)
    echo "active_subscription_candidates_missing_stripe_link=$(count_subscription_candidates)"
    echo "Read-only result only; no entitlement changes are implemented by this release."
    ;;
  *)
    echo "Usage: PGHOST=... PGDATABASE=... PGUSER=... PGPASSWORD=... $0 {count-abandoned|apply-abandoned <count> CONFIRM_ARCHIVE_ABANDONED|count-subscription-candidates}" >&2
    exit 2
    ;;
esac
