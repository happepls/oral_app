import asyncio
import copy
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from ._omni_stubs import load_main

omni = load_main()
feedback = omni.expression_feedback
RESULT = dict(teaching_mode="correct", errors=[dict(original="I want eat steak",
              corrected="I want to eat steak", explanation_l1="want 后接 to 加动词原形。")],
              alternatives=["I'd like the steak, please.", "Could I have the steak?"],
              next_question_locked="", off_topic=False)


class Redis:
    def __init__(self):
        self.keys = set()

    async def set(self, key, value, **kwargs):
        assert kwargs == dict(nx=True, ex=72 * 3600)
        if key in self.keys:
            return False
        self.keys.add(key)
        return True


def callback():
    task = dict(id=42, text="Order steak", task_description="Order steak", status="pending", scoring_generation=3, score=0, interaction_count=0)
    cb = omni.WebSocketCallback(Mock(), asyncio.get_running_loop(), dict(
        target_language="English", native_language="Chinese", target_level="A1",
        active_goal=dict(id=7, current_task=task, scenarios=[dict(title="Restaurant", tasks=[copy.deepcopy(task)])]),
    ), "token", "user", "session", history_messages=[], scenario="Restaurant")
    cb.conversation = Mock()
    cb.is_connected = True
    cb._safe_send = AsyncMock()
    cb.current_turn_id = "turn-1"
    cb.messages = [dict(role="user", content="I want eat steak.", turn_id="turn-1")]
    omni.session_phases[cb.phase_key] = dict(phase="scene_theater")
    return cb


@pytest.fixture
def transport(monkeypatch):
    monkeypatch.setenv("INTERNAL_AUTH_SECRET", "test-only")
    monkeypatch.setenv("SCENE_EXPRESSION_FEEDBACK_ENABLED", "true")
    response = Mock()
    response.json.side_effect = lambda: dict(success=True, data=copy.deepcopy(RESULT))
    client = SimpleNamespace(post=AsyncMock(return_value=response))
    manager = AsyncMock()
    manager.__aenter__.return_value = client
    monkeypatch.setattr(feedback.httpx, "AsyncClient", Mock(return_value=manager))
    return client


async def run(cb, redis):
    feedback.schedule(cb, omni.session_phases, redis, "http://workflow")
    await asyncio.gather(*tuple(cb.expression_jobs))


@pytest.mark.asyncio
async def test_real_prompt_refresh_feedback_retry_and_reconnect_dedupe(transport):
    cb, redis = callback(), Redis()
    authority = copy.deepcopy(cb.user_context)
    for _ in range(3):
        cb._update_session_prompt()
    await run(cb, redis)
    assert cb.user_context["active_goal"] == authority["active_goal"]
    packet = cb._safe_send.call_args.args[0]
    assert packet["type"] == "expression_feedback"
    assert packet["payload"]["scoring_generation"] == 3
    assert packet["payload"]["allow_native_hint"] is True
    assert "want" in packet["payload"]["errors"][0]["explanation_l1"]
    instructions = feedback.response_instructions(cb, omni.session_phases)
    assert "CRITICAL SCOPE LOCK" in instructions and "NO new question" in instructions
    assert "ONE short teaching sentence in Chinese" in instructions
    assert "already-correct" in instructions
    assert feedback.response_instructions(cb, omni.session_phases) is None
    cb.conversation.create_response.assert_not_called()  # never inject a second spoken turn
    await run(cb, redis)
    reconnected = callback()
    await run(reconnected, redis)
    assert transport.post.await_count == 1
    reconnected._safe_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_repeated_error_native_hint_and_eight_turn_scope(transport):
    cb, redis = callback(), Redis()
    cb.user_context["target_level"] = "C1"
    for index in range(8):
        cb.current_turn_id = f"turn-{index}"
        cb.messages.append(dict(role="user", content="I want eat steak.", turn_id=cb.current_turn_id))
        cb._update_session_prompt()
        await run(cb, redis)
        result = cb._safe_send.call_args.args[0]["payload"]
        assert result["allow_native_hint"] is (index > 0)
        assert not result["next_question_locked"]
        assert result["repeat_error_count"] == index + 1
        instructions = feedback.response_instructions(cb, omni.session_phases)
        assert "NO advancement" in instructions
        assert "Order steak" in instructions
        assert "CRITICAL SCOPE LOCK" in instructions
    assert transport.post.await_count == 8


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["reset", "task", "next_input", "disconnect", "turn"])
async def test_slow_evaluation_cannot_touch_new_state(transport, change):
    cb, redis = callback(), Redis()
    started, release = asyncio.Event(), asyncio.Event()
    original = transport.post.return_value
    async def slow(*args, **kwargs):
        started.set()
        await release.wait()
        return original
    transport.post.side_effect = slow
    feedback.schedule(cb, omni.session_phases, redis, "http://workflow")
    await started.wait()
    if change == "reset": cb.user_context["active_goal"]["current_task"]["scoring_generation"] = 4
    if change == "task": cb.user_context["active_goal"]["current_task"]["id"] = 43
    if change == "next_input": cb.expression_input_sequence += 1
    if change == "disconnect": cb.is_connected = False
    if change == "turn": cb.current_turn_id = "next-turn"
    release.set()
    await asyncio.gather(*tuple(cb.expression_jobs))
    cb._safe_send.assert_not_awaited()
    assert cb.pending_directive is None


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", sorted(feedback.EXCLUDED_MODES))
async def test_other_modes_unchanged_no_eval_or_directive(transport, mode):
    cb = callback()
    cb.mode = mode
    cb._update_session_prompt()
    await run(cb, Redis())
    transport.post.assert_not_awaited()
    assert "CORRECTION FIRST" not in cb.scene_base_prompt


