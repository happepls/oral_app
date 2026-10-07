# Scene Tutor: natural dialogue within the current subtask

Follow-up issue: #74; parent implementation: PR #73 / `0c99b59`.
The user requested this correction after successful iPhone Safari audio acceptance,
then clarified that natural dialogue must remain inside the current subtask.
The existing root SDLC loop is preserved; this follow-up remains queued for its
own review. No production merge or deployment is authorized or claimed.

## Problem and design

Read-only local investigation found successful answers repeatedly eliciting
equivalent-phrasing drills. The base Scene Theater prompt, response-scoped teaching
directive and workflow evaluator all prescribed this behavior. Do not persist
private conversation text or account identifiers as evidence.

Speak primarily as the scenario counterpart. Count known details across turns;
ask only for missing or ambiguous information essential to the visible subtask.
A correct, complete answer may receive a short in-character acknowledgement.
Do not manufacture questions, demand another phrasing or open unrelated topics.
Keep genuine-error correction and one-sentence off-topic redirection. Completion
and task switching remain controlled by the unchanged backend scoring contract.
The disabled current-turn evaluator receives the same wording-policy correction
to prevent the loop returning if that alternative path is enabled later.

## Actual verification

- AI suite: 371 passed; workflow suite: 210 passed. Added generation-3 callback
  coverage through three real prompt refreshes, asynchronous feedback, one-time
  response instruction consumption and preservation of authoritative score/state.
  Cases include empty, already-answered and stale rewrite candidates.
- After tightening first-turn-only opening, focused AI feedback tests: 24 passed.
- `npm run verify`: pass, score 100. `python3 scripts/sdlc.py validate`: clean.
- Six live synthetic `qwen3.8-omni-flash-realtime` responses completed with audio:
  missing purpose produced one purpose question; facts supplied across turns
  produced acknowledgement; repeated correct answers did not restart a drill;
  a stale rewrite directive was ignored; a continue request did not invent a
  next task; off-topic football input produced one current-task redirect.
  An earlier probe exposed a repeated opening question, fixed before this run.
- Rebuilt only AI and workflow images from tracked source; cached dependencies
  unchanged. Recreated those services and reloaded local nginx upstreams. All
  four deployed prompt files exactly match reviewed working-tree source; both
  services healthy. Running workflow API with a synthetic complete answer
  returned `advance`, no errors and an empty `next_question_locked`.

## Review and remaining acceptance

Reviewed generation, mode isolation, directive expiration, task-switch override,
scope/confidentiality and audio call paths against REVIEW.md. No scoring, auth,
payment, persistence or transport behavior changed. Semantic probes use synthetic
data, do not assign scores and do not replace actual phone acceptance.
Backend still requires its existing complete scoring windows and score threshold;
these changes do not guarantee an immediate task switch after one valid utterance.
Re-enter the same phone scene to load new instructions and verify natural dialogue
and authoritative task progression. No task reset is required.

Rollback: retained local `oral_app-ai-omni-service:before-tutor-natural` and
`oral_app-workflow-service:before-tutor-natural` images; restore their latest tags
and recreate only those services with the existing acceptance compose override.
