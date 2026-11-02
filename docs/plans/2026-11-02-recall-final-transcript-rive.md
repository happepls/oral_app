# Recall final transcription and Rive tooling — 2026-11-02

## Authorization and SDLC state

Source: the user's supplied implementation plan and explicit request to implement
and verify it. Issue: https://github.com/happepls/oral_app/issues/97.
Baseline: `7514eaeb9188e64870296981a0aa0008f849b901`.
Branch: `fix/recall-final-transcript-rive`. Worktree was clean at start.

Root six-stage artifacts still describe `ai-native-sdlc-bootstrap`, with
release ready and maintenance pending. No open PR existed at the start.
Preserve those artifacts and their evidence: this document is a diagnostic
handoff, not a replacement loop or an invented approval. As in prior accepted
local repairs, deliver a draft PR and separate code/Rive commits. The maintainer
must reconcile the old loop before marking SDLC release readiness. No merge,
master push or production release is authorized.

## Observed production and local baseline

- User supplied a screenshot from `https://guajiguaji.top/recall`; it shows
  growing historical prefixes in the recognized result. The screenshot and
  user's transcription were not copied into the repository or diagnostics.
  Tests use its generated target sentence and synthetic recognition events.
- GitHub latest production deployment metadata names baseline `7514eae`.
  This is deployment metadata, not independent evidence of all running services.
- Production main bundle: `main.508a8c95.js`,
  SHA-256 `cf48e093d0d4f6f6e4c4c426197e9b588174fc680232397b9c830c2b0b40d25e`.
- Recall is lazy-loaded: production `672.0c24274d.chunk.js`,
  SHA-256 `e7f73afe93769280abd007b4f3be9c67940a793f64207252720fc991c7c01643`.
  This actual chunk maps every result's transcript without inspecting isFinal,
  pushes all current text at engine end, and has no stop timeout. Merely
  inspecting main.js would not establish Recall behavior.
- Original local main `main.46078c74.js` SHA-256
  `2e43c0932698d5bfc5cbf1bd6ce1d69c16d6d29b37d9ccca28165acd856faccf`
  matched host/container/HTTP. Frontend reference directory
  `figma_app_template/src/` is absent in this checkout; existing Recall UI was
  used for the narrow error/loading changes.

The screenshot alone cannot tell whether Android marked growing hypotheses as
interim or final. No string deduplication or target substitution is introduced.
Actual engine event metadata and physical-device behavior still need acceptance.

## Implementation

- One explicit recording owns its sentence and stage. Each recognizer owns final
  slots by result index. Interim snapshots replace the ephemeral preview; only
  final slots survive restarts. Old engine callbacks are invalidated.
- Stop shows recognizing, waits for engine end, and times out after 4 seconds.
  Empty, unfinished, failed or timed-out sessions report retry, without scoring
  interim input. Settlement, errors and cleanup are once-only.
- Preserve actual repeated final segments and existing Levenshtein/.6 scoring,
  reading and memory stages.
- Japanese aliases japanese/ja/ja-JP/jp resolve to ja-JP ASR and ja translation.
- Recording stops preview audio and cancels pending TTS. Navigation/cancel
  releases audio URLs and recognition resources; late callbacks cannot replay.
  TTS accepts an optional third options argument with AbortSignal, preserving
  existing callers.
- Translation v3 cache includes source sentences; failed or empty results never
  become successful cache entries. Poisoned v2 fallback cache is not reused.
  Failed material has a retry action. Completed daily state skips unnecessary
  material requests; retry after a charged switch does not charge another one.
- Local-only Compose override configures two tested DNS resolvers for AI.
  Credentials, model names and endpoint selection are unchanged.
- Rive project is separate under `animations/guaji-transition`; see its README.
  Existing CLI 1.8.0 was used. Generated local agent instructions were preserved.
  No React runtime, upload, signed publish or .rev export.

## Translation/TTS diagnostic evidence

Gateway paths: translate uses /api/ai/translate → Nginx → AI /translate;
TTS uses /api/v1/ai/tts → Developer API authorization → AI /tts.
Both gateway endpoints reject unauthenticated requests with 401 after local repair.

AI host/container main.py SHA-256 both:
`eda21e1cca9e51a6ef7734c8fc204437bc162199edabb60e0a4301f95f132d00`.
Translation configuration: public China DashScope, qwen-flash,
credential variable QWEN3_OMNI_API_KEY.
TTS: configured dedicated MaaS ap-southeast-1 endpoint, qwen3-tts-flash,
credential variable DASHSCOPE_API_KEY. Values were not printed or stored.

