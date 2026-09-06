---
change_id: ai-native-sdlc-bootstrap
stage: plan
status: complete
revision: 1
source: user-provided-plan-2026-09-02
created_at: 2026-09-02T12:00:00+08:00
updated_at: 2026-09-02T12:00:00+08:00
parent_artifact_commit: none
artifact_commit: sdlc/ai-native-sdlc-bootstrap/plan/r1
risk_level: high
owner_role: product-owner
approval_required: false
approval_evidence: user-provided-plan-2026-09-02
---

# Intent

## Problem and users

oral_app needs an auditable, single-active AI-native delivery loop for maintainers and product owners. Agent work currently lacks one deterministic artifact chain joining intent, design, implementation, verification, release authority, and production learning.

## Goal and success metrics

Establish `Plan → Design → Build → Test → Deploy → Maintain → Plan`, driven by Codex and deterministic GitHub gates. A synthetic shadow loop must complete without false pass records or sensitive data persistence before enforcement is enabled.

## Constraints

- Agents may advance through draft/ready PR creation, never auto-merge or directly push `master`.
- Plan execution and production release require human approval.
- Root holds one current artifact set; Git stores history and Issues store the queue.
- Existing `docs/TODO.md` changes are out of scope and must remain untouched.
- Missing credentials or evidence produce `blocked`, never synthetic success.

## Evidence

The user supplied the accepted implementation plan in the 2026-09-02 task request, based on the AI-Native SDLC Playbook.

## Non-goals

Automatic production merge, deployment, rollback, branch-protection mutation, secret creation, and ingestion of user conversation text.
