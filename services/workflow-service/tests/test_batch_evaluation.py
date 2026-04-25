"""
Tests for BatchEvaluationWorkflow (Feature 1 — 批量评估 Agent)

Design spec: docs/batch-evaluation-agent-design.md

Covers:
- _rule_based_fallback(): 4-turn window + current_task.keywords → delta, coverage_ratio, matched/missed
- evaluate_window() LLM failure path: dashscope.Generation.call raises → fallback path
- JSON parse tolerance: markdown-wrapped JSON (```json ... ```)
- delta=0 → no DB update (mock _update_user_proficiency stays untouched)
- Cheat defense: same keyword repeated 4x → unique_hits=1 → delta=0

NOTE: Implementation is in progress (task #2 F1-1). Tests use defensive imports and
skip-on-missing so the file is committable before the workflow module exists.
When the module lands, remove the skip guard and they should run clean.
"""
import json
import os
import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# --- Ensure src on path ---------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

# --- Stub 'dashscope' so import of batch_evaluation does not blow up -----
# dashscope is not installed in the host test env; the real container has it.
if "dashscope" not in sys.modules:
    _ds = types.ModuleType("dashscope")

    class _Generation:
        @staticmethod
        def call(*args, **kwargs):
            raise RuntimeError("stub: override with patch in tests")

    _ds.Generation = _Generation
    sys.modules["dashscope"] = _ds

# --- Defensive import ----------------------------------------------------
try:
    from workflows.batch_evaluation import BatchEvaluationWorkflow  # type: ignore
    _IMPL_AVAILABLE = True
except Exception as _imp_err:  # noqa: BLE001
    BatchEvaluationWorkflow = None  # type: ignore
    _IMPL_AVAILABLE = False
    _IMPORT_ERROR = _imp_err

pytestmark = pytest.mark.skipif(
    not _IMPL_AVAILABLE,
    reason="batch_evaluation.py not yet implemented (task #2 F1-1 pending)",
)


# =========================================================================
# Fixtures
# =========================================================================


@pytest.fixture
def workflow():
    return BatchEvaluationWorkflow()


@pytest.fixture
def current_task():
    return {
        "id": 42,
        "task_description": "Ask about check-in times and room types",
        "keywords": ["check-in", "room", "reservation", "available"],
        "scenario_title": "Hotel Check-In",
        "target_language": "English",
    }


def _mk_turn(idx: int, user: str, ai: str) -> dict:
    return {
        "turn_index": idx,
        "user_content": user,
        "ai_response": ai,
        "timestamp": f"2026-04-20T10:0{idx}:00Z",
    }


@pytest.fixture
def window_diverse(current_task):
    """4 turns covering 3 distinct keywords → above the ≥3 hits threshold."""
    return [
        _mk_turn(1, "I want to check-in please.", "Great! Do you have a reservation?"),
        _mk_turn(2, "Yes I have a reservation under Smith.", "Let me look that up."),
        _mk_turn(3, "Any room with a nice view?", "We have several options."),
        _mk_turn(4, "Is a double room available?", "Yes, on the 5th floor."),
    ]


@pytest.fixture
def window_cheat(current_task):
    """4 turns repeating SAME keyword → unique_hits must collapse to 1."""
    return [
        _mk_turn(1, "check-in check-in", "Ok."),
        _mk_turn(2, "check-in please", "Sure."),
        _mk_turn(3, "I want check-in", "Got it."),
        _mk_turn(4, "check-in now", "Right away."),
    ]


# =========================================================================
# 1. _rule_based_fallback()
# =========================================================================


class TestRuleBasedFallback:
    def test_diverse_window_counts_unique_hits(self, workflow, window_diverse, current_task):
        result = workflow._rule_based_fallback(window_diverse, current_task)

        assert isinstance(result, dict)
        detail = result["keyword_coverage_detail"]
        matched = {m.lower() for m in detail["matched"]}
        # all four keywords were used across the 4 turns
        assert "check-in" in matched
        assert "reservation" in matched
        assert "room" in matched
        assert "available" in matched
        assert detail["coverage_ratio"] == pytest.approx(1.0, abs=0.01)
        assert detail["missed"] == [] or set(detail["missed"]) == set()

    def test_cheat_repeated_keyword_unique_hits_is_one(
        self, workflow, window_cheat, current_task
    ):
        result = workflow._rule_based_fallback(window_cheat, current_task)
        detail = result["keyword_coverage_detail"]
        matched_lower = {m.lower() for m in detail["matched"]}

        # Only "check-in" counts, even though spoken 4 times
        assert matched_lower == {"check-in"}
        assert detail["coverage_ratio"] == pytest.approx(0.25, abs=0.01)
        # Spec §六: unique_hits=1 → input_score=4 → delta=0 under the "≤5→0" gate
        assert result["delta"] == 0

    def test_partial_coverage_two_hits(self, workflow, current_task):
        window = [
            _mk_turn(1, "check-in please", "Do you have a reservation?"),
            _mk_turn(2, "Yes, reservation under Jones.", "Good."),
            _mk_turn(3, "How's the weather today?", "Let's stay on topic."),
            _mk_turn(4, "Nice lobby here.", "Thank you."),
        ]
        result = workflow._rule_based_fallback(window, current_task)
        matched = {m.lower() for m in result["keyword_coverage_detail"]["matched"]}
        assert matched == {"check-in", "reservation"}
        assert result["keyword_coverage_detail"]["coverage_ratio"] == pytest.approx(0.5, abs=0.01)

    def test_empty_keywords_defaults_to_zero_coverage(self, workflow):
        task = {"id": 1, "keywords": [], "task_description": "t", "target_language": "English"}
        window = [_mk_turn(1, "hello", "hi")]
        result = workflow._rule_based_fallback(window, task)
        # With no keywords, coverage_ratio is conventionally 0; delta should be 0
        assert result["keyword_coverage_detail"]["coverage_ratio"] in (0.0, 0)
        assert result["delta"] == 0

    def test_fallback_returns_required_shape(self, workflow, window_diverse, current_task):
        result = workflow._rule_based_fallback(window_diverse, current_task)
        for key in ("delta", "teaching_mode", "scores", "improvement_tips", "keyword_coverage_detail"):
            assert key in result, f"missing key: {key}"
        assert result["teaching_mode"] in ("guide", "correct")
        # delta scale widened to 0-10 (aggressive): one strong window completes a task
        assert result["delta"] in range(11)


