import asyncio
import copy
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from .test_expression_feedback import callback, Redis, omni
from .test_scoring_windows import FakeRedis
import current_turn_teaching as teaching
import audio_evidence

RESULT = dict(protocol_version=2, teaching_mode="correct", off_topic=False,
              errors=[dict(original="want eat", corrected="want to eat", explanation_l1="want 后接 to。")],
              alternatives=["I want to eat steak.", "I'd like steak."],
              correction_explanation="Use want to eat instead of want eat.", retry_prompt="Please say that again.",
              acknowledgement="", next_question_locked="", clarification_question="", uncertain_details=[], fact_quotes=[])


@pytest.fixture
def transport(monkeypatch):
    monkeypatch.setenv("SCENE_CURRENT_TURN_TEACHING_ENABLED", "true")
    monkeypatch.setenv("INTERNAL_AUTH_SECRET", "test-only")
    monkeypatch.setattr(omni, "save_single_message", AsyncMock())
    response = Mock()
    response.json.side_effect = lambda: dict(data=copy.deepcopy(RESULT))
    client = SimpleNamespace(post=AsyncMock(return_value=response))
    manager = AsyncMock()
    manager.__aenter__.return_value = client
    monkeypatch.setattr(teaching.httpx, "AsyncClient", Mock(return_value=manager))
    return client


def setup():
    cb = callback()
    cb.messages[-1].update(id="turn-1", timestamp="2026-09-29T01:00:00")
    cb.current_turn_teaching.redis_factory = lambda: Redis()
    cb.current_turn_teaching.save_message = AsyncMock()
    cb.current_turn_teaching.score_turn = AsyncMock()
    cb.upload_audio_to_cos = AsyncMock(return_value=None)
    cb._schedule_real_turn_count = Mock()
    cb._update_session_prompt()
    return cb


async def begin_text(cb, turn_id="turn-1", text="I want eat steak."):
    cb.expression_input_sequence += 1
    msg = dict(id=turn_id, turn_id=turn_id, role="user", content=text, timestamp="2026-09-29T01:00:00")
    cb.current_turn_id = turn_id
    await cb.current_turn_teaching.begin("input-" + turn_id, msg)
    cb.messages.append(msg)
    await cb.current_turn_teaching.transcribed(msg)
    for _ in range(100):
        if cb.conversation.create_response.called:
            return
        await asyncio.sleep(.001)
    raise AssertionError("evaluation did not request speech")


async def event(cb, kind, **values):
    cb.on_event(dict(type=kind, **values))
    await asyncio.sleep(.01)


async def complete(cb, rid="reply-1", transcript=None):
    await event(cb, "response.created", response={"id": rid})
    speech = cb.current_turn_teaching.responses[rid]["speech"]
    await event(cb, "response.audio_transcript.delta", response_id=rid, delta="MUST NOT LEAK")
    await event(cb, "response.audio.delta", response_id=rid, delta="AAECAw==")
    await event(cb, "response.audio.done", response_id=rid)
    await event(cb, "response.audio_transcript.done", response_id=rid, transcript=transcript or speech)
    return speech


@pytest.mark.asyncio
async def test_same_turn_waits_validates_and_scores_exact_snapshot(transport):
    cb = setup()
    original = copy.deepcopy(cb.user_context)
    for _ in range(3):
        cb._update_session_prompt()
    await begin_text(cb)
    assert cb.user_context == original
    speech = await complete(cb)
    assert all(c.args[0]["type"] == "teaching_state" for c in cb._safe_send.await_args_list)
    cb.upload_audio_to_cos.assert_not_awaited()
    cb.current_turn_teaching.score_turn.assert_not_awaited()
    await event(cb, "response.done", response={"id": "reply-1", "status": "completed"})
    packets = [c.args[0] for c in cb._safe_send.await_args_list]
    assert len([p for p in packets if p["type"] == "expression_feedback"]) == 1
    assert next(p for p in packets if p["type"] == "ai_message")["payload"]["content"] == speech
    assert "MUST NOT LEAK" not in str(packets)
    assert cb.pending_directive is None
    assert "PREVIOUS student attempt" not in cb.conversation.create_response.call_args.kwargs["instructions"]
    cb.current_turn_teaching.score_turn.assert_awaited_once()
    snap = cb.current_turn_teaching.score_turn.call_args.kwargs["turn_snapshot"]
    assert snap["identity"][3] == 3 and snap["user"]["turn_id"] == "turn-1"
    assert snap["user"]["content"] == "I want eat steak."
    await event(cb, "response.audio_transcript.done", response_id="reply-1", transcript=speech)
    await event(cb, "response.done", response={"id": "reply-1", "status": "completed"})
    cb.current_turn_teaching.score_turn.assert_awaited_once()
    cb.current_turn_teaching.invalidate()


