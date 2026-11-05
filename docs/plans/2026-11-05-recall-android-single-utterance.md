# Android Recall compatibility follow-up

## Scope and authorization

User requested a compatibility fix on 2026-11-05 after production PR #98 failed
on Pixel 10a / Android 17 / Chrome 156.0.8078.73. PC and iPhone passed according
to the user. Work branches from master independently of Rive PR #100. Existing
root SDLC artifacts belong to another loop and are preserved. No production
deployment or merge is authorized by this document.

## Evidence (metadata only)

- Production #98 commit: `1b31fdfbe454af01dc3a4e0d31e7b5dbb8b225c0`.
- Pixel continuous engine 1 emitted 28 final slots, result indexes 0–27,
  zero interim slots, combined length 349. It ended naturally; the automatic
  second engine then timed out after the user stopped.
- Another attempt combined five final slots from engine 1 with one final slot
  from engine 2. A failed retry also left the previous score and transcript visible.
- Temporary single-utterance probe (`continuous=false`, `interimResults=true`)
  emitted interim index 0, then one final (length 5), then end. This validates the
  event shape only, not full-sentence accuracy or page acceptance.
- No audio or transcription bodies are included in diagnostic evidence.

## Implementation

- Android (UA Client Hints platform or Android UA) requests one utterance.
  Desktop and iPhone retain the existing continuous indexed-results path.
- A single confirmed final result completes and releases the Android recognizer
  without depending on a later end event or creating another engine. The Web
  Speech contract permits at most one final result when continuous is false:
  https://webaudio.github.io/web-speech-api/#dom-speechrecognition-continuous
- More than one final in a snapshot, or final plus unfinished interim, fails
  closed. No string deduplication, target replacement, or interim scoring.
- End without final reports retry instead of restarting. Explicit stop keeps
  the four-second bound; cancellation invalidates queued events.
- Android UI explains pause-to-finish. Retry clears the current step's old
  score/transcript; the other step's result is preserved. Threshold remains 60%.

## Validation and release gates

Physical full-sentence page tests remain pending. Exercise
reading → memory, genuine repeated speech, manual stop, empty recording,
permission rejection, cancellation and late events. Mocked browser tests do not
substitute for Pixel, PC or iPhone microphone tests.

Independent review initially found a hook-like helper name and overly broad
test mock restoration; both were corrected before rerunning verification.

Completed checks (2026-11-05):

- `npm run verify`: exit 0, pass / score 100; 61 client suites, 694 tests,
  production build successful. First run failed on the two review findings
  and the legacy lint configuration's unsupported globalThis reference;
  corrected before this passing run.
- Chromium desktop + mobile WebKit, `recall-final-results.spec.js`: 6/6 passed
  against localhost:5001. Includes Android UA single-final flow, unchanged
  continuous flow, translation/TTS failure and retry. ASR is mocked here.
- Independent reviewer reran Recall utility/page tests: 44/44 passed;
  both findings resolved, no further code blockers.
- `python3 scripts/sdlc.py validate --history`: clean.
- `git diff --check`: passed.
- Host, container and HTTP main.b923c7ce.js SHA256 all equal
  `1e2161149003eac4c1f5f40536cd250d5dd062a250cef5f989afdc4d23f87472`.
- Follow-up queue: https://github.com/happepls/oral_app/issues/101.

Deliver a separate reviewable PR before resuming #100. Human merge/deployment
must be followed by production Pixel acceptance. Rollback is reverting this
frontend-only PR; no database, server ASR, credentials or deployment config changes.
