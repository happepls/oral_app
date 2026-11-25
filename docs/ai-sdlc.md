# oral_app AI-native SDLC

This repository uses one evidence-backed loop:

`intent.md → spec.md → plan.md → verification.md → release.md → maintenance.md → new intent.md`

Codex proposes and implements; Git hooks and GitHub Actions provide deterministic gates; humans approve the implementation plan, PR, and production release. Git history archives prior revisions. GitHub Issues queue concurrent demand, so root artifacts are never replaced during an active PR.

## Bootstrap and shadow mode

The committed default in `bands.yaml` is `mode: shadow`. SDLC checks report failures in PRs, but branch protection must not make them required until a synthetic six-stage loop and at least one production observation window pass with no false blocker, no sensitive data persistence, and all existing checks green.

Required autonomous-loop secrets are `OPENAI_API_KEY` and fine-grained `SDLC_BOT_TOKEN`.
Daily observation uses Secrets `ZEABUR_AGGREGATES_URL` and `ZEABUR_TOKEN` (a dedicated
endpoint read token, not a Zeabur management API token). Repository variables are
`PRODUCTION_HEALTH_URL` and `DAILY_AGGREGATES_ENABLED`. Missing credentials or
sources fail the dependent observation; they never produce a pass.

## Starting and queueing a loop

Trigger `AI SDLC Loop` manually with an Issue number or add `sdlc:accepted` to an Issue. The workflow serializes through one concurrency group and checks for an existing open `agent/sdlc-*` PR. A concurrent request gets `sdlc:queued`; it does not touch the branch or root artifacts. PR-close events and a ten-minute recovery scan promote the highest severity, then oldest queued/accepted Issue, so GitHub's single-pending concurrency behavior cannot erase the durable queue.

The planning job creates `agent/sdlc-<change-id>`, runs Codex separately for Plan, Design, and Build-plan, and commits each stage with the artifact token trailer. It opens a draft PR and stops with `plan.md` ready. The next job is protected by the `sdlc-plan` GitHub environment. Configure at least one required reviewer on that environment and give `SDLC_BOT_TOKEN` read access to Actions/environment metadata; the job verifies the protection rule and actual approval record before accepting evidence.

The Build job pins `@openai/codex` `0.152.0`, uses ephemeral non-interactive runs in the workspace-write sandbox with automated approval review, reads all upstream artifacts on every run, and processes one task block at a time. It retries a transient failure no more than twice. Verification runs repository checks and a separate read-only fresh-context review against `REVIEW.md`, writes actual evidence, then marks the PR ready. Nothing auto-merges or pushes `master`.

## Local operation

Both commit-capable jobs configure a repository-local Git bot identity. Before
Build, `.github/actions/setup-verification` installs Node 20, Python 3.10, root,
client and six Node service dependencies, both Python service requirements and
pytest, plus checksum-pinned Gitleaks 8.30.1. The same setup is exercised by the
secret-free `SDLC Clean Runner` PR workflow when its inputs change. This check
does not run Codex, approve plans, queue Issues, merge, or deploy.

```bash
python3 scripts/sdlc.py validate
python3 scripts/sdlc.py validate --history
python3 scripts/sdlc.py precommit
python3 quality/tests/sdlc-gates.test.py
```

Initialize only when the six root artifacts do not exist:

```bash
python3 scripts/sdlc.py init \
  --change-id issue-123-short-slug \
  --source github-issue-123 \
  --risk medium
```

After `maintenance.md` is genuinely complete and `validate --history` passes, the dispatcher adds `--replace-complete`. That is the only supported way to replace the root set for a new loop.

Commit one stage at a time and copy its exact `artifact_commit` value into the trailer:

```text
SDLC-Artifact: sdlc/issue-123-short-slug/plan/r1
```

`artifact_commit` is a deterministic lookup token rather than a self-referential SHA. `validate --history` requires the token in Git history. See `.agents/skills/oral-app-sdlc/references/artifact-contract.md`.

## Checks and branch protection

The `sdlc-artifacts` check validates schema, change identity, chain order, approval and execution evidence, secret patterns, and stage history. `sdlc-review` reports path hints for the merge-base-to-head diff. Same-repository `agent/sdlc-*` PRs use the independent review in `release.md`, with the merge base matching the independent review's input. Ordinary PRs use the evidence block in the PR description.

