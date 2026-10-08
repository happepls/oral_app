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
async def test_feedback_uses_heard_audio_instead_of_display_asr(transport):
    cb = callback()
    cb.messages[-1].update(content='corrupted ASR', input_source='audio', audio_evidence={
        'status': 'clear', 'heard_text': 'I want eat steak.', 'uncertain_spans': []})
    await run(cb, Redis())
    assert transport.post.call_args.kwargs['json']['user_text'] == 'I want eat steak.'
    transport.post.reset_mock()
    cb.messages[-1]['audio_evidence']['status'] = 'uncertain'
    await run(cb, Redis())
    transport.post.assert_not_awaited()


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
    assert "ONE short teaching explanation in Chinese" in instructions
    assert "previously correct answer never exempts a NEW answer" in instructions
    assert "PRIVATE PREVIOUS-ATTEMPT NOTES" not in feedback.response_instructions(cb, omni.session_phases)
    assert cb.pending_directive is None
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
async def test_previous_off_topic_notes_cannot_force_current_redirect():
    directive = omni._format_teaching_directive(dict(RESULT, off_topic=True), "English", "Chinese")
    assert "decide independently whether the new input is on-topic" in directive
    assert "NOT a decision for the CURRENT answer" in directive
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
@pytest.mark.parametrize("candidate", ["", "What is your name?", "Try another way: I'm Alex, here for an interview."])
async def test_successful_separate_turns_do_not_restart_drill_after_real_refresh(transport, candidate):
    cb = callback()
    task = cb.user_context["active_goal"]["current_task"]
    task.update(task_description="Tell the guard your name and visit purpose", score=6,
                interaction_count=7)
    cb.user_context["active_goal"]["scenarios"][0]["tasks"][0].update(task)
    cb.messages = [dict(role="user", content="I'm Alex.", turn_id="name"),
                   dict(role="assistant", content="What brings you here?"),
                   dict(role="user", content="I'm here for an interview.", turn_id="turn-1")]
    transport.post.return_value.json.side_effect = lambda: dict(success=True, data=dict(
        RESULT, teaching_mode="advance", errors=[], next_question_locked=candidate))
    authority = copy.deepcopy(cb.user_context["active_goal"])
    for _ in range(3):
        cb._update_session_prompt()
    await run(cb, Redis())
    instructions = feedback.response_instructions(cb, omni.session_phases)
    assert "Count details given" in instructions
    if candidate:
        assert candidate not in feedback.format_directive(
            dict(RESULT, errors=[], next_question_locked=candidate), "English", "Chinese")
    assert "explicitly hypothetical situation" in instructions
    assert "not a complete answer to copy" in instructions
    assert "never evidence about the student's real life" in instructions
    assert "If the student declines practice" in instructions
    assert "CRITICAL SCOPE LOCK" in instructions
    assert "SUCCESS MUST LEAD TO PRACTICE" not in instructions
    assert "choose another equivalent phrasing" not in instructions
    assert cb.user_context["active_goal"] == authority
    packet = cb._safe_send.call_args.args[0]["payload"]
    assert packet["scoring_generation"] == 3
    assert "PRIVATE PREVIOUS-ATTEMPT NOTES" not in feedback.response_instructions(cb, omni.session_phases)
    assert cb.pending_directive is None


@pytest.mark.asyncio
async def test_previous_success_does_not_schedule_new_situation_or_override_repair(transport):
    cb = callback()
    cb.messages[-1]["content"] = "I'm here to deliver document."
    candidate = "Imagine a new visit for collecting a package. What would you tell me?"
    transport.post.return_value.json.side_effect = lambda: dict(success=True, data=dict(
        RESULT, teaching_mode="advance", errors=[], next_question_locked=candidate))
    cb._update_session_prompt()
    authority = copy.deepcopy(cb.user_context["active_goal"])
    await run(cb, Redis())
    instructions = feedback.response_instructions(cb, omni.session_phases)
    assert candidate not in instructions
    assert instructions.count("# CORRECTION FIRST") == 1
    assert "NO new hypothetical situation until that error is fixed" in instructions
    assert "SUPPORT:" in instructions and "REPAIR:" in instructions
    assert cb.user_context["active_goal"] == authority


@pytest.mark.asyncio
async def test_current_cue_is_frozen_even_when_feedback_has_not_arrived():
    cb = callback()
    cb.messages = [dict(role="assistant", content="Old interview visit"),
                   dict(role="assistant", content="Imagine returning a borrowed item."),
                   dict(role="user", content="Does borrow mean return?")]
    cb.task_history_cutoff = 1
    cb._update_session_prompt()
    instructions = feedback.response_instructions(cb, omni.session_phases)
    assert "# CURRENT RESPONSE CONTEXT" in instructions
    context = instructions.split("# CURRENT RESPONSE CONTEXT")[-1]
    assert "returning a borrowed item" in context and "Old interview" not in context
    assert "Do not re-ask known identity" in context
    assert cb.pending_directive is None


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