# =========================================================================
# 2. evaluate_window() — LLM exception path
# =========================================================================


class TestEvaluateWindowLLMExceptions:
    @pytest.mark.asyncio
    async def test_dashscope_raises_falls_back_to_rule_based(
        self, workflow, window_diverse, current_task
    ):
        """When qwen-turbo throws, fallback path computes result locally."""
        workflow._api_key = "fake-key-for-test"
        fallback_spy = MagicMock(wraps=workflow._rule_based_fallback)
        db = AsyncMock()

        with patch("workflows.batch_evaluation.Generation.call",
                   side_effect=RuntimeError("boom")), \
             patch.object(workflow, "_rule_based_fallback", fallback_spy), \
             patch.object(workflow, "_update_user_proficiency", new=AsyncMock(return_value={})):
            result = await workflow.evaluate_window(
                user_id="u1",
                goal_id=5,
                current_task=current_task,
                native_language="Chinese",
                turn_window=window_diverse,
                db_connection=db,
            )

        fallback_spy.assert_called_once()
        assert "delta" in result

    @pytest.mark.asyncio
    async def test_dashscope_timeout_falls_back(self, workflow, window_diverse, current_task):
        import socket
        workflow._api_key = "fake-key-for-test"
        with patch("workflows.batch_evaluation.Generation.call",
                   side_effect=socket.timeout("slow")), \
             patch.object(workflow, "_update_user_proficiency", new=AsyncMock(return_value={})):
            result = await workflow.evaluate_window(
                user_id="u1",
                goal_id=5,
                current_task=current_task,
                native_language="Chinese",
                turn_window=window_diverse,
                db_connection=AsyncMock(),
            )
        assert isinstance(result, dict)
        assert "delta" in result

    @pytest.mark.asyncio
    async def test_missing_api_key_falls_back(self, workflow, window_diverse, current_task):
        """DASHSCOPE_API_KEY not configured → fallback (no network call)."""
        workflow._api_key = None
        with patch.object(workflow, "_update_user_proficiency",
                          new=AsyncMock(return_value={})):
            result = await workflow.evaluate_window(
                user_id="u1", goal_id=5, current_task=current_task,
                native_language="Chinese", turn_window=window_diverse,
                db_connection=AsyncMock(),
            )
        assert isinstance(result, dict)
        assert "delta" in result


# =========================================================================
# 3. JSON parse tolerance: markdown-wrapped JSON
# =========================================================================


def _fake_dashscope_response(payload: str):
    """Mimic dashscope.Generation.call() return shape."""
    resp = MagicMock()
    resp.status_code = 200
    # dashscope returns output.choices[0].message.content OR output.text depending on ver
    resp.output = MagicMock()
    resp.output.text = payload
    choice = MagicMock()
    choice.message = MagicMock()
    choice.message.content = payload
    resp.output.choices = [choice]
    return resp


