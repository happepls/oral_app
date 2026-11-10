# Pro device sessions and Discovery focus

Approved implementation: user requested implementation of the proposed plan on
2026-11-09. Changes are on `feat/pro-device-discovery`; no production rollout or
merge is approved. Historical root SDLC bootstrap artifacts are preserved.

## Behavior

Pro membership uses the existing effective membership policy, including prepaid
membership and trials. Two browser devices may stay signed in. A third login
revokes the oldest login, not the least recently used device. Same-browser tabs
share an httpOnly `loginDevice` cookie; reauthentication reuses their session and
preserves its initial order. Other browsers and private windows count separately.
The server stores a hash of the random browser identifier, not a fingerprint.

`login_sessions` stores durable session IDs, expiry and revocation. Account-row
locks serialize creation and upgrade enforcement. Access/refresh JWTs carry
`sid`; expiration remains bounded by the session even after token refresh.
Logout revokes the session. Pro legacy JWTs without a session require login
again after activation; free accounts retain the existing unlimited policy.

REST authorization, verify/migrate/refresh, first-party developer API requests,
realtime tickets and scoped first-party history/conversation tokens validate
the session. Revoked sessions return HTTP 401 with `SESSION_REVOKED` (nested
under `error.code` for developer API). Storage/authority failures return 503.
Partner grants retain their separate lifecycle and do not count as browser
devices. Partner AI bridge tokens recheck their persisted grant.

Redis/SSE sends best-effort targeted revocation wakeups. Comms checks before
forwarding messages, coalesces simultaneous checks and bounds buffered bytes;
idle sockets revalidate every 10 seconds with a 5-second authority timeout.
Browser pages without SSE also revalidate every 10 seconds, and on visibility
return. Background browser scheduling can delay UI notices; server-side checks
still reject revoked access. No additional business WebSocket is introduced.

Discovery now presents continue-practice, scenes, daily tasks, streak and stats
in DOM/tab order. It uses the first unfinished authorized scene from the active
goal snapshot. Existing scene-session matching and task selection remain intact.
Cards use one/two/three columns at phone/tablet/desktop widths. Auxiliary errors
and pending requests do not block the goal or continue button. Existing tour
anchors, scoring contracts and membership gates remain in place.

The decorative transition lives outside route Suspense and lasts at most 400ms;
navigation starts immediately. A pre-existing script-free local Rive export is
bundled with same-origin WASM; its four-second authored animation is scrubbed
through in 400ms. Reduced motion and asset failure use static feedback. The
component unmounts and cancels its frame loop when finished or leaving the route.
CLI was updated from 1.8.0 to 1.9.2 and source verification passed. New export
requires unavailable account login, so no new signed export or cloud upload was
performed. The previously generated local export was verified in Chromium.

## Rollout and rollback

1. Apply `services/user-service/migrations/20261109_device_sessions.sql` before
   enabling anything. This additive migration does not rewrite existing users.
2. Deploy compatible user, developer-api, comms, history and conversation
   backends with `DEVICE_SESSION_LIMIT_ENABLED=false`; then deploy the client.
3. Set `DEVICE_SESSION_LIMIT_ENABLED=true` consistently on those five services.
   Compose exposes the flag with a default of false. Existing Pro sessions must
   sign in again. Verify two devices plus a third-device eviction, including a
   running conversation, before declaring rollout accepted.
4. Watch revoked/503 responses and authority latency. Roll back by disabling the
   flag consistently and reverting application changes; retain the additive
   table. Logout still revokes tokens carrying a session ID during rollback.

Production migration, flags, deployment and three-device production acceptance
have not been executed. No Stripe SDK, Checkout or webhook behavior changed.

## Backup diagnosis and local repair

