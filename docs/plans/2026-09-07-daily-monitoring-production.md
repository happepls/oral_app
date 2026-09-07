# Daily monitoring production rollout — 2026-09-07

## Authorization and scope

The user confirmed PR #54 was merged and requested deployment and automatic monitoring. This authorizes enabling the schedule immediately; it does not establish full-day metric acceptance. Root SDLC artifacts remain owned by the existing loop. This record covers deployment, sampling, authentication and workflow verification only.

## Deployed evidence

- Reviewed merge: `d5da6cbc89f1a4ca6f2a0b3422f14825f3095213` (PR #54).
- Additive migration `services/user-service/migrations/20260907_daily_monitoring.sql` created `monitor_user_minutes` and `monitor_backup_success`; existing business tables were not changed.
- user-service image: `ghcr.io/happepls/oral_app/user-service:d5da6cb`; deployment `6a9e9f413aa3b4323a8b6d35`, RUNNING, merge SHA, created 11:25:53 UTC.
- backup-service deployment `6a9e9f5c3aa3b4323a8b6d3a`, RUNNING, merge SHA, created 11:26:20 UTC.
- Runtime source hashes matched the reviewed user collector and backup scripts.
- A dedicated bearer token was configured in user-service and GitHub `ZEABUR_TOKEN` through memory/stdin only. It is not a Zeabur platform administration token.
- `MONITOR_MEMORY_BUDGET_BYTES=536870912` explicitly supplies the monitoring denominator where the production cgroup is unlimited.
- `BACKUP_MONITOR_ENABLED=true` was verified both in the service environment and independently in `/run/oral-backup.env` used by cron.
- The genuine last successful backup timestamp, `2026-09-06T18:30:10Z`, was imported from the backup status file using a monotonic update. No new backup or synthetic success was generated during rollout. The next scheduled successful upload must verify ongoing reporter writes.

## Monitoring enabled

- GitHub `ZEABUR_AGGREGATES_URL` points to `https://guajiguaji.top/api/users/monitoring/daily`.
- `DAILY_AGGREGATES_ENABLED=true` was read back after configuration; `sdlc-maintain.yml` is active.
- Basic health continues every 15 minutes; daily aggregation runs at `15 0 * * *` (08:15 Asia/Shanghai), covering the previous complete UTC day.
- Existing `PRODUCTION_HEALTH_URL=https://guajiguaji.top/api/users/health` was preserved.
- Sampling began around 11:27 UTC September 7. First complete eligible UTC day is September 8, making September 9 at 08:15 Beijing the earliest complete daily report, contingent on coverage and traffic. The second-day baseline requires another day. Missing coverage remains a visible failure, never a fabricated zero or green result.

## Verification

- Public health and Stripe prices returned HTTP 200 JSON.
- Missing bearer, invalid bearer, and cookie-only monitoring authentication returned HTTP 401 with `authorized: false`.
- Correct bearer returned HTTP 503 with `available: false`, expected before a complete day. Monitoring responses used `Cache-Control: no-store`.
- Read-only database observations showed minute rows increasing from 2 to 7; latest sample age 68 seconds, request sample count 1, 5xx count 0, peak memory ratio about 0.093. These are startup observations, not daily metrics.
- Master Docker build/push, CI Pipeline, Security Scan and SDLC Governance succeeded.
- [Production health run 34117085588](https://github.com/happepls/oral_app/actions/runs/34117085588) succeeded on the merge SHA.
- [Daily run 34117199273](https://github.com/happepls/oral_app/actions/runs/34117199273) failed as expected during warm-up. Downloaded evidence contained `severity: diagnose`, reason `daily_aggregate_unavailable`, and `metrics: null`. Summary and evidence upload succeeded.

## Diagnostic queue follow-up

The daily run exposed a workflow defect: the diagnostic queue was skipped after the aggregate collector failed because its condition implicitly required `success()`. The follow-up adds an explicit `always()` guard while still requiring diagnose/immediate severity, plus `pull-requests: read` for the queue's `gh pr list` when using the built-in token. Production scheduling and evidence upload are already active; this queue repair requires its own reviewed PR before it reaches the default branch. It does not change application code or thresholds.

Regression coverage exercises healthy/empty/diagnose/immediate severities with both successful and failed earlier steps, and the required token scopes. Full-day trend acceptance and the next scheduled backup reporter write remain pending real observations.

## Rollback

Disable only aggregate collection with GitHub variable `DAILY_AGGREGATES_ENABLED=false`; basic health remains active. If application rollback is needed, restore the prior user-service image `ghcr.io/happepls/oral_app/user-service:a2424d8` and redeploy. Set backup `BACKUP_MONITOR_ENABLED=false` and redeploy to disable reporting while retaining the existing backup job. Leave additive monitoring tables intact. No frontend change or new public page is part of this release.