Actual synthetic model probes called the running-image endpoint functions
directly, using 'Hello.' only; they are not an authenticated browser E2E test.
No audio or returned translated text was retained, only status/length/error type.

Before repair:
- translate endpoint function 500; TTS function 503/dashscope_connection_failed.
- Chat with/without environment proxy: ConnectError.
- TTS with proxy: SSLError; direct: ConnectionError.
- Container getaddrinfo for both model hosts: gaierror.
- DNS UDP query to Docker 127.0.0.11 timed out; direct queries to 223.5.5.5 and
  119.29.29.29 returned rcode=0, answer_count=5.

Repair and retest:
- Added only AI DNS configuration to local docker-compose.override.yml.
- Compared effective Compose environment to running container in memory:
  changed_environment_names=[].
- `docker compose up -d --no-deps ai-omni-service`: exit 0.
- Both model hosts resolve, and Docker service name user-service still resolves.
- Actual translate function: 200, translated length 6. DNS failure is a
  demonstrated cause of this local translation failure.
- Actual TTS function still 503. Proxy probe reports TLS EOF, without certificate
  verification failure; direct probe still ConnectionError. Its precise external
  network/provider cause is unresolved. Do not replace model/credential routing
  or disable TLS based on this evidence.
- `docker compose config --quiet`: exit 0; AI health 200. Health is not TTS success.

## Verification

Actual commands/results on final browser behavior:
- `CI=true npm --prefix client test -- --watchAll=false --runInBand --runTestsByPath src/__tests__/recall-recording-flow.test.js src/utils/recallRecording.test.js`:
  exit 0, 29 tests in 2 suites.
- `npm run verify`: final run exit 0, decision=pass, score 100; includes all
  repository checks and frontend build. Client 61 suites / 679 tests passed.
  Existing lint/build warnings remain. A preceding run caught the new
  completion-retry regression; it was fixed, not waived.
- `PLAYWRIGHT_BASE_URL=http://localhost:8081 npm run verify:ui -- --project=chromium-390 --workers=1 recall-click-recording.spec.js recall-final-results.spec.js`:
  exit 0, **33 passed**. npm consumed project/worker flags rather than forwarding
  them, so this actually ran the 3 tests across all 11 configured projects
  (Chromium widths/themes plus WebKit mobile), not just chromium-390.
  For a scoped future run, use
  `PLAYWRIGHT_BASE_URL=http://localhost:8081 npm --prefix client run test:e2e -- --project=chromium-390 --workers=1 recall-click-recording.spec.js recall-final-results.spec.js`.
- `python3 scripts/sdlc.py validate --history`: exit 0, existing chain clean.
- `git diff --check`: exit 0.
- Rive verify: zero errors/warnings; inspect: problems=[]; unsigned build exit 0.
  Three timed captures visually inspected; live preview running and rebuilding.

Frontend build hashes match on host, client container and gateway HTTP:
- `main.2f02a36d.js`:
  `ea803474d8345f3b18a9347c58c4995d81c5e8d4fbaf54eddc9de662adee0018`
- Recall `672.c4dfa5cc.chunk.js`:
  `14cc293a1b11efea6e61b9832737cc48b0d5261132b7a4aa6eff9b366d8159a8`

Independent fresh-context read-only review covered actual Recall/ASR/API call
chains against REVIEW.md. Found one completion-retry P2; corrected it and added
server/offline completion and single-charge retry regressions. Reviewer reran
29 tests plus diff check and reported no remaining actionable findings,
zero high/critical. No independent physical-device/production claim.

Browser tests inject SpeechRecognition events and API responses. They prove
browser UI/state behavior, not Android's recognition service accuracy.

## Remaining acceptance / release conditions

- Android Chrome physical device: continuous speech, pauses/restarts, rapid
  start-stop, preview then record, switch sentence, cancellation and denied
  permission. Use supplied target; inspect only result index/finality/length
  metadata. Do not persist user's audio or transcription.
- Restore actual TTS connectivity and verify authenticated gateway success,
  failure and retry. Current UI tests cover success/failure/cancellation via
  mocks; real TTS success remains blocked.
- Human PR/production approval and old SDLC loop reconciliation.
- After approved release, compare deployed backend/client identity and Recall
  chunk, then verify https://guajiguaji.top/recall on the affected device.
  Do not mark the production incident fixed before that.
- Server ASR remains deferred until actual-device evidence warrants a separately
  specified interface. No server ASR introduced.

Rollback: revert the browser repair and rebuild client; remove only the local
AI DNS override and recreate that service if needed. Reverting cache v3 handling
would re-expose old failed-cache behavior. No DB migration, production setting
mutation, root agent-rule edit, or user-data mutation.
