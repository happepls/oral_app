# GitHub → Zeabur production / GEO release gate

This runbook is evidence-first. The 2026-08-06 release approval explicitly includes pausing the existing Git-backed production services immediately before merge and adding `developer-api-service` plus `backup-service` after merge. It does not authorize unrelated production mutations. Record IDs in the release ticket; never paste secrets, cookies, tickets, or private service URLs into the ticket or command output.

## Fixed target

- Repository: `happepls/oral_app`
- PR branch: `agent/production-zeabur-geo`
- Zeabur project: `6a0d7fd433d1a635fa37f18b` (`oral-app`)
- Environment: the existing uniquely named `production` environment only
- Artifact identity: merge SHA and GHCR tags `sha-<merge_sha>`

Stop if the workspace, project, environment, or any existing service ID is missing or ambiguous. Before creating either approved new service, repeat the production inventory and stop if a same-named service now exists.

## Deployment topology: Zeabur does not run Compose

The current Zeabur production project is a set of independent Git-backed services. For each service, Zeabur checks out `master`, uses the Root Directory configured in the panel (for example `services/ai-omni-service`, `services/backup-service`, `api-gateway`, or `client`), and builds that directory's Dockerfile. PostgreSQL, MongoDB, Redis, variables, private networking, and volumes are managed by Zeabur rather than by a repository Compose file.

- `docker-compose.yml` plus the automatically loaded `docker-compose.override.yml`: local development and integration only.
- `docker-compose.prod.yml`: the separate self-hosted, image-based production target used only by the manually dispatched `.github/workflows/deploy.yml` SSH workflow.
- Zeabur production: no Compose file. Select the existing project, the unique `production` environment, and the existing service IDs; never run either Compose target against Zeabur and never create a duplicate all-in-one service.

The self-hosted Compose workflow and the Zeabur rollout are mutually exclusive deployment paths. The release described by this runbook uses only the Zeabur path.

## Pre-merge evidence

1. `git status --short --branch` is clean and the branch contains the six local commits based on `origin/master`.
2. Run:
   - `python -m pytest services/ai-omni-service/tests/test_dashscope_config.py services/ai-omni-service/tests/test_dashscope_routing_static.py`
   - workflow service tests
   - client tests and `cd client && npm run build`
   - `npm run verify:geo`
   - `python test_scenario_batch_and_daily_qa.py --scenario all --mock`
   - `gitleaks git --verbose --config .gitleaks.toml`
   - `git diff --check`
3. Immediately before merge, suspend the nine Git-backed production services listed below by exact service ID. Do not suspend PostgreSQL, MongoDB, or Redis. Record each pre-suspend deployment ID for rollback.
4. Open a draft PR, wait for `CI Pipeline` and `ui-audit`, then mark ready. Merge with a merge commit so the six commits remain visible.
5. On the merge SHA, require `CI Pipeline`, `ui-audit`, and `Docker Build and Push`. Confirm every service image has the exact `sha-<merge_sha>` tag.

## Production configuration gate

Resolve and record the version printed by `npx zeabur@latest --version`. Authenticate interactively, select the existing workspace, project, and production environment, and list existing service IDs before any deploy command.

The AI service must start only with this topology:

- `DASHSCOPE_WS_URL` and `DASHSCOPE_HTTP_BASE`: HTTPS/WSS hosts ending in `.maas.aliyuncs.com`, routed only with `DASHSCOPE_API_KEY`.
- `DASHSCOPE_CHAT_BASE` and `DASHSCOPE_IMAGE_BASE`: `dashscope.aliyuncs.com` or `dashscope-intl.aliyuncs.com`, routed only with `QWEN3_OMNI_API_KEY`.
- Both keys and all four URLs must exist in production. Validate presence and endpoint class only; do not print values.

Record the current deployment ID, service health/log baseline, and a successful backup before migration or rollout.

### CLI discovery evidence — 2026-08-06

Official Zeabur CLI `v0.21.0` (`dc6168a42629745520ff2a652d2d433f54f6c153`) was downloaded from `zeabur/cli` and verified against the release checksum. The authenticated account can access exactly one project named `oral-app`.

- Project: `oral-app` / `6a0d7fd433d1a635fa37f18b`
- Environment: `production` / `6a0d7fd4f3b70f2a79fbd8fd`
- Current user-service deployment baseline: `6a510d39019866a087e6d803`, commit `90bfbf9e753d52c84ccc3e12eed8454ac46d69ee`, status `RUNNING`

