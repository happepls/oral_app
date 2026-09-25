"""Offline protocol/guardrail tests, not a claim about live model accuracy."""
import copy
import json
import os
import sys
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from workflows import expression_feedback as feedback
from expression_routes import ExpressionRequest, expression_feedback
from fastapi import HTTPException


CONTEXT = dict(scenario="Restaurant", current_task="Order steak and specify doneness",
               target_language="English", native_language="Chinese", level="A1",
               user_text="I want eat steak.", previous_ai_text="What would you like?")
CORRECTION = dict(teaching_mode="correct", errors=[dict(original="I want eat steak",
                  corrected="I want to eat steak", explanation_l1="want 后接 to 加动词原形。")],
                  alternatives=["I'd like the steak, please.", "Could I have the steak?"],
                  next_question_locked="", off_topic=False)


@pytest.mark.asyncio
async def test_grammar_error_uses_isolated_json_call_and_locks_question(monkeypatch):
    result = copy.deepcopy(CORRECTION)
    result["next_question_locked"] = "Would you like red wine?"
    post = AsyncMock(return_value=json.dumps(result))
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_post_chat_completion", post)
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_api_key", "test-only")
    result = await feedback.evaluate_expression(CONTEXT)
    assert result["teaching_mode"] == "correct"
    assert result["next_question_locked"] == ""
    assert "to" in result["errors"][0]["explanation_l1"]
    messages = post.call_args.kwargs["messages"]
    assert messages[0]["role"] == "system"
    assert json.loads(messages[1]["content"]) == CONTEXT
    assert "untrusted" in messages[0]["content"]
    assert not {"score", "delta", "task_completed"}.intersection(result)


def test_natural_answer_advances_one_step_and_off_topic_cannot_advance():
    natural = dict(CORRECTION, teaching_mode="advance", errors=[], alternatives=[
        "I'll have the ribeye, medium rare, please.", "Could I have the ribeye cooked medium rare?"],
        next_question_locked="How would you like it cooked?")
    assert feedback.validate_feedback(natural, "en")["teaching_mode"] == "advance"
    off_topic = feedback.validate_feedback(dict(natural, off_topic=True), "en")
    assert off_topic["teaching_mode"] == "correct" and not off_topic["next_question_locked"]
    assert not off_topic["errors"]
    with pytest.raises(ValueError):
        feedback.validate_feedback(dict(natural, next_question_locked="Any sides? Anything else?"), "en")
    assert not feedback.validate_feedback(dict(natural, teaching_mode="polish"), "en")["next_question_locked"]


@pytest.mark.parametrize("invalid", [
    ["Would you like the steak?", "Could I have steak?"],
    ["Can I get you steak?", "I'd like steak."],
    ["You should say I want steak.", "I'd like steak."],
    ["I want steak."], ["I want steak."] * 3,
    ["I want steak. [TASK_COMPLETE]", "I'd like steak."],
    ["I want steak.", {"text": "I want steak"}],
])
def test_rejects_tutor_voice_bad_card_count_and_machine_content(invalid):
    with pytest.raises(ValueError):
        feedback.validate_feedback(dict(CORRECTION, alternatives=invalid), "English")


def test_five_turns_all_alternatives_are_student_voice():
    for noun in ("steak", "ribeye", "sirloin", "fillet", "strip steak"):
        result = feedback.validate_feedback(dict(CORRECTION, alternatives=[
            f"I'd like the {noun}, please.", f"Could I have the {noun}?", f"I'll have the {noun}."],
        ), "English")
        assert len(result["alternatives"]) == 3
        assert all(feedback._student_voice(text, "English") for text in result["alternatives"])


@pytest.mark.asyncio
async def test_internal_auth_switch_timeout_and_no_raw_failure_leak(monkeypatch):
    monkeypatch.setenv("INTERNAL_AUTH_SECRET", "test-only")
    request = ExpressionRequest(**CONTEXT)
    with pytest.raises(HTTPException) as error:
        await expression_feedback(request, "wrong")
    assert error.value.status_code == 403
    post = AsyncMock(side_effect=TimeoutError("private student text"))
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_post_chat_completion", post)
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_api_key", "test-only")
    assert (await expression_feedback(request, "test-only"))["data"] is None
    monkeypatch.setenv("SCENE_EXPRESSION_FEEDBACK_ENABLED", "false")
    post.reset_mock()
    assert (await expression_feedback(request, "test-only"))["data"] is None
    post.assert_not_awaited()


def test_wrong_schema_and_unknown_language_fail_closed():
    for bad in (None, {}, dict(CORRECTION, off_topic="false"), dict(CORRECTION, errors=[])):
        with pytest.raises(ValueError):
            feedback.validate_feedback(bad, "English")
    with pytest.raises(ValueError):
        feedback.validate_feedback(CORRECTION, "Unsupported language")