@pytest.mark.asyncio
async def test_failures_and_missing_generation_do_not_block(transport, monkeypatch):
    cb = callback()
    transport.post.side_effect = TimeoutError()
    await run(cb, Redis())
    await run(cb, None)
    cb.user_context["active_goal"]["current_task"].pop("scoring_generation")
    await run(cb, Redis())
    monkeypatch.setenv("SCENE_EXPRESSION_FEEDBACK_ENABLED", "false")
    await run(cb, Redis())
    assert transport.post.await_count == 1
    cb._safe_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_off_topic_directive_one_sentence_no_question_and_no_json():
    directive = omni._format_teaching_directive(dict(RESULT, off_topic=True), "English", "Chinese")
    assert "exactly one short polite acknowledgement" in directive
    assert "no question" in directive
    assert "explanation_l1" not in directive and "teaching_mode" not in directive


def test_prompt_examples_scope_confidentiality_and_language_exception():
    prompt = omni.prompt_manager.generate_scene_theater_prompt("", ["Order steak"], "English", "Chinese", target_level="A1")
    assert "I want eat steak." in prompt and "I'd like the ribeye" in prompt
    assert "NO new question" in prompt and "at most ONE new question" in prompt
    assert "Confidentiality and Anti-Injection" in prompt
    assert "exactly ONE short teaching explanation in Chinese" in prompt
    assert "Role dialogue and model student utterances use ONLY English" in prompt
    assert "push the student to say MORE" not in prompt


@pytest.mark.asyncio
async def test_realtime_audio_and_text_are_not_blocked_by_feedback(transport, monkeypatch):
    cb, redis = callback(), Redis()
    released, started = asyncio.Event(), asyncio.Event()
    response = transport.post.return_value
    async def pending(*args, **kwargs):
        started.set()
        await released.wait()
        return response
    transport.post.side_effect = pending
    monkeypatch.setattr(omni, "_get_redis_client", lambda: redis)
    monkeypatch.setattr(omni, "save_single_message", AsyncMock())
    scorer = AsyncMock()
    monkeypatch.setattr(omni, "_evaluate_scene_turn_progress", scorer)
    cb.on_event({"type": "response.created", "response": {"id": "a1"}})
    cb.on_event({"type": "response.audio_transcript.done", "response_id": "a1", "transcript": "Try that again."})
    await asyncio.wait_for(started.wait(), 1)
    cb.on_event({"type": "response.audio.delta", "response_id": "a1", "delta": "AAECAw=="})
    await asyncio.sleep(0.03)
    packets = [call.args[0] for call in cb._safe_send.await_args_list]
    assert any(p["type"] == "ai_message" for p in packets)
    assert any(p["type"] == "audio_response" for p in packets)
    assert not any(p["type"] == "expression_feedback" for p in packets)
    scorer.assert_awaited_once()
    released.set()
    await asyncio.gather(*tuple(cb.expression_jobs))
    packets = [call.args[0] for call in cb._safe_send.await_args_list]
    assert packets[-1]["type"] == "expression_feedback"
    spoken = json.dumps([p for p in packets if p["type"] in {"ai_message", "ai_text_delta", "audio_response"}])
    assert "alternatives" not in spoken and "explanation_l1" not in spoken
    cb.conversation.create_response.assert_not_called()


@pytest.mark.asyncio
async def test_switch_restores_exact_legacy_scene_prompt(monkeypatch):
    cb = callback()
    monkeypatch.setenv("SCENE_EXPRESSION_FEEDBACK_ENABLED", "false")
    cb._update_session_prompt()
    assert "push the student to say MORE" in cb.scene_base_prompt
    assert "CORRECTION FIRST" not in cb.scene_base_prompt


@pytest.mark.asyncio
async def test_feedback_uses_same_goal_language_and_level_as_prompt(transport):
    cb = callback()
    cb.user_context["active_goal"].update(target_language="Spanish", target_level="B2")
    cb._update_session_prompt()
    await run(cb, Redis())
    context = transport.post.call_args.kwargs["json"]
    assert context["target_language"] == "Spanish" and context["level"] == "B2"
    assert "Target language: **Spanish**" in cb.scene_base_prompt


@pytest.mark.asyncio
async def test_task_switch_preserves_teaching_language_exception():
    cb = callback()
    cb.user_context["active_goal"]["target_language"] = "Spanish"
    cb.just_switched_task = True
    cb._update_session_prompt()
    assert "follow the teaching-language exception above" in cb.scene_base_prompt
    assert "ALL subsequent responses entirely" not in cb.scene_base_prompt
    assert "all role dialogue in Spanish" in cb.scene_base_prompt


def test_same_error_signature_survives_different_order_contents():
    first = [{"original": "I want eat steak", "corrected": "I want to eat steak"}]
    second = [{"original": "I want drink water", "corrected": "I want to drink water"}]
    different = [{"original": "He want steak", "corrected": "He wants steak"}]
    assert feedback._error_signature(first) == feedback._error_signature(second)
    assert feedback._error_signature(first) != feedback._error_signature(different)