@pytest.mark.asyncio
async def test_language_or_numeric_drift_never_leaks_or_scores(transport):
    cb = setup()
    await begin_text(cb)
    await complete(cb, transcript="预算是五十还是五百？")
    await event(cb, "response.done", response={"id": "reply-1", "status": "completed"})
    assert all(c.args[0]["type"] == "teaching_state" for c in cb._safe_send.await_args_list)
    assert cb._safe_send.call_args.args[0]["payload"]["status"] == "retry"
    cb.current_turn_teaching.score_turn.assert_not_awaited()
    cb.current_turn_teaching.save_message.assert_not_awaited()
    cb.upload_audio_to_cos.assert_not_awaited()
    assert teaching.normalized_speech("1.5") != teaching.normalized_speech("15")


@pytest.mark.asyncio
async def test_clarification_excluded_then_corrected_new_turn_recovers(transport):
    cb = setup()
    response = transport.post.return_value
    response.json.side_effect = lambda: dict(data=dict(RESULT, teaching_mode="clarify", errors=[], alternatives=[],
        clarification_question="Which amount and unit did you mean?", uncertain_details=["budget unit"]))
    await begin_text(cb)
    await complete(cb)
    await event(cb, "response.done", response={"id": "reply-1", "status": "completed"})
    cb.current_turn_teaching.score_turn.assert_not_awaited()
    packet = next(c.args[0] for c in cb._safe_send.await_args_list if c.args[0]["type"] == "expression_feedback")
    assert packet["payload"]["user_text"] == "I want eat steak."
    response.json.side_effect = lambda: dict(data=copy.deepcopy(RESULT))
    cb.conversation.create_response.reset_mock()
    await begin_text(cb, "turn-2")
    await complete(cb, "reply-2")
    await event(cb, "response.done", response={"id": "reply-2", "status": "completed"})
    assert cb.current_turn_teaching.score_turn.call_args.kwargs["turn_snapshot"]["user"]["turn_id"] == "turn-2"
    cb.current_turn_teaching.invalidate()


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["reset", "task", "new_input", "disconnect"])
async def test_inflight_results_invalidated_before_any_output(transport, change):
    cb = setup()
    await begin_text(cb)
    await event(cb, "response.created", response={"id": "r"})
    speech = cb.current_turn_teaching.responses["r"]["speech"]
    if change == "reset": cb.user_context["active_goal"]["current_task"]["scoring_generation"] = 4
    if change == "task": cb.user_context["active_goal"]["current_task"]["id"] = 43
    if change == "new_input": cb.expression_input_sequence += 1
    if change == "disconnect": cb.is_connected = False
    await event(cb, "response.audio.delta", response_id="r", delta="AAECAw==")
    await event(cb, "response.audio_transcript.done", response_id="r", transcript=speech)
    await event(cb, "response.done", response={"id": "r", "status": "completed"})
    cb.current_turn_teaching.score_turn.assert_not_awaited()
    cb.current_turn_teaching.save_message.assert_not_awaited()
    assert all(c.args[0]["type"] == "teaching_state" for c in cb._safe_send.await_args_list)
    cb.current_turn_teaching.invalidate()


@pytest.mark.asyncio
async def test_asr_identity_timeout_late_duplicate_and_next_recording(transport, monkeypatch):
    cb = setup()
    monkeypatch.setattr(audio_evidence, "hear", AsyncMock(return_value={
        "status": "clear", "heard_text": "I want eat steak.", "uncertain_spans": []}))
    monkeypatch.setattr(teaching, "ASR_TIMEOUT", .025)
    cb.audio_evidence.begin("record-1")
    cb.audio_evidence.commit(b'\x00\x01' * 1600)
    await cb.current_turn_teaching.begin("record-1")
    await cb.current_turn_teaching.commit_audio()
    await event(cb, "input_audio_buffer.committed", item_id="audio-1")
    await asyncio.sleep(.03)
    assert cb._safe_send.call_args.args[0]["payload"]["reason"] == "asr_timeout"
    await event(cb, "conversation.item.input_audio_transcription.completed", item_id="audio-1", transcript="late")
    transport.post.assert_not_awaited()
    cb.expression_input_sequence += 1
    monkeypatch.setattr(teaching, "ASR_TIMEOUT", 5)
    cb.audio_evidence.begin("record-2")
    cb.audio_evidence.commit(b'\x00\x01' * 1600)
    await cb.current_turn_teaching.begin("record-2")
    await cb.current_turn_teaching.commit_audio()
    await event(cb, "input_audio_buffer.committed", item_id="audio-1")  # duplicate old ack must not consume new reservation
    await event(cb, "input_audio_buffer.committed", item_id="audio-2")
    await event(cb, "conversation.item.input_audio_transcription.completed", item_id="unrelated", transcript="wrong")
    await event(cb, "conversation.item.input_audio_transcription.completed", item_id="audio-2", transcript="I want eat steak.")
    await event(cb, "conversation.item.input_audio_transcription.completed", item_id="audio-2", transcript="duplicate")
    assert transport.post.await_count == 1
    assert transport.post.call_args.kwargs["json"]["user_text"] == "I want eat steak."
    cb.current_turn_teaching.invalidate()