class TestJSONParseTolerance:
    @pytest.mark.asyncio
    async def test_markdown_wrapped_json_parses(self, workflow, window_diverse, current_task):
        body = {
            "delta": 1,
            "teaching_mode": "correct",
            "scores": {"keyword_coverage": 4.0, "grammar_quality": 7.0,
                       "topic_relevance": 6.0, "fluency": 6.0},
            "next_topic_hint": None,
            "correction_guidance": {
                "error_type": "keyword_coverage",
                "native_explanation": "你只用了 check-in",
                "correct_example": "Do you have any rooms available?",
                "retry_instruction": "Try again.",
            },
            "improvement_tips": ["使用 reservation 和 available"],
            "keyword_coverage_detail": {
                "matched": ["check-in"],
                "missed": ["room", "reservation", "available"],
                "coverage_ratio": 0.25,
            },
        }
        wrapped = f"```json\n{json.dumps(body, ensure_ascii=False)}\n```"

        workflow._api_key = "fake-key-for-test"
        with patch("workflows.batch_evaluation.Generation.call",
                   return_value=_fake_dashscope_response(wrapped)), \
             patch.object(workflow, "_update_user_proficiency",
                          new=AsyncMock(return_value={"task_completed": False})):
            result = await workflow.evaluate_window(
                user_id="u1",
                goal_id=5,
                current_task=current_task,
                native_language="Chinese",
                turn_window=window_diverse,
                db_connection=AsyncMock(),
            )

        assert result["delta"] == 1
        assert result["teaching_mode"] == "correct"
        assert result["keyword_coverage_detail"]["coverage_ratio"] == pytest.approx(0.25)

    @pytest.mark.asyncio
    async def test_plain_json_also_parses(self, workflow, window_diverse, current_task):
        body = {
            "delta": 2,
            "teaching_mode": "guide",
            "scores": {"keyword_coverage": 8.0, "grammar_quality": 7.0,
                       "topic_relevance": 8.0, "fluency": 7.0},
            "next_topic_hint": "Ask about breakfast included",
            "correction_guidance": None,
            "improvement_tips": ["Great job — try longer sentences"],
            "keyword_coverage_detail": {"matched": ["check-in", "room", "reservation"],
                                        "missed": ["available"], "coverage_ratio": 0.75},
        }
        workflow._api_key = "fake-key-for-test"
        with patch("workflows.batch_evaluation.Generation.call",
                   return_value=_fake_dashscope_response(json.dumps(body))), \
             patch.object(workflow, "_update_user_proficiency",
                          new=AsyncMock(return_value={})):
            result = await workflow.evaluate_window(
                user_id="u1", goal_id=5, current_task=current_task,
                native_language="Chinese", turn_window=window_diverse,
                db_connection=AsyncMock(),
            )
        assert result["delta"] == 2
        assert result["teaching_mode"] == "guide"

    @pytest.mark.asyncio
    async def test_malformed_json_falls_back(self, workflow, window_diverse, current_task):
        workflow._api_key = "fake-key-for-test"
        with patch("workflows.batch_evaluation.Generation.call",
                   return_value=_fake_dashscope_response("not-json-at-all {{{")), \
             patch.object(workflow, "_update_user_proficiency",
                          new=AsyncMock(return_value={})):
            result = await workflow.evaluate_window(
                user_id="u1", goal_id=5, current_task=current_task,
                native_language="Chinese", turn_window=window_diverse,
                db_connection=AsyncMock(),
            )
        # fallback path returned a dict with delta key
        assert "delta" in result
        assert "keyword_coverage_detail" in result


# =========================================================================
# 4. delta=0 → no DB update
# =========================================================================


class TestDBUpdateGate:
    @pytest.mark.asyncio
    async def test_delta_zero_skips_db_write(self, workflow, window_cheat, current_task):
        """Cheat window (4x same keyword) → delta=0 → _update_user_proficiency NOT called."""
        db = AsyncMock()
        update_spy = AsyncMock(return_value={})
        workflow._api_key = "fake-key-for-test"

        # Force fallback path (no LLM) by raising
        with patch("workflows.batch_evaluation.Generation.call",
                   side_effect=RuntimeError("skip-llm")), \
             patch.object(workflow, "_update_user_proficiency", new=update_spy):
            result = await workflow.evaluate_window(
                user_id="u1", goal_id=5, current_task=current_task,
                native_language="Chinese", turn_window=window_cheat,
                db_connection=db,
            )

        assert result["delta"] == 0
        update_spy.assert_not_called()

    @pytest.mark.asyncio
    async def test_delta_positive_triggers_db_write(
        self, workflow, window_diverse, current_task
    ):
        body = {
            "delta": 2,
            "teaching_mode": "guide",
            "scores": {"keyword_coverage": 9, "grammar_quality": 8,
                       "topic_relevance": 8, "fluency": 8},
            "next_topic_hint": "Ask about check-out time",
            "correction_guidance": None,
            "improvement_tips": ["Nice variety"],
            "keyword_coverage_detail": {"matched": ["check-in", "room", "reservation", "available"],
                                        "missed": [], "coverage_ratio": 1.0},
        }
        update_spy = AsyncMock(return_value={"task_completed": False, "total_proficiency": 7})
        workflow._api_key = "fake-key-for-test"

        with patch("workflows.batch_evaluation.Generation.call",
                   return_value=_fake_dashscope_response(json.dumps(body))), \
             patch.object(workflow, "_update_user_proficiency", new=update_spy):
            await workflow.evaluate_window(
                user_id="u1", goal_id=5, current_task=current_task,
                native_language="Chinese", turn_window=window_diverse,
                db_connection=AsyncMock(),
            )

        update_spy.assert_called_once()
