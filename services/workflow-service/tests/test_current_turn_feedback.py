"""Offline v2 contract coverage; does not certify live model factual accuracy."""

import asyncio
import copy
import json
import os
import sys
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import expression_routes as routes
from workflows import current_turn_feedback as feedback
from workflows.expression_feedback import validate_feedback


EN_CONTEXT = dict(
    scenario="Interview", current_task="Introduce yourself and your professional background",
    target_language="English", native_language="Chinese", level="A1",
    user_text="I work engineer. I has experience.",
    previous_ai_text="An example: I managed 20 people and a 500000 dollar budget.",
)
JA_CONTEXT = dict(
    EN_CONTEXT, target_language="Japanese", user_text="私はエンジニアです。予算は五百でした。",
    previous_ai_text="例として、予算は五百万円、チームは二十人です。",
)


def correction():
    return dict(
        protocol_version=2, teaching_mode="correct", off_topic=False,
        errors=[
            dict(original="I work engineer", corrected="I work as an engineer",
                 explanation_l1="职业前需要 as 和冠词。"),
            dict(original="I has experience", corrected="I have experience",
                 explanation_l1="I 后使用 have。"),
        ],
        alternatives=["I work as an engineer. I have experience.", "I am an experienced engineer."],
        next_question_locked="",
        correction_explanation=("Change I work engineer to I work as an engineer, "
                                "and I has experience to I have experience."),
        retry_prompt="Please try saying both sentences again.", acknowledgement="",
        clarification_question="", uncertain_details=[], fact_quotes=["engineer", "experience"],
    )


def clarification():
    return dict(
        protocol_version=2, teaching_mode="clarify", off_topic=False, errors=[], alternatives=[],
        next_question_locked="", correction_explanation="", retry_prompt="", acknowledgement="",
        clarification_question="予算の「五百」の単位を教えてください。",
        uncertain_details=["予算の単位"], fact_quotes=["予算は五百でした"],
    )


def advance():
    return dict(
        protocol_version=2, teaching_mode="advance", off_topic=False, errors=[],
        alternatives=["私はエンジニアです。", "私の職業はエンジニアです。"],
        next_question_locked="どのような仕事を担当していますか？",
        correction_explanation="", retry_prompt="", acknowledgement="職業を明確に説明できました。",
        clarification_question="", uncertain_details=[], fact_quotes=["私はエンジニアです"],
    )


def test_hypothetical_visit_question_keeps_original_fact_evidence():
    context = dict(EN_CONTEXT, current_task="Tell the guard your name and visit purpose",
                   user_text="I'm Riley and I'm here for an interview.")
    value = dict(advance(), alternatives=["I'm Riley, here for an interview.",
                 "My name is Riley. I'm here for an interview."],
                 acknowledgement="Thanks, Riley.", fact_quotes=["Riley", "interview"],
                 next_question_locked="For a practice visit, imagine you are delivering equipment. What would you tell the guard?")
    original = copy.deepcopy(value)
    result = feedback.validate_current_feedback(value, context)
    assert result == original and value == original
    assert result["fact_quotes"] == ["Riley", "interview"]
    assert not result["retry_prompt"] and not result["errors"]
    assert not {"score", "delta", "task_completed"}.intersection(result)
    with pytest.raises(ValueError):
        feedback.validate_current_feedback(dict(value, fact_quotes=["delivering equipment"]), context)


def test_complete_correction_preserves_both_repairs_without_mutating_inputs():
    value, context = correction(), copy.deepcopy(EN_CONTEXT)
    original = copy.deepcopy(value)
    result = feedback.validate_current_feedback(value, context)
    assert result == original
    assert value == original and context == EN_CONTEXT
    assert result is not value and result["errors"] is not value["errors"]
    assert not {"score", "delta", "task_completed", "scoring_generation"}.intersection(result)


@pytest.mark.parametrize("field,value", [
    ("retry_prompt", ""),
    ("acknowledgement", "Excellent work!"),
    ("next_question_locked", "How many people did you manage?"),
    ("correction_explanation", "Change I work engineer to I work as an engineer."),
    ("alternatives", ["I work as an engineer.", "I am an engineer."]),
    ("errors", []),
])
def test_incomplete_or_advancing_correction_fails_closed(field, value):
    with pytest.raises(ValueError):
        feedback.validate_current_feedback(dict(correction(), **{field: value}), EN_CONTEXT)