@pytest.mark.asyncio
@pytest.mark.parametrize("text", ["", "   "])
async def test_empty_asr_still_times_out_with_retry(transport, monkeypatch, text):
    cb = setup()
    monkeypatch.setattr(teaching, "ASR_TIMEOUT", .03)
    await cb.current_turn_teaching.begin("empty-recording")
    await cb.current_turn_teaching.commit_audio()
    await event(cb, "input_audio_buffer.committed", item_id="empty")
    await event(cb, "conversation.item.input_audio_transcription.completed", item_id="empty", transcript=text)
    await asyncio.sleep(.03)
    assert cb._safe_send.call_args.args[0]["payload"]["reason"] == "asr_timeout"
    transport.post.assert_not_awaited()


@pytest.mark.asyncio
async def test_evaluation_deadline_and_failure_have_neutral_retry(transport, monkeypatch):
    cb = setup()
    monkeypatch.setattr(teaching, "EVALUATION_TIMEOUT", .015)
    async def hangs(*args, **kwargs): await asyncio.sleep(1)
    transport.post.side_effect = hangs
    await cb.current_turn_teaching.begin("input", cb.messages[-1])
    await cb.current_turn_teaching.transcribed(cb.messages[-1])
    await asyncio.sleep(.03)
    cb.conversation.create_response.assert_not_called()
    assert cb._safe_send.call_args.args[0]["payload"]["status"] == "retry"
    cb.current_turn_teaching.score_turn.assert_not_awaited()


@pytest.mark.asyncio
async def test_scoring_real_entry_uses_old_input_after_new_user_arrives(transport, monkeypatch):
    cb = setup()
    old = copy.deepcopy(cb.messages[-1])
    old["timestamp"] = "2026-09-29T01:00:00"
    snapshot = dict(identity=cb.current_turn_teaching.identity(), task=copy.deepcopy(cb.user_context["active_goal"]["current_task"]), user=old)
    cb.messages.append(dict(role="user", content="NEW unrelated answer", turn_id="new"))
    cb.current_turn_id = "new"
    accumulator = AsyncMock(return_value=None)
    monkeypatch.setattr(omni, "_handle_turn_with_accumulator", accumulator)
    await omni._evaluate_scene_turn_progress(cb, 7, 42, "Tutor model", turn_snapshot=snapshot)
    assert accumulator.call_args.args[6] == old["content"]
    assert accumulator.call_args.kwargs["turn_message"] == old
    cb.user_context["active_goal"]["current_task"]["scoring_generation"] = 4
    await omni._evaluate_scene_turn_progress(cb, 7, 42, "Tutor model", turn_snapshot=snapshot)
    assert accumulator.await_count == 1


