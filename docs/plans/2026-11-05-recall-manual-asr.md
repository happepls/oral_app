# Recall: manual stop with file transcription

## Goal and authorization

User explicitly requested production to stop only on a button click while
avoiding repeated transcription prefixes. This supersedes #102's Android
pause-to-finish behavior. Existing root SDLC artifacts and Rive PR #100 remain
untouched. Implementation authorization: active user goal on 2026-11-05.

## Design

- All Recall browsers record locally with MediaRecorder. Silence has no state
  transition. Only explicit Stop submits. A two-minute / 8 MiB local safety
  limit cancels with an error, never scores a partial recording.
- On Stop, release microphone, decode audio, downmix/resample to mono 16 kHz,
  encode PCM16 WAV and POST `/api/ai/recall-transcribe?language=ja` (or the
  resolved language). Microphone permission, late promises, request abort,
  unmount/cancel and unexpected recorder termination are handled explicitly.
- FastAPI checks existing user authorization before consuming audio or calling
  a paid model. The endpoint validates WAV framing, sample format and duration,
  limits input to 3,840,044 bytes, and bounds upload/provider waits and capacity.
- Existing nginx proxies stream the exact route without disk request buffering;
  maximum request size is 4 MiB. Production client uses its existing dynamic
  `$apigw` upstream, not Docker service DNS.
- Qwen3-ASR-Flash receives only audio and language, no target sentence or prompt.
  Return one completed transcript, without string deduplication or successful
  response caching. Real repeated speech is preserved. No audio/transcript is
  stored by application code or written to diagnostics.
- Existing 60% threshold, reading/memory stages and manual Next remain unchanged.

Reference: https://www.alibabacloud.com/help/en/model-studio/qwen-asr-api-reference

## Provider evidence / deployment prerequisite

Fixed synthetic Japanese TTS → PCM WAV → ASR probe, no user recording:

- Local dedicated HTTP connection: 403 `Model.AccessDenied`.
- Local public chat connection with its correctly paired key: 200, final stop,
  length 13, two synthetic repeated words retained.
- Initially production dedicated HTTP and public chat connections both returned
  403 `Model.AccessDenied`. User then enabled international model access.
- Production public chat connection re-probe: HTTP 200, finish_reason=stop;
  subsequent fixed synthetic phrase returned 13 characters with both repetitions
  preserved. No keys were printed, moved or changed. One probe rendered the
  repeated word differently, so exact-character accuracy is not guaranteed.
- Implementation uses the public chat base/key pair explicitly. No cross-region
  or cross-credential automatic fallback.

Do not release the frontend until the production provider probe and authorized
backend endpoint succeed. Deployment must be sequenced backend/gateway first,
then client; repository Git auto-deploy behavior must be accounted for at review.
Human PR merge and production release gates remain applicable.

## Validation (in progress)

- New backend focused suite: 16 passed, including five canceled requests to
  prove canceled providers release all four endpoint capacity permits.
- Frontend utility/page focused suite: 27 passed.
- Initial full run: 704 client tests and build passed; backend failed because
  Python 3.9 semaphore construction required an event loop. Moved construction
  into the request loop. First disconnect watcher caused a test hang; replaced
  polling cancellation scopes with direct ASGI disconnect observation.
- Independent review found production upstream hostname and unobserved client
  disconnect. Both corrected; final re-review pending.
- Final full verifier: pass / 100; 62 client suites / 704 tests, production build
  successful. Chromium desktop + mobile WebKit: 8/8 browser tests passed, using
  synthetic WAV through the real decoder/resampler and mocked ASR HTTP response.
- Local ai-omni Docker build and restart completed; both local nginx configs
  validate; unauthenticated request through client→gateway→ASR returns 401.
- Initial independent review issues are fixed. Final independent re-review was
  unavailable because the review agent hit its usage limit; do not claim that
  unavailable re-review passed.
- Real-device manual pause test and production page acceptance remain pending.
- Queue: https://github.com/happepls/oral_app/issues/103.

## Rollback

Frontend can return to the #102 bundle while keeping the additive backend route.
Do not describe that rollback as achieving the new manual-only goal. No schema
or persisted-data migration. No production deployment performed yet.
