---
change_id: ai-native-sdlc-bootstrap
stage: design
status: complete
revision: 1
source: intent.md
created_at: 2026-09-02T12:00:00+08:00
updated_at: 2026-09-02T12:00:00+08:00
parent_artifact_commit: sdlc/ai-native-sdlc-bootstrap/plan/r1
artifact_commit: sdlc/ai-native-sdlc-bootstrap/design/r1
risk_level: high
owner_role: system-designer
approval_required: false
approval_evidence: user-provided-plan-2026-09-02
---

# Design specification

## Flow

An accepted Issue enters a repository-wide concurrency group. With no active `agent/sdlc-*` PR, automation initializes one `change_id`, creates the six artifacts, produces Plan/Design/Build-plan commits, and opens a draft PR. Otherwise it applies `sdlc:queued`. The `sdlc-plan` environment authorizes Build. Verification plus an independent review makes the PR ready; human review and merge authorize Zeabur Git-backed release.

## Interfaces and data

- Root Markdown artifacts share the schema documented by `$oral-app-sdlc`.
- Git commit trailers resolve deterministic artifact tokens to immutable history.
- Issues carry `sdlc:accepted`, `sdlc:queued`, `sdlc:active`, or diagnostic labels.
- `bands.yaml` is the machine contract for privacy and production thresholds.
- Secrets are referenced by name only: `OPENAI_API_KEY`, `SDLC_BOT_TOKEN`, `ZEABUR_TOKEN`.

## Security and exceptional states

Workflow permissions are least privilege; logs and summaries are redacted and never include user conversation bodies. Missing credentials, command failure after bounded retry, unavailable production logs, stale backup data, and invalid artifact chains are blocking states. Concurrency and active-PR lookup prevent overwrite.

## Acceptance criteria

Schema, chain, approval, evidence, redaction, retry, and queue behavior have deterministic tests. Workflows are statically valid. Existing repository verification remains green. Required checks remain in shadow/reporting mode until a synthetic six-stage loop and production observation cycle receive human acceptance.