@pytest.mark.asyncio
async def test_frozen_turns_survive_prompt_refresh_and_real_generation_three_window(transport, monkeypatch):
    """Exercise publish -> real scoring entry -> Redis accumulator -> progress event."""
    cb, redis = setup(), FakeRedis()
    cb.current_turn_teaching.redis_factory = lambda: redis
    monkeypatch.setattr(omni, "_get_redis_client", lambda: redis)
    post = AsyncMock(return_value=dict(
        evaluation_status="evaluated", evidence_sufficient=True, quality="satisfactory",
        delta=2, score=2, interaction_count=3, task_completed=False, scoring_generation=3,
    ))
    monkeypatch.setattr(omni, "_post_scoring_window", post)
    snapshots, results = [], []

    async def score_with_newer_message(callback, goal_id, task_id, speech, *, turn_snapshot):
        snapshots.append(copy.deepcopy(turn_snapshot))
        # A later user message is present when the completed prior response is
        # scored. The immutable teaching snapshot must supply BOTH content/id.
        callback.messages.append(dict(
            role="user", turn_id="newer-" + turn_snapshot["user"]["turn_id"],
            content="Unrelated newer input must never replace the frozen answer.",
        ))
        callback.current_turn_id = callback.messages[-1]["turn_id"]
        authority = copy.deepcopy(callback.user_context["active_goal"])
        for _ in range(3):
            callback._update_session_prompt()
        assert callback.user_context["active_goal"] == authority
        results.append(await omni._evaluate_scene_turn_progress(
            callback, goal_id, task_id, speech, turn_snapshot=turn_snapshot))

    cb.current_turn_teaching.score_turn = score_with_newer_message
    answers = ["I want eat steak.", "I want eat steak. Medium rare, please.",
               "I want eat steak. I prefer the sirloin."]
    speeches = []
    for index, answer in enumerate(answers, start=1):
        cb.conversation.create_response.reset_mock()
        await begin_text(cb, f"frozen-{index}", answer)
        frozen = cb.current_turn_teaching.turn
        assert json.loads(frozen.task_json)["scoring_generation"] == 3
        for _ in range(3):
            cb._update_session_prompt()
        assert cb.current_turn_teaching.turn == frozen
        speeches.append(await complete(cb, f"speech-{index}"))
        await event(cb, "response.done", response={"id": f"speech-{index}", "status": "completed"})
        assert len(results) == index
        if index < 3:
            post.assert_not_awaited()
            assert results[-1] is None

    post.assert_awaited_once()
    payload = post.await_args.args[0]
    window = payload["turn_window"]
    assert [turn["turn_id"] for turn in window] == ["frozen-1", "frozen-2", "frozen-3"]
    assert [turn["user_content"] for turn in window] == answers
    assert [turn["ai_response"] for turn in window] == speeches
    assert [turn["turn_index"] for turn in window] == [1, 2, 3]
    assert payload["scoring_generation"] == payload["current_task"]["scoring_generation"] == 3
    assert payload["force_decision"] is False
    assert all(snapshot["identity"][3] == 3 for snapshot in snapshots)
    assert results[-1]["proficiency_delta"] == 2
    authority = cb.user_context["active_goal"]["current_task"]
    assert (authority["score"], authority["interaction_count"], authority["scoring_generation"]) == (2, 3, 3)
    packets = [call.args[0] for call in cb._safe_send.await_args_list]
    progress = [packet["payload"] for packet in packets if packet["type"] == "proficiency_update"]
    assert len(progress) == 1
    assert (progress[0]["delta"], progress[0]["task_score"], progress[0]["scoring_generation"]) == (2, 2, 3)
    assert progress[0]["turn_ids"] == ["frozen-1", "frozen-2", "frozen-3"]
    key = omni._scoring_window_key(cb.user_id, 7, 42, 3)
    state = json.loads(redis.data[key])
    assert not state["turns"] and not state["queue"]
    assert set(state["seen_turn_ids"]) == {"frozen-1", "frozen-2", "frozen-3"}
    assert len(state["completed_results"]) == 1
    assert state["completed_results"][0]["result"]["delta"] == 2

    # A late generation-3 completion after reset must not create a generation-4
    # window or replay saved positive progress.
    authority.update(score=0, interaction_count=0, scoring_generation=4)
    before_reset_delivery = copy.deepcopy(redis.data)
    send_count = cb._safe_send.await_count
    assert await omni._evaluate_scene_turn_progress(
        cb, 7, 42, speeches[-1], turn_snapshot=snapshots[-1]) is None
    assert redis.data == before_reset_delivery
    assert cb._safe_send.await_count == send_count
    assert authority["score"] == 0 and authority["scoring_generation"] == 4
    post.assert_awaited_once()
    cb.current_turn_teaching.invalidate()