The old running image had Tencent credentials but cron exported only COS names.
The job failed with `missing required environment variable: COS_SECRET_ID`
and exit code 2. The entrypoint now normalizes aliases, preferring explicit COS
values; its restricted environment file stays mode 0600. Cron explicitly uses
Bash for shell-quoted exports. The image also pins the system timezone to
Asia/Shanghai; the old local image was using UTC despite the crontab timezone
line. Startup health checks now run every five seconds during the existing
startup grace period, then retain the hourly interval.

The normal PostgreSQL 18 image build stalled downloading OS packages. For local
recovery only, the existing image was rebuilt with current scripts/crontab and
timezone, then the backup container alone was recreated. This derived local
image uses pg_dump 16 against the local PostgreSQL 14 server. It must not be
promoted to production; production still requires the checked-in PostgreSQL 18
Dockerfile and its full dependency build.

Actual backup completed at 2026-11-09 14:50:46 Asia/Shanghai. The archive and
checksum uploaded successfully. Downloading both objects again produced an
identical SHA-256; the archive lists postgres.dump, mongo.archive.gz and
SHA256SUMS. Health is healthy. This verifies upload/integrity, not a database
restore rehearsal; the next scheduled run still needs observation.

## Verification evidence

- `python3 quality/tests/backup-cron.test.py`: 3 passed (aliases, explicit
  precedence, missing credentials, shell quoting and mode 0600).
- Real PostgreSQL integration: 6 passed in a disposable schema, including
  concurrent logins, same-browser order, free-to-Pro upgrade, expiry, password
  login, authenticated REST, verify/migrate, refresh, logout and authority outage.
- Comms: 13 passed, including four cross-service authority checks, revoked messages never reaching AI and denied
  reconnect. History: 15 passed; conversation: 5 passed; developer API: 27 passed.
- Existing front-end tests: 704 passed. User-service full suite: 217 passed
  at the first integration revision; final targeted integration rerun passed.
- Discovery browser checks: 9 authority cases and 3 pending-auxiliary cases
  passed at 375/768/1440px. An additional mobile project pending case passed.
- Rive browser checks: normal rendering, reduced motion and missing asset passed;
  captured normal rendering and Discovery phone layout were visually inspected.
- `npm run verify`: pass, score 100. `npm run lint`: no errors, existing warnings.
  Front-end production build passed with existing hook/Browserslist warnings.

Screenshots and command reports are local ignored artifacts under
`quality/artifacts/`. They are not production evidence. Self-review traced the
auth and websocket call chains; no independent reviewer approval is claimed.

## UI audit follow-up

The initial PR run failed seven UI cases. The existing Discovery screenshot
baseline still showed the old order and 720px shell; the partial-failure test
also required that old maximum. The optional-request test matched both the new
continue heading and the scene card by the same text. Three WebKit transition
cases reported page errors because their catch-all JSON API fixture also
answered the EventSource endpoint.

The follow-up keeps the approved 1120px layout and changes the width assertion
to require the expected responsive shell size, with an explicit document
overflow check. The pending-request test scopes the title to the scene list
and also checks that the primary continue action is enabled. The transition
fixture now returns `text/event-stream` for SSE, registered after its JSON
fallback. The empty page-error assertion, accessibility checks and screenshot
thresholds remain unchanged; no test is skipped.

Only Discovery baselines change, across all ten Chromium viewport/theme
combinations on both platforms. macOS snapshots were regenerated through the
existing audit, including accessibility and clipping assertions. Linux images
come from the same application head `808be3e` in the version-pinned CI container:
https://github.com/happepls/oral_app/actions/runs/42581401370 . That capture run
was expected to fail against the old screenshots; it is baseline provenance,
not a passing verification run. Before accepting the candidates, old/new
desktop views, narrow mobile and dark/English views were visually inspected.
The final PR checks remain the authority for merge readiness.

Local targeted regression: all ten transition/partial-failure/pending-request
executions passed on Chromium desktop and mobile WebKit. All ten macOS
Discovery viewport/theme audits passed during snapshot generation. Full local
and hosted PR checks are recorded on the follow-up commit and PR checks;
this note does not grant merge or production deployment approval.
