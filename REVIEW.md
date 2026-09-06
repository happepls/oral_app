# oral_app review policy

Review the behavioral diff and its call chain, not only changed lines. Findings must name a file/location, user or system impact, and a concrete correction. Block unresolved high- or critical-severity findings.

## Project risk checklist

- Auth: httpOnly cookie and Bearer compatibility, `credentials`, WS cookie upgrade, cross-service `JWT_SECRET`, authorization boundary and session leakage.
- Stripe: official SDK/Checkout Sessions, raw webhook body before JSON parsing, signature and idempotency, live/test isolation, allowed origins, soft-fail subscription lookup.
- Scoring: eligible modes only, complete 3–4-round windows, server delta `0–3`, no fallback points, generation-safe reset, completion thresholds.
- WS and audio: encoded `scenario`/`voice`/`mode`, comms forwarding, cancellation and reconnect, queue clock reset, late audio and marker behavior.
- Docker/release: host-copied Node dependencies and the client exception, reproducible lockfiles, affected image rebuild, Zeabur versus self-hosted target clarity.
- Data: migration compatibility, backup freshness, rollback/compensation, no user content in diagnostics, identifiers and secrets redacted.
- UI: i18n provider and locale precedence, light default, accessible states, responsive behavior, loading/error/empty and partial-stream states.

## Review evidence

The reviewer records the following machine-readable bullets under `release.md` → `Review evidence`: `Scope`, `Diff`, `Commands`, comma-separated `Risk areas`, `Findings`, numeric `Unresolved high/critical`, and `Recommendation`. A ready release requires every classified risk area, zero unresolved high/critical findings, and recommendation `ready`. “No findings” is a result only after the checklist relevant to the diff was evaluated.
