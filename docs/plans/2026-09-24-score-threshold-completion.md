# Complete earned scene tasks automatically

## Request and authorization

The user explicitly requests treating the former 99% state as completed and
automatically switching sub-tasks. This supersedes the last-window quality and
manual-confirmation requirement. Implementation is authorized by that request;
merge and production release remain human decisions. The unrelated root SDLC
bootstrap artifacts and user edits are preserved.

## Evidence and design

The batch scorer caps scores at 9 but its readiness gate also requires the last
window to be satisfactory. Even readiness only offers manual confirmation. The
reported task 371 therefore continues receiving delta=1 without completion.

Use the existing User Service completion authority and AI task-switch events:

1. Add an internal-only automatic confirmation path that checks persisted score
   >=9 and the expected scoring generation; no browser-supplied score is trusted.
2. Reuse the existing task completion/context/prompt/review flow automatically
   when a scene window reaches the threshold. Readiness token publication must
   not block the earned-score path. Preserve all scoring and reset protections.
3. Reconcile existing score-9 tasks when reconnecting and before subsequent scene
   scoring, so another satisfactory window is unnecessary. Failed completion
   must remain retryable and must not emit a successful switch.
4. Test threshold, insufficient score, reset race, duplicate completion, excluded
   modes, reconnect, next-task generation and final-scene review. Update the
   permanent completion rule and regenerate its derived instruction files.

## Implemented behavior

The internal confirmation route accepts `automatic: true`, `mode: scene_theater`
and an integer `scoring_generation`. Its database update checks user ownership,
persisted score >=9 and that exact generation. Legacy browser confirmation still
requires its readiness token. Next-task projections include generation/count.

AI uses this route after earned scoring, after connection restoration, and on
retry of a previously earned task. Completion emits the existing `task_completed`
event and uses one shared context/prompt/review flow. Even an `already_completed`
workflow replay uses internal authentication, without an expired user JWT.
Readiness Redis publication and latest-window quality no longer gate this path.
No scoring deltas, model selection or workflow image change is required.

Connection REST snapshots are revision-guarded so a late pre-completion response
cannot overwrite the accepted switch with 99%. The rule is recorded in
`core-rules.md` and its three generated instruction files.

## Actual verification

- `npm run verify` — passed twice, score 100; includes Python/Node/client suites,
  scenario mocks, lint, contracts, secret checks and the production client build.
- Scoped User Service Jest — 29 passed: score, ownership, generation reset,
  conditional-update race, idempotent replay, internal mode and browser boundary.
- Scoped AI confirmation/scoring tests — 44 passed, including the final
  already-completed/expired-JWT regression; full verifier passed afterward.
- Real local PostgreSQL with temporary tables and rollback — earned completion,
  next generation, unchanged completion timestamp on replay, ownership,
  below-threshold rejection, and reset followed by re-earned score all passed.
- Chromium desktop + WebKit mobile — four new delayed-snapshot tests passed
  with exit 0. The expanded scene recovery run passed all 20 assertions but
  exited 1 because two Chromium workers failed to stop within 300 seconds;
  this is not recorded as a clean suite pass. Tests include next-task progress
  at generation 5 and the final practice report; no manual confirmation click.
- `python3 scripts/sdlc.py validate` and `git diff --check` — passed.
- `docker compose build ai-omni-service user-service` — both images built
  successfully after the mirror downloads completed.
- PR #67 behavioral commit `2d3735d`: hosted backend `test`, `sdlc-artifacts`
  and `sdlc-review` passed; hosted UI audit is still running at this record.

Fresh-context review against `REVIEW.md` found reset retry, late REST restoration,
final-task prompt null handling and legacy expired-JWT replay issues. All were
fixed and independently rechecked; no unresolved high/critical findings remain.
An initial browser assertion incorrectly expected completed task list items to
retain percentage text; it was corrected to verify their actual completion mark.

## Release and rollback

No production writes or successful deployment are claimed. Human merge is
required. Deploy User Service before AI (new AI needs the extended internal
confirmation route), then the client; verify actual running source and internal
authentication, not only a deployment's Git label. Keep the existing Omni model.
Read-only Zeabur preflight found User Service's Dockerfile override pinned to
`FROM ghcr.io/happepls/oral_app/user-service:3f7e7f2`. After human merge and image
publication, that override must be updated to the approved release image before
redeploying User Service. AI and client have no Dockerfile override. No production
configuration was changed by this preflight.
Acceptance URL: `/conversation?scenario=工作面试`; existing earned tasks should
complete on reconnection, and new score-9 windows should automatically advance.
Use `[TASK_COMPLETE] task=… generation=… status=completed` plus DB status and the
page state as evidence; a workflow evaluation's own `task_completed=False` is no
longer the final completion decision.

Rollback: revert these changes; already completed tasks remain completed.