@pytest.mark.asyncio
async def test_late_created_consumes_old_tombstone_without_stealing_new_response(transport):
    cb = setup()
    await begin_text(cb, "old-input")
    old_turn = cb.current_turn_teaching.turn
    assert cb.current_turn_teaching.pending_responses[0][0] == old_turn
    cb.conversation.create_response.reset_mock()
    await begin_text(cb, "new-input", "I want eat steak. Medium rare, please.")
    new_turn = cb.current_turn_teaching.turn
    assert [entry[0] for entry in cb.current_turn_teaching.pending_responses] == [old_turn, new_turn]

    await event(cb, "response.created", response={"id": "late-old-response"})
    assert "late-old-response" in cb.ignored_response_ids
    assert "late-old-response" not in cb.current_turn_teaching.responses
    assert [entry[0] for entry in cb.current_turn_teaching.pending_responses] == [new_turn]
    await event(cb, "response.created", response={"id": "late-old-response"})
    await event(cb, "response.audio.delta", response_id="late-old-response", delta="AAECAw==")
    await event(cb, "response.audio_transcript.done", response_id="late-old-response", transcript="OLD MUST NOT LEAK")
    await event(cb, "response.done", response={"id": "late-old-response", "status": "completed"})
    assert [entry[0] for entry in cb.current_turn_teaching.pending_responses] == [new_turn]
    cb.current_turn_teaching.score_turn.assert_not_awaited()
    cb.current_turn_teaching.save_message.assert_not_awaited()

    await complete(cb, "new-response")
    assert cb.current_turn_teaching.responses["new-response"]["turn"] == new_turn
    await event(cb, "response.done", response={"id": "new-response", "status": "completed"})
    cb.current_turn_teaching.score_turn.assert_awaited_once()
    snapshot = cb.current_turn_teaching.score_turn.await_args.kwargs["turn_snapshot"]
    assert snapshot["user"]["turn_id"] == "new-input"
    packets = [call.args[0] for call in cb._safe_send.await_args_list]
    cards = [packet for packet in packets if packet["type"] == "expression_feedback"]
    assert len(cards) == 1 and cards[0]["payload"]["turn_id"] == "new-input"
    assert "OLD MUST NOT LEAK" not in str(packets)
    assert not cb.current_turn_teaching.pending_responses
    cb.current_turn_teaching.invalidate()


@pytest.mark.asyncio
async def test_replacement_connection_rejects_old_sdk_callback(transport):
    cb = setup()
    old = cb.current_turn_teaching.bind_callback()
    new = cb.current_turn_teaching.bind_callback()
    await asyncio.sleep(0)
    cb.on_event = Mock()
    old.on_event({"type": "response.created"})
    cb.on_event.assert_not_called()
    new.on_event({"type": "response.created"})
    cb.on_event.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["create", "commit", "rejected", "commit_rejected"])
async def test_unacknowledged_submission_reconnects_before_next_turn(transport, failure):
    cb = setup()
    if failure == "create":
        cb.conversation.create_response.side_effect = RuntimeError("send failed")
        await begin_text(cb)
    elif failure == "commit":
        await cb.current_turn_teaching.begin("audio")
        await cb.current_turn_teaching.commit_audio()
        await cb.current_turn_teaching.fail(cb.current_turn_teaching.turn, "audio_commit_failed", reconnect=True)
    elif failure == "commit_rejected":
        await cb.current_turn_teaching.begin("audio")
        await cb.current_turn_teaching.commit_audio()
        await event(cb, "error", error={"message": "commit rejected"})
    else:
        await begin_text(cb)
        await event(cb, "error", error={"message": "request rejected"})
    assert not cb.is_connected
    assert any(c.args[0]["type"] == "connection_closed" for c in cb._safe_send.await_args_list)
    cb.current_turn_teaching.bind_callback()
    await asyncio.sleep(.01)
    cb.is_connected = True
    cb.conversation.create_response.reset_mock(side_effect=True)
    await begin_text(cb, "recovered")
    await complete(cb, "recovered-response")
    await event(cb, "response.done", response={"id": "recovered-response", "status": "completed"})
    cb.current_turn_teaching.score_turn.assert_awaited_once()
    cb.current_turn_teaching.invalidate()


@pytest.mark.asyncio
async def test_late_failure_cannot_cancel_new_turn_while_retry_is_sending(transport):
    cb = setup()
    old = await cb.current_turn_teaching.begin("old")
    sending, release = asyncio.Event(), asyncio.Event()
    async def blocked_send(_packet):
        sending.set()
        await release.wait()
    cb._safe_send.side_effect = blocked_send
    failure = asyncio.create_task(cb.current_turn_teaching.fail(old, "timeout", reconnect=True))
    await sending.wait()
    cb.expression_input_sequence += 1
    new = await cb.current_turn_teaching.begin("new")
    release.set()
    await failure
    assert cb.current_turn_teaching.valid(new)
    assert cb.is_connected
    cb.current_turn_teaching.invalidate()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", sorted(teaching.expression_feedback.EXCLUDED_MODES))
async def test_other_modes_bypass_current_turn_pipeline(transport, mode):
    cb = setup()
    cb.mode = mode
    assert not cb.current_turn_teaching.applies()
    assert not await cb.current_turn_teaching.handle_event({"type": "response.audio.delta"}, "r")
    transport.post.assert_not_awaited()