def test_error_original_must_quote_student_and_change_something():
    for original, corrected in (("I managed 20 people", "I led 20 people"),
                                ("I work engineer", "I work engineer")):
        value = correction()
        value["errors"][0].update(original=original, corrected=corrected)
        with pytest.raises(ValueError):
            feedback.validate_current_feedback(value, EN_CONTEXT)


def test_correction_span_matching_tolerates_whitespace_in_explanation():
    value = correction()
    value["correction_explanation"] = value["correction_explanation"].replace("I work", "I  work")
    assert feedback.validate_current_feedback(value, EN_CONTEXT)["teaching_mode"] == "correct"


def test_japanese_uncertain_unit_requires_clarification_without_inventing_currency():
    result = feedback.validate_current_feedback(clarification(), JA_CONTEXT)
    assert result["uncertain_details"] == ["予算の単位"]
    assert "五百" in result["clarification_question"]
    assert "万円" not in result["clarification_question"]
    assert not result["errors"] and not result["alternatives"]


@pytest.mark.parametrize("field,value", [
    ("alternatives", ["私は予算五百万円を担当しました。", "私の予算は五百万円でした。"]),
    ("errors", [dict(original="五百", corrected="五百万円", explanation_l1="补充单位。")]),
    ("acknowledgement", "よくできました。"),
    ("retry_prompt", "もう一度言ってください。"),
    ("next_question_locked", "何人のチームでしたか？"),
    ("correction_explanation", "単位は万円です。"),
    ("clarification_question", ""), ("uncertain_details", []), ("off_topic", True),
])
def test_clarify_rejects_missing_question_and_any_other_teaching_branch(field, value):
    with pytest.raises(ValueError):
        feedback.validate_current_feedback(dict(clarification(), **{field: value}), JA_CONTEXT)


def test_natural_concise_answer_can_advance_without_a_followup():
    assert feedback.validate_current_feedback(advance(), JA_CONTEXT)["teaching_mode"] == "advance"
    assert feedback.validate_current_feedback(dict(advance(), next_question_locked=""), JA_CONTEXT)
    assert feedback.validate_current_feedback(
        dict(advance(), teaching_mode="polish", next_question_locked=""), JA_CONTEXT)


@pytest.mark.parametrize("question", ["担当は何ですか？何人ですか？", "担当は何ですか", "担当は\n何ですか？"])
def test_advance_rejects_multiple_or_malformed_followups(question):
    with pytest.raises(ValueError):
        feedback.validate_current_feedback(dict(advance(), next_question_locked=question), JA_CONTEXT)


def test_tutor_example_is_not_student_fact_evidence():
    for context, value, tutor_fact in (
        (EN_CONTEXT, correction(), "500000 dollar budget"),
        (JA_CONTEXT, advance(), "五百万円"),
    ):
        assert tutor_fact in context["previous_ai_text"] and tutor_fact not in context["user_text"]
        with pytest.raises(ValueError, match="facts must quote student input"):
            feedback.validate_current_feedback(dict(value, fact_quotes=[tutor_fact]), context)


def test_uncertainty_cannot_be_hidden_in_advance():
    with pytest.raises(ValueError, match="uncertainty requires clarification"):
        feedback.validate_current_feedback(dict(advance(), uncertain_details=["予算の単位"]), JA_CONTEXT)


def test_off_topic_redirect_has_no_errors_or_question():
    value = dict(correction(), off_topic=True, errors=[], correction_explanation="", retry_prompt="",
                 acknowledgement="Let's return to your professional background.")
    assert feedback.validate_current_feedback(value, EN_CONTEXT)["off_topic"] is True
    for changes in ({"retry_prompt": "Try again."}, {"teaching_mode": "advance"},
                    {"next_question_locked": "Which team?"}):
        with pytest.raises(ValueError):
            feedback.validate_current_feedback(dict(value, **changes), EN_CONTEXT)


@pytest.mark.parametrize("changes", [
    {"protocol_version": True}, {"protocol_version": 1}, {"off_topic": "false"},
    {"score": 3}, {"fact_quotes": "engineer"}, {"errors": [None]},
    {"alternatives": ["I am an engineer.", "I am an engineer."]},
    {"alternatives": ["Can I help you introduce yourself?", "I am an engineer."]},
    {"retry_prompt": "[TASK_COMPLETE]"}, {"retry_prompt": "See https://example.com"},
    {"uncertain_details": ["x"] * 6}, {"fact_quotes": ["engineer"] * 9},
    {"acknowledgement": "x" * 401},
])
def test_strict_schema_and_content_limits(changes):
    with pytest.raises(ValueError):
        feedback.validate_current_feedback(dict(correction(), **changes), EN_CONTEXT)