| Service | Service ID | Git trigger |
|---|---|---|
| redis | `6a0d824640a883532f336286` | none |
| postgresql | `6a0d80f540a883532f3361db` | none |
| mongodb | `6a0d816640a883532f3361fe` | none |
| user-service | `6a361c21b2350c13adc3f31e` | `master` |
| workflow-service | `6a361c32558aac447d435dcf` | `master` |
| media-processing-service | `6a361c3b558aac447d435dd4` | `master` |
| history-analytics-service | `6a361c44b2350c13adc3f323` | `master` |
| conversation-service | `6a361c4c558aac447d435dd8` | `master` |
| ai-omni-service | `6a361c55b2350c13adc3f327` | `master` |
| comms-service | `6a361c5d558aac447d435ddc` | `master` |
| api-gateway | `6a361e40558aac447d435f27` | `master` |
| app gateway | `6a39e744e41f9f1d192fec39` | none |
| client-app | `6a39eb0fe41f9f1d192fecb9` | `master` |

`developer-api-service` and `backup-service` were not returned by the production inventory and are explicitly approved additions for this release. The repository ID resolved by the authenticated CLI is `742252005` (`happepls/oral_app`). The nine Git-backed services above auto-deploy `master`; suspend those exact services only when the PR is ready to merge, then verify the merge-SHA Actions gates before resuming the rollout.

### Approved new production services

Create these only after the merge commit exists and a repeated inventory proves both names are absent:

| Service | Git branch | Root Directory | Port / process |
|---|---|---|---|
| `developer-api-service` | `master` | `services/developer-api-service` | private port `3010`, `/health` |
| `backup-service` | `master` | `services/backup-service` | private cron worker; no public port |

Zeabur CLI `v0.21.0` can create Git services but cannot set monorepo Root Directory, port, or persistent volume. After CLI creation, set those fields on the two newly returned IDs in the production panel before redeploying. Do not expose either service publicly.

- Developer API variables: `PORT=3010`, production `DATABASE_URL`, `DELEGATED_JWT_SECRET`, the shared `JWT_SECRET`, the shared `INTERNAL_AUTH_SECRET`, `AI_UPSTREAM_TIMEOUT_MS=60000`, and `NODE_ENV=production`.
- Backup variables: production PostgreSQL connection fields, production `MONGO_URI`, least-privilege `COS_SECRET_ID`/`COS_SECRET_KEY`, `BACKUP_COS_BUCKET`, `BACKUP_COS_REGION`, `BACKUP_COS_PREFIX=backups/oral-app`, optional session token/alert webhook, and `BACKUP_STATUS_FILE=/var/lib/oral-backup/status.json`.
- Attach a persistent volume at `/var/lib/oral-backup`. After the worker starts, execute `/opt/oral-backup/run-with-alert.sh` once and require exit code 0 plus `/opt/oral-backup/health.sh` success before any migration. This first successful backup is the production backup gate.

## Migration gates

Apply the idempotent structural migrations first. They create compatible tables and indexes but do not rewrite goal status or subscription entitlement.

Use `scripts/release/data-migration-gate.sh` with standard `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` environment variables. The connection secret is never placed in a process argument:

- `count-abandoned`: record only the anonymous count. If non-zero, attach the evidence and obtain explicit approval. Apply only with the same expected count and `CONFIRM_ARCHIVE_ABANDONED`.
- `count-subscription-candidates`: record only the anonymous count. The current release has no subscription downgrade action. Reconcile candidates against Stripe and obtain a separate future approval before any entitlement repair.

## Staged rollout and smoke

Deploy the same merge SHA by existing service ID, in this order, checking health after each group:

1. user and workflow services
2. AI, comms, conversation, history, media, developer API, and backup services
3. api-gateway
4. client

Smoke the public homepage/GEO files, login, goal setting, Discovery, realtime ticket, one MaaS WS exchange, history, media proxy, public Stripe product read, and every service health route.

## Controlled production probes

Install the isolated probe dependencies from `scripts/load/requirements.txt`.

- HTTP: `scripts/run-load-test.sh --target https://guajiguaji.top --production --confirm-production-read-only`
- WS: provide one or two existing synthetic account pairs through `WS_CANARY_ACCOUNT_<n>_EMAIL/PASSWORD`, then run `python scripts/load/ws_canary.py --target https://guajiguaji.top --production --confirm-production-canary`.

The HTTP profile is GET-only and runs 5 → 10 → 20 users over five minutes. Stop and roll back the application deployment if two consecutive 30-second windows breach 5xx `<1%`, p95 `<1s`, p99 `<2s`, or any unexpected 429. Also stop immediately for resource use above 80%, auth/payment data anomalies, or either WS failing to connect within 10 seconds.

Rollback restores the recorded previous application deployment. Keep additive compatibility tables/columns. No subscription entitlement downgrade is part of this release, so no entitlement reverse migration is required.
