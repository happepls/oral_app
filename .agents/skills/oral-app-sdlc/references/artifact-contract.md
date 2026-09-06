# Artifact contract

The current loop owns exactly `intent.md`, `spec.md`, `plan.md`, `verification.md`, `release.md`, and `maintenance.md` at repository root. All six are initialized together with one `change_id`.

Each frontmatter contains: `change_id`, `stage`, `status`, `revision`, `source`, `created_at`, `updated_at`, `parent_artifact_commit`, `artifact_commit`, `risk_level`, `owner_role`, `approval_required`, and `approval_evidence`.

Statuses are `pending`, `ready`, `approved`, `blocked`, `complete`, `superseded`. Stages are `plan`, `design`, `build`, `test`, `deploy`, `maintain` in that order.

`artifact_commit` is a deterministic token `sdlc/<change-id>/<stage>/r<revision>`. The stage commit message must include an exact `SDLC-Artifact: <token>` trailer. `parent_artifact_commit` equals the preceding artifact's token (`none` for intent). This avoids an impossible self-referential Git SHA while allowing `scripts/sdlc.py validate --history` to resolve the token to Git history. A work-in-progress artifact may use `pending`; a complete or superseded artifact may not. Approval after a ready plan creates the next plan revision and updates the pending verification artifact's parent; use `python3 scripts/sdlc.py approve-plan --evidence <durable-record>`.

Only evidence-backed transitions are allowed. Automated plan approval requires a protected GitHub environment run plus reviewer; release completion requires a full deployed commit, PR reviewer, and Zeabur deployment URL; maintenance completion requires the same commit and an observation run URL. An explicit user instruction may approve the bootstrap plan when recorded by date and source. Command plans belong in `plan.md`; only commands actually executed belong under `verification.md` → `Actual commands`.