def test_all_protocol_fields_required():
    for field in correction():
        value = correction()
        del value[field]
        with pytest.raises(ValueError, match="schema"):
            feedback.validate_current_feedback(value, EN_CONTEXT)


@pytest.mark.asyncio
async def test_transport_sends_untrusted_context_without_scoring_and_ignores_rollout_flags(monkeypatch):
    monkeypatch.setenv("SCENE_CURRENT_TURN_TEACHING_ENABLED", "false")
    monkeypatch.setenv("SCENE_EXPRESSION_FEEDBACK_ENABLED", "false")
    monkeypatch.setenv("INTERNAL_AUTH_SECRET", "test-only")
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_api_key", "test-only")
    post = AsyncMock(return_value=json.dumps(clarification(), ensure_ascii=False))
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_post_chat_completion", post)
    result = await routes.current_turn_feedback(routes.ExpressionRequest(**JA_CONTEXT), "test-only")
    assert result == {"success": True, "data": clarification()}
    messages = post.call_args.kwargs["messages"]
    assert json.loads(messages[1]["content"]) == JA_CONTEXT
    assert "untrusted" in messages[0]["content"]
    assert "ONLY evidence" in messages[0]["content"]
    post.reset_mock()
    assert await routes.expression_feedback(routes.ExpressionRequest(**EN_CONTEXT), "test-only") == {
        "success": True, "data": None}
    post.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("secret,provided", [("test-only", "wrong"), ("test-only", ""), ("", "")])
async def test_internal_auth_rejects_before_evaluator(monkeypatch, secret, provided):
    monkeypatch.setenv("INTERNAL_AUTH_SECRET", secret)
    evaluate = AsyncMock()
    monkeypatch.setattr(routes, "evaluate_current_expression", evaluate)
    with pytest.raises(HTTPException) as error:
        await routes.current_turn_feedback(routes.ExpressionRequest(**EN_CONTEXT), provided)
    assert error.value.status_code == 403
    evaluate.assert_not_awaited()


@pytest.mark.asyncio
async def test_six_second_deadline_cancels_upstream_and_returns_neutral_null(monkeypatch, caplog):
    monkeypatch.setenv("INTERNAL_AUTH_SECRET", "test-only")
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_api_key", "test-only")
    cancelled = asyncio.Event()

    async def pending(**kwargs):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_post_chat_completion", pending)
    actual_wait_for = asyncio.wait_for
    deadlines = []

    async def short_deadline(awaitable, timeout):
        deadlines.append(timeout)
        return await actual_wait_for(awaitable, timeout=0.001)

    monkeypatch.setattr(feedback.asyncio, "wait_for", short_deadline)
    result = await routes.current_turn_feedback(routes.ExpressionRequest(**EN_CONTEXT), "test-only")
    assert result == {"success": True, "data": None}
    assert deadlines == [6.0] and cancelled.is_set()
    assert EN_CONTEXT["user_text"] not in caplog.text


@pytest.mark.asyncio
async def test_upstream_schema_and_private_failure_bodies_are_not_leaked(monkeypatch, caplog):
    monkeypatch.setenv("INTERNAL_AUTH_SECRET", "test-only")
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_api_key", "test-only")
    post = AsyncMock(side_effect=["not JSON with private text", json.dumps(dict(clarification(), score=3)),
                                 RuntimeError("private student body and credentials")])
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_post_chat_completion", post)
    for _ in range(3):
        assert await routes.current_turn_feedback(routes.ExpressionRequest(**JA_CONTEXT), "test-only") == {
            "success": True, "data": None}
    assert "private" not in caplog.text and "credentials" not in caplog.text


@pytest.mark.asyncio
async def test_missing_api_key_never_calls_upstream(monkeypatch):
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_api_key", "")
    post = AsyncMock()
    monkeypatch.setattr(feedback.batch_evaluation_workflow, "_post_chat_completion", post)
    assert await feedback.evaluate_current_expression(EN_CONTEXT) is None
    post.assert_not_awaited()


def test_legacy_question_sanitization_stays_separate_from_strict_v2():
    value = correction()
    legacy = {field: value[field] for field in (
        "teaching_mode", "errors", "alternatives", "off_topic", "next_question_locked")}
    legacy["next_question_locked"] = "What is your next project?"
    assert validate_feedback(legacy, "English")["next_question_locked"] == ""
    with pytest.raises(ValueError):
        feedback.validate_current_feedback(dict(value, next_question_locked=legacy["next_question_locked"]), EN_CONTEXT)
