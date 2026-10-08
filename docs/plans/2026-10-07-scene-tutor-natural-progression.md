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

Speak primarily as the scenario counterpart. One ordered current-answer policy
chooses support, clarification, repair, missing information or progression. Freeze
the latest partner cue on every response; previous-turn evaluation is advisory
evidence and cannot schedule a new situation. Count known details across turns;
ask only for missing or ambiguous information essential to the visible subtask.
Only a correct, complete answer receives brief acknowledgement and an invitation to
a fresh, explicitly hypothetical situation practicing the same communication goal.
Change purpose while retaining identity, or identity while retaining purpose;
give a situation cue, not a complete sentence to copy. Respect declined practice.
Do not demand another phrasing of the same answer or open unrelated topics.
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

## Phone acceptance refinement, 2026-10-08

The user confirmed that mandatory rephrasing disappeared but requested further
guidance after successful expression, through another purpose or identity within
the same subtask. Updated all four prompt paths and the generation-3 callback
regression to reflect this accepted policy. Added current-turn protocol coverage
that accepts hypothetical follow-up questions while rejecting hypothetical details
inserted as factual student evidence. Scoring and persistence remain unchanged.

Actual checks: AI suite 371 passed; workflow suite 211 passed. A combined pytest
invocation initially failed collection because both services use a `tests` package;
the suites passed when run in separate processes. After final prompt tightening,
focused AI feedback tests: 24 passed. `npm run verify` passed (100); SDLC clean.

Nine live synthetic Realtime cases completed with audio and passed manual review:
missing purpose; complete facts across turns; repeated correct answer; stale rewrite
candidate; request to continue; off-topic input; a completed delivery variation;
declined practice; explicit identity variation. The final identity case changed a
pretend name while retaining interview purpose. Earlier probes exposed praise-only
replies and simultaneous identity/purpose changes; tightened guidance before the
final runs. These probes are semantic samples, not guarantees of every model reply.

Rebuilt/recreated only local AI and workflow services. All deployed prompt files
match source. Running workflow API now returns `advance`, no errors, and a clearly
hypothetical equipment-delivery invitation with one question for a synthetic valid
name-and-interview-purpose answer. Prior-version local images retained under
`:before-tutor-variations`. Re-enter the scene for phone acceptance without resetting
progress. PR #75 remains draft; no merge or production deployment performed.

## Current-answer policy refactor, 2026-10-08

User acceptance found new situation invitations bypassing actual errors, known
names being demanded again, and language questions being treated as off-topic.
Replaced the accumulated prompt rules with `scene_teaching_policy.py`: one ordered
policy shared by session and response instructions. The previous evaluator's
questions and alternatives are no longer injected into future speech. Its minimal
repair evidence remains advisory and expires after one response. Workflow prompt
now evaluates expression evidence without planning future situations.

Every eligible response receives a frozen latest-partner-utterance context even
when asynchronous feedback has not arrived. This keeps a vocabulary explanation
inside the active hypothetical visit rather than reverting to an earlier visit.
Current genuine errors require minimal repair and retry within that situation;
valid phrasing, known identity and concise answers are accepted. Scoring, generation,
audio transport and the disabled serialized-teaching path are unchanged.

Verification: AI 373 passed; workflow 211 passed; `npm run verify` pass (100);
SDLC clean. Added real callback coverage with generation 3 for previous-success
notes, feedback-not-yet-arrived, task-history cutoff and one-time note consumption.
Six focused live Realtime cases completed with audio: wrong active purpose,
new missing-article error, repaired grammar, meaning support, correctness support,
and valid synonymous wording. Errors stayed on the original situation; repaired
and valid expressions received a new situation. Language support explained the
relevant distinction within the current cue. Initial meaning-support testing
exposed reversion to an older visit; fixed by freezing current response context.
An earlier broad synthetic run was interrupted by a websocket connection timeout;
it is not claimed as a full pass. Focused calls were run independently afterward.

Rebuilt/recreated local AI and workflow services from tracked source, reloaded
nginx upstreams, and compared deployed policy/prompt files byte-for-byte. Runtime
workflow grammar feedback and health checked separately from semantic acceptance.
Rollback images: `:before-current-answer-policy`. Draft PR #75 is updated; phone
acceptance and human review remain outstanding. No private conversation text or
account identifiers are stored here, and no production change is claimed.
