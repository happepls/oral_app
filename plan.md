---
change_id: ai-native-sdlc-bootstrap
stage: build
status: complete
revision: 1
source: spec.md
created_at: 2026-09-02T12:00:00+08:00
updated_at: 2026-09-02T13:22:31+08:00
parent_artifact_commit: sdlc/ai-native-sdlc-bootstrap/design/r1
artifact_commit: sdlc/ai-native-sdlc-bootstrap/build/r1
risk_level: high
owner_role: implementation-agent
approval_required: true
approval_evidence: explicit-user-request-to-implement-provided-plan-2026-09-02
---

# Implementation plan

## Task blocks

- [x] Define artifact schema, chain validator, pre-commit gate, and unit tests.
- [x] Add project SDLC skill, review policy, control bands, and operating documentation.
- [x] Add shadow-first loop, artifact/review checks, and production observation workflows.
- [x] Add short SSOT rules and regenerate agent instruction files.
- [x] Run skill/schema/unit/workflow/static and existing repository verification; record only actual results.

## Dependencies and candidate files

Python 3 standard library, Git, GitHub CLI in GitHub-hosted runners, Codex CLI `0.152.0`, existing npm verification commands. Candidate files are `.agents/skills/oral-app-sdlc/**`, `scripts/sdlc*`, `.githooks/pre-commit`, `.github/workflows/sdlc-*.yml`, root artifacts/policies, `docs/ai-sdlc.md`, and generated instruction files.

## Test and rollback

Run `python3 quality/tests/sdlc-gates.test.py`, artifact validation, skill validation, actionlint when available, shell syntax checks, `npm test`, and `npm run verify`. Roll back by reverting the bootstrap commits; do not delete existing build output or user changes.

## Agent handoff contract

Each run reads all upstream artifacts, changes one task block, runs its scoped test, and records its checkbox/handoff. Retry transient failure at most twice. Stop at missing authority, credentials, or non-transient failure and mark blocked.
