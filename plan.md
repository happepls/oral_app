---
change_id: ai-native-sdlc-bootstrap
stage: build
status: complete
revision: 3
source: spec.md
created_at: 2026-09-02T12:00:00+08:00
updated_at: 2026-09-06T16:54:06+08:00
parent_artifact_commit: sdlc/ai-native-sdlc-bootstrap/design/r1
artifact_commit: sdlc/ai-native-sdlc-bootstrap/build/r3
risk_level: high
owner_role: implementation-agent
approval_required: true
approval_evidence: explicit-user-request-to-fix-four-explained-sdlc-findings-2026-09-06
---

# Implementation plan

## Task blocks

- [x] Define artifact schema, chain validator, pre-commit gate, and unit tests.
- [x] Add project SDLC skill, review policy, control bands, and operating documentation.
- [x] Add shadow-first loop, artifact/review checks, and production observation workflows.
- [x] Add short SSOT rules and regenerate agent instruction files.
- [x] Run skill/schema/unit/workflow/static and existing repository verification; record only actual results.

## Approved bootstrap follow-up (2026-09-06)

The user confirmed phone-registration acceptance and requested fixing the four
previously explained SDLC findings. This resumes the existing bootstrap loop;
it does not initialize a second loop or claim deployment/maintenance completion.
The earlier bootstrap approval and results remain archived in Git history.

- [x] Configure repository-local bot identity before commits in both automation jobs.
- [x] Provision the full deterministic verification toolchain on a clean runner.
- [x] Route quarter-hour/hourly/daily observations by scheduled event, not execution time; support explicit manual cadence.
- [x] Decouple mutation tests from live root artifacts, with fail-fast fixtures and regression coverage.

Implementation handoff: all four code repairs are committed in `e94a73d`.
34 governance tests and actionlint passed. Local `npm run verify` returned pass,
score 100. Clean hosted-runner acceptance and independent review are next;
these are not claimed as completed by the Build checkboxes.

Scope: workflow setup, schedule routing, governance test fixtures and documentation.
No application changes, secrets/settings changes, enforcement activation, merge,
master push, or production deployment are approved by this follow-up request.
Verify with isolated Git identity tests, delayed-schedule tests, clean dependency
installation evidence, workflow lint, artifact/history validation, `npm run verify`,
and a fresh-context review. Stop at a human-reviewed PR. Rollback is a revert of
this follow-up; retain the original bootstrap and phone-registration release.

## Dependencies and candidate files (original bootstrap)

Python 3 standard library, Git, GitHub CLI in GitHub-hosted runners, Codex CLI `0.152.0`, existing npm verification commands. Candidate files are `.agents/skills/oral-app-sdlc/**`, `scripts/sdlc*`, `.githooks/pre-commit`, `.github/workflows/sdlc-*.yml`, root artifacts/policies, `docs/ai-sdlc.md`, and generated instruction files.

## Test and rollback

Run `python3 quality/tests/sdlc-gates.test.py`, artifact validation, skill validation, actionlint when available, shell syntax checks, `npm test`, and `npm run verify`. Roll back by reverting the bootstrap commits; do not delete existing build output or user changes.

## Agent handoff contract

Each run reads all upstream artifacts, changes one task block, runs its scoped test, and records its checkbox/handoff. Retry transient failure at most twice. Stop at missing authority, credentials, or non-transient failure and mark blocked.