Use [REVIEW.md](../REVIEW.md) and the [PR risk card](../.github/pull_request_template.md) for human review and merge decisions. The two retrospective pilots record [trunk review of PR #114](plans/2026-11-25-pr-114-review-pilot.md) and [leaf review of PR #88](plans/2026-11-25-pr-88-review-pilot.md). Both `sdlc-review` jobs reported an internal failure in shadow because the historical root `release.md` referenced an unrelated Base and Head. PR #114 also shows that path hints missed its authentication boundary. PR #88 shows a public UI build that matched no risk hint.

On 2026-11-25 the GitHub branch protection and effective rules for `master` required up-to-date `test` and `ui-audit` checks. The effective rules required zero approving reviews and allowed unresolved conversations. Administrator enforcement was enabled for branch protection. The active ruleset had no bypass actors, and repository auto-merge was disabled. Read the live settings before a protection change:

```bash
gh api repos/happepls/oral_app/branches/master/protection
gh api repos/happepls/oral_app/rules/branches/master
```

For an ordinary PR, retain the evidence markers from the PR template, fill Base with the target branch tip and Head with the PR tip, and compute Merge base with `git merge-base <base> <head>`. Add each executed command, numeric exit status, and a link to its redacted log or CI artifact. The check reads the current PR through the GitHub API, compares its tips to the run event, and verifies the exact commit identities and the presence of a verification row. The human reviewer checks that the linked artifacts actually describe those commits and that the test outcomes cover the risk. Update the risk card when the comparison changes. When only the target branch advances, updating the PR branch or its description triggers a fresh governance check. Keep GitHub's up-to-date branch requirement for enforcement. [GitHub pull request events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)

Locally, save a PR API response to a temporary file and run `python3 scripts/sdlc-review.py --pull-request <file>`. Git history must contain both commits. To simulate a stale run, supply its original `--base` and `--head`. Record only the raw gate outcome and sanitized errors in evidence.

Audit the raw gate outcome during shadow. On 2026-11-25 the listed loop history contained zero successful runs and the root maintenance artifact recorded acceptance as pending. Complete the existing synthetic six-stage loop and record an accepted production observation window before making the jobs required. [Loop history](https://github.com/happepls/oral_app/actions/workflows/sdlc-loop.yml)

After shadow acceptance, a repository administrator applies branch protection to `master`:

- require `test`, `ui-audit`, `sdlc-artifacts`, and `sdlc-review`;
- require at least one approving review and dismiss stale approvals;
- require all review conversations resolved;
- disallow force pushes, deletions, auto-merge, and administrator bypass.

GitHub does not version branch-protection settings in the repository. Record the settings screenshot/API response and approval in `release.md`; do not claim they are active merely because workflow files exist.

After the application PR is merged and Zeabur reports the exact deployed commit, create a follow-up branch and run `python3 scripts/sdlc.py complete-release --deployed-version <40-char-commit> --evidence 'github-pr:<review-url>:reviewer=<login>;zeabur-deployment:<deployment-url>'`. Commit `release.md` plus the updated `maintenance.md` parent with the returned trailer token and open a human-reviewed PR. After at least one accepted observation cycle, run `complete-maintenance` with the same deployed SHA and `--evidence observation:<workflow-run-url>`. These commands validate evidence shape and refuse skipped stages; they do not deploy or merge. The next loop cannot replace root artifacts until both follow-up transitions are merged and history validation passes.

## Production observations

`SDLC Production Observe` retains health checks every 15 minutes. Issue #52 adds
only daily aggregation: `15 0 * * *` (08:15 Asia/Shanghai), gated by
`DAILY_AGGREGATES_ENABLED=true` after manual acceptance. Manual dispatch defaults
to `health`; `daily` exercises aggregates without that gate. There is no hourly
aggregate mode. Event routing uses the triggering cron, so delayed health events
cannot accidentally invoke aggregation.

`GET /api/users/monitoring/daily` uses a separate Bearer token and returns only
numeric/boolean data. It covers user-service completed API responses, sampled
container memory peak, and the latest successful COS backup, with explicit UTC
daily windows and freshness/coverage checks. It does not cover gateway failures,
WebSockets, CPU or other services. See [daily monitoring operations](daily-monitoring.md)
for source definitions, installation, credentials and acceptance. The daily
artifact contains actual validated metrics plus evaluation; it is not a
historical trend chart. Unknown fields, missing data, stale data and fetch errors
fail the run and do not persist upstream response bodies.

Diagnostic Issues use `SDLC_BOT_TOKEN` when provided, otherwise the workflow's
`GITHUB_TOKEN` with `issues:write`. The fallback queues evidence but cannot trigger
another Actions workflow automatically. Control-band breaches fail the run even
when Issue creation succeeds. No external notification service is required.

The current external probe is `https://guajiguaji.top/api/users/health`. Zeabur's
service readiness check is separate: it defaults to TCP and can use a custom
HTTP path returning 2xx. For user-service itself that path is `/api/health`,
without the gateway's `/users` prefix. See [Zeabur health checks](https://zeabur.com/docs/zh-CN/operations/monitoring/health-checks).

For a release, associate relevant business probes with the deployed SHA and observation window. For realtime work, use a synthetic account to run voice input, AI audio playback, reconnect and stale-event rejection. For scoring work, check saved progress after refresh and absence of points for an invalid or stale window. For payment work, use the approved test path to verify stable entitlements across retried or out-of-order webhook events. Store aggregate outcomes and rollback decisions with the release evidence.

In shadow mode a single timeout is only an observation. Diagnosis is triggered by a critical security event, two windows at 5xx ≥1%, two windows at resource use ≥80%, backup age over 26 hours, or two consecutive critical health failures. Latency is report-only until a seven-day baseline is accepted. If a loop is active, the workflow creates or labels a queued diagnostic Issue; otherwise a new maintenance-derived loop may start after the old `maintenance.md` is complete.

## Failure recovery and audit

- Planning failure: retain the Issue and failed run; do not open or overwrite artifacts with partial claims.
- Build failure: inspect the single task block; after bounded retry mark it blocked and request human direction.
- Missing production access: record `blocked` and the missing variable/secret name only.
- Stale or duplicate event: concurrency plus active-PR lookup makes it a queue update.
- Workflow loss: check out the active branch, run artifact/history validation, and resume from the first non-complete stage.
- Rollback: revert SDLC commits. If checks were made required, first obtain administrator approval and remove only the affected required contexts so merges are not permanently deadlocked.

The audit chain is the six artifact revisions, their `SDLC-Artifact` commit trailers, GitHub environment approval, PR reviews/conversations, check runs, merge commit, Zeabur deployment record, and redacted maintenance observations.

## Knowledge promotion

Every diagnostic may propose `knowledge_candidates`, but an agent only opens a PR. A candidate must include source, reproduction evidence, a counterexample that bounds the rule, and a regression test. Permanent invariants go to `core-rules.md`; reusable judgment goes to the SDLC skill; deterministic blockers go to hooks/CI; one-time noise stays in `maintenance.md`. Human merge is the promotion decision.
