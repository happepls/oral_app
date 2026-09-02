---
name: oral-app-sdlc
description: Run or audit oral_app changes through the repository's Plan, Design, Build, Test, Deploy, and Maintain artifact loop. Use for accepted GitHub issues, SDLC artifact transitions, production diagnostics, or knowledge promotion; do not use it to bypass human plan, PR, or release approval.
---

# oral_app SDLC

Treat the six root artifacts as the current loop and Git history as its archive. Start a second loop only after the current PR is closed; concurrent requests stay in GitHub Issues with `sdlc:queued`.

## Route the stage

1. Read `docs/ai-sdlc.md`, all upstream root artifacts, and the code paths named by them.
2. Validate with `python3 scripts/sdlc.py validate`. For an audit that expects committed stage trailers, add `--history`.
3. Change only the current stage. Never invent commands, results, approvals, commit SHAs, production observations, or deployment state.
4. Stop when the stage's human gate is reached:
   - stop after `plan.md` is `ready`; Build needs explicit plan approval and evidence;
   - stop after the PR is ready; merge and Zeabur Git-backed release are human decisions;
   - if a required credential or production source is unavailable, mark the artifact `blocked`.
5. Commit each stage separately with trailer `SDLC-Artifact: <artifact_commit>`.

Use the deterministic scripts and GitHub checks as authority. Codex lifecycle prompts are advisory.

## Build and verification

Process one unchecked `plan.md` task block per non-interactive run. Re-read upstream artifacts each run, preserve unrelated changes, run the task's scoped test, and leave a concise handoff in the plan. A failed block may be retried twice only when the failure is plausibly transient; otherwise mark it blocked.

After Build, run `npm run verify`, the risk-specific commands from [references/verification.md](references/verification.md), and a fresh-context review against `REVIEW.md`. Put only actual commands and results in `verification.md`. Put the reviewed diff, risks, migrations, rollback, and release conditions in `release.md`.

## Maintain and knowledge

Read `bands.yaml` before evaluating observations. Never ingest or persist user conversation text. A single transient stays in `maintenance.md`; repeated control-band breaches and security, payment, or data-integrity failures create diagnostics. If a loop is active, queue an Issue instead of replacing root artifacts.

Promote knowledge only through a PR with source, reproduction evidence, counterexample, and regression test:

- permanent oral_app invariant → `core-rules.md`, then run `python3 sync-core-rules.py`;
- reusable decision method → this skill or a reference;
- deterministic blocking rule → hook/CI;
- one-off environment noise → `maintenance.md` only.

Read [references/artifact-contract.md](references/artifact-contract.md) when creating or transitioning artifacts. Read [references/verification.md](references/verification.md) only when choosing risk-matched checks.
