# Persistent Rive score feedback — 2026-11-04

## Intent and authority

User explicitly requested a new optimization after confirming Android Recall
recitation acceptance. Earlier user confirmation also covered restored local TTS.
Those are user-reported acceptance results, not newly executed production tests.

Issue: https://github.com/happepls/oral_app/issues/99.
Branch: feat/rive-score-feedback, base 5203d37 on the still-open Recall PR #98.
Deliver a separate stacked draft PR. Root artifacts remain the pending bootstrap
loop, unchanged; existing SDLC history validation passes. No merge or production
deployment authorized. Preserve the user's staged reference export unchanged and
exclude it from this implementation commit.

## Implementation and reference

The existing proficiency_update handler removed every proficiency system message
after three seconds. Positive completed-window feedback now creates a typed,
stable-identity card. The existing task/generation/window guards remain in place;
duplicate identities do not replay/recreate cards. Each card floats/fades in,
holds indefinitely in the current mounted conversation, then fades only when its
own hide button is activated. Zero/pending/stale updates do not create positive
cards. Scoring logic and thresholds are unchanged.

The reference tests/对话练习反馈动画demo.riv was inspected locally with the official
WebGL2 runtime. It contains bar battery, particle and branding artboards, Battery
state machine, and fixed percentage labels. CLI inspect expects an RML project,
not a runtime .riv export. No attempted upload or fabricated source conversion.

Created original script-free animations/score-feedback/scene.rml with CLI 1.8.0,
inspired by the charge/highlight/reveal rhythm, without hardcoded percentages.
The 734-byte client asset exactly matches CLI build SHA-256:
745ce40a3828986594a68679d845f7e595e869f300e4a90d1cea0a6e09003686.
One 90-frame animation settles in 1.5 seconds; the wrapper pauses after 1.7s.
Generated local agent guides preserved. README contains reproduce/preview commands.

Accessible DOM text displays server delta, total and reason. Motion animates the
variable-height DOM card; Rive supplies the charge accent. Hide button supports
keyboard/focus; polite status region announces feedback. Reduced-motion renders
static feedback. Rive load/render failure retains all text and hide controls.
New labels translated in all nine locale files.

React runtime: @rive-app/react-webgl2 4.38.0, matching @rive-app/webgl2 2.48.0 WASM
bundled as a fingerprinted same-origin asset (about 2.2MB uncompressed, browser
cacheable). CDN fallback and remote asset loading disabled. Both local and
production client Nginx policies permit only the additional wasm-unsafe-eval
directive for WASM compilation; no general unsafe-eval added.

Feedback is UI-only, excluded from history/model context. Refresh/reopen does not
restore these cards or their dismissal state. Active-conversation persistence is
the scope of this implementation, not database persistence.

## Actual verification

- npm run verify: exit 0, decision=pass, score 100; frontend 61 suites / 680 tests
  passed, production build passed with existing warnings.
- Rive verify: zero errors/warnings; inspect problems=[]; unsigned build passed.
  Settled CLI capture opened/checked; live local preview running.
- docker compose up -d --build client-app: exit 0. During build, reloaded/recreated
  the local client to apply the mounted Nginx policy. nginx -t passed.
- Final browser command:
  PLAYWRIGHT_BASE_URL=http://localhost:5001 npm --prefix client run test:e2e --
  --project=chromium-390 --project=chromium-desktop --workers=1 score-feedback.spec.js
  exited 0: 6 passed. Actual local WASM/Rive rendered; no CDN requests.
  Tests cover >3s persistence, multiple cards, duplicate/stale/pending/zero
  updates (generation=3), later AI message, keyboard hide of one card, responsive
  overflow, reduced motion, and failed .riv loading.
- Initial browser attempts failed before Nginx's new CSP became active; one
  request failed while the container was recreated. Final stable-container run
  above passed; those intermediate attempts are not reported as passes.
- Desktop/mobile screenshots inspected under ignored
  quality/artifacts/playwright-results/score-feedback-Rive-feedba-b296e-den-card-fades-out-critical-*/
  score-feedback-persistent.png.
- Independent read-only review against REVIEW.md: no actionable findings,
  zero high/critical. Reviewer independently passed 9 history snapshot tests and
  diff check; confirmed UI-only persistence scope.
- python3 scripts/sdlc.py validate --history: exit 0.
- git diff --check: passed.
- Skill state-marker heuristic ran against components, exit 0 but reports
  passed=false / missing empty. Manual interpretation: no accepted positive
  event renders no card (covered by event eligibility checks); the generic
  marker scan is not a runtime verdict. Generic visual-smoke was skipped in
  favor of the authenticated, synthetic-data Playwright scene checks above.
- figma_app_template/src is absent in this checkout; existing app tokens/styles
  provided the local visual reference. No cloud design service used.

Host/container/localhost:5001 HTTP SHA-256 all match:
- main.599acd8d.js:
  636f1b08642fe52c2e1de7c261743c562b56df499784341eaa29947db19a0819
- Conversation 949.5cae74d7.chunk.js:
  12e45afaff7b9c11d09d5a9a3146cca23b4957b0218c0e83132b4753263f0ffd

## Release and rollback

Keep draft while prior Recall PR and old SDLC lifecycle are reconciled. Human
approval required for merge and production release. Deploy matching client
bundle and Nginx CSP together; old CSP deliberately falls back to static content.
No backend/DB migration. Revert this feature commit, rebuild client and restore
prior Nginx policy for rollback. Physical Android animation/performance and
production behavior still require acceptance; responsive Chromium is not a
physical-device claim.
