# Explicit recording, oral scoring and latency repair

## Intent and approval

The user approved the conversational implementation plan with “Implement the
plan.” on 2026-10-26. This branch implements that application repair without
replacing the existing root SDLC bootstrap artifacts. No production deployment,
historical score rewrite, automatic merge or database migration is included.

Success means that Recall records on click, a pause does not submit a recording,
long input survives reconnect, and oral tasks are assessed as spoken exercises.
Backend permission revocation, daily quotas and scoring generations remain
enforced. Docker cleanup removes the separate audit runtime, retaining its data.

## Findings and resulting behavior

- Recall previously stopped on mouse/touch release or mouse leave, and browser
  ASR used non-continuous recognition. It now freezes the sentence/step, gathers
  segments across normal browser ASR timeouts and grades only after explicit
  stop. Cancel/navigation invalidates callbacks. Rapid broken-engine loops are
  bounded; ordinary silence timeouts do not exhaust that retry guard.
- The inspected production task accumulated successive scores; its delta was
  repeatedly 1 because the model classified windows as `needs_work`. The reasons
  mixed real mistakes with a requirement to construct a written email. Tutor and
  evaluator prompts now accept spoken content assembled within the scoring
  window. The server still maps quality to 0/1/2/3, and failures award no points.
- The browser previously uploaded all 50 ms blocks at stop. Every block made a
  fresh permission HTTP request and a quota reservation call. Upload now combines
  PCM into one-second blocks, preserves silence and drains the final partial
  worklet frame. Authorization occurs at recording start and commit, and quota
  admission occurs on the first block with renewal at commit. Shared HTTP clients
  reuse connections. A denied/expired membership still blocks provider commit.
- Input remains in browser memory until acknowledgement. Reconnect replays its
  full PCM; sequence/count checks reject partial input, and a Redis submission
  marker prevents another provider commit. A provider commit with an uncertain
  result stays visibly pending and is not blindly repeated. Reset invalidates
  pending input. New clients freeze task/goal/generation at recording start.
- Audio evidence previously rejected recordings over 90 seconds. Longer input
  is now assessed in balanced bounded segments, at most two concurrently. All
  segments must be clear for scoring; acoustic scores are duration-weighted.
  Cancellation/failure closes remaining work. No segment boundary ends recording.

## Interface and diagnostics

Existing REST interfaces and scoring wire shapes stay compatible. The WS bridge
already transparently forwards the following additional events/fields:

| Direction | Event | Contract |
| --- | --- | --- |
| Client → AI | `user_audio_started` | `payload.input_id`, optional frozen `scope` containing `goal_id`, `task_id`, `scoring_generation` |
| Client → AI | `audio_stream` | Existing base64 PCM plus matching `input_id` and consecutive zero-based `sequence` |
| Client → AI | `user_audio_ended` | Matching `input_id` and total `chunks`; only explicit user stop sends this |
| AI → client | `user_audio_received` | Matching `input_id`; the provider commit was accepted for dispatch, not a claim that scoring or the task completed |

Old clients without start/sequence metadata remain supported. New clients require
the new backend acknowledgement: release backend before client. Frozen scopes
with missing/changed generation are rejected; they never silently become 0.

`TurnLatency` logs measure access checks, upload completion, provider commit,
audio-evidence readiness and first text/audio. Browser logs measure submission
acknowledgement and actual PCM playback start. Welcome timing remains separate.
Raw WS payload logging was removed from the receive loop.

Teaching feedback remains independent and optional. JSON code fences and text
blocks are normalized before strict validation. Failures distinguish timeout,
invalid JSON and allowlisted schema reason codes, with elapsed time. No raw model
response or student text enters these diagnostics. Scoring HTTP failures include
only model, exception class, status and timing.

## Verification evidence

- `QUALITY_PYTHON=/tmp/oral-recording-venv/bin/python SCENE_ACCESS_TEST_REDIS_URL=redis://127.0.0.1:6379/15 npm run verify`
  passed with decision `pass`, score 100. Local generated logs live under
  `quality/artifacts/latest/`; they are not committed.
- Frontend: 60 suites / 655 tests passed; production build passed with existing
  lint/Browserslist warnings. Tests cover explicit recording, stale callbacks,
  two-minute PCM retention, reconnect replay and acknowledgement.
- Workflow: 217 tests passed, including nonzero-generation quality mapping and
  oral-email prompt contracts. The scenario/Daily QA mock runner passed 25 cases.
- AI: 426 tests and two subtests passed using the local Redis test database.
  Real receive-loop tests cover one commit across reconnect, start/commit access
  checks, revoked permission, changed generation and ambiguous provider commit.
- Real production-model check used only synthetic text in a separate CLI process,
  without invoking scoring persistence. `qwen3.7-flash` classified complete spoken
  email content as `mastered` and unrelated content as `off_topic` using the oral
  rubric. These are two qualitative samples, not a model accuracy benchmark.
- Docker audit cleanup ran `node scripts/stripe-clock-audit.mjs stop`. Compose
  listed only `oral_app` afterward; the audit PostgreSQL named volume remained.
  Both affected Python images built successfully.

The desktop browser regression run passed all 17 cases, including generation-3
progress restoration, bounded retries, partial reset and active-microphone
cancellation. Feature checks also passed in mobile Chrome and WebKit. Earlier
browser attempts used a disallowed IP Host header (nginx returned 444); tests
use the allowed `localhost` Host. A combined multi-project run stalled during
worker teardown and was interrupted, so it is not counted as a pass. One UI
probe overlapped a rebuild and received 404; its stable-build rerun passed.

Local runtime verification found an existing experiment mount masking the AI
image's `/app/app`. A separate ignored local override now mounts the current
canonical source there read-only, preserving the old experiment directory.
Container AI/workflow source hashes matched the current checkout. Frontend
host/container/HTTP bundle hashes matched, and both Python service health checks
passed. These are local checks, not evidence of production release.

## Release, review and limits

Backend-first rollout is required. After human PR/release approval, deploy
workflow and AI together, validate their protocol, then release the client.
Rollback client first, then backend; retain scoring data and audit volumes.

The observed production welcome sample took about 32.9 s to first text and
33.4 s to first audio. Available logs do not allocate this time to every stage.
This change removes measured code-path amplification and adds timing evidence;
it does not establish a production p50/p95 improvement. Compare the same audio,
model, network and concurrent load after release, separating welcome from normal
turns. Optional feedback can still fail closed on genuinely invalid model output.

The policy checklist in `REVIEW.md` is used for local diff review. Independent
human review and production acceptance remain outstanding; no release approval
is implied by passing tests. No private conversation text is retained here.
