import os
import sys
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from workflows.turn_evaluation import TurnEvaluationWorkflow


class FakeDB:
    def __init__(self, task=None):
        self.task = task or {"score": 6, "interaction_count": 8, "status": "pending"}
        self.execute = AsyncMock(side_effect=AssertionError("legacy endpoint must not write"))

    async def fetchrow(self, query, *args):
        return dict(self.task) if self.task else None


class ExplodingRedis:
    def __getattr__(self, name):
        raise AssertionError("legacy endpoint must not mutate readiness or cache")


async def evaluate(workflow, db):
    return await workflow.evaluate_turn(
        user_id="u1", goal_id=7, task_id=42,
        user_content="Coffee please", ai_response="Certainly.",
        current_task={"id": 42}, native_language="Chinese",
        turn_id="legacy-turn", turn_order=99, db_connection=db,
        redis_client=ExplodingRedis(),
    )


@pytest.mark.asyncio
async def test_legacy_turn_endpoint_is_deprecated_and_read_only():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB()
    with patch.object(
        workflow, "_evaluate_quality",
        new=AsyncMock(side_effect=AssertionError("legacy endpoint must not call Qwen")),
    ) as model:
        result = await evaluate(workflow, db)
    model.assert_not_awaited()
    db.execute.assert_not_awaited()
    assert result["evaluation_status"] == "deprecated"
    assert result["deprecated"] is True
    assert result["delta"] == 0
    assert result["score"] == 6
    assert result["interaction_count"] == 8
    assert result["task_ready_to_complete"] is False
    assert result["ready_token"] is None


@pytest.mark.asyncio
async def test_legacy_turn_endpoint_cannot_advance_almost_complete_task():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB({"score": 8, "interaction_count": 99, "status": "pending"})
    result = await evaluate(workflow, db)
    assert result["score"] == 8
    assert result["delta"] == 0
    assert result["task_ready_to_complete"] is False
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_legacy_turn_endpoint_reports_missing_task():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB()
    db.task = None
    with pytest.raises(ValueError, match="task not found"):
        await evaluate(workflow, db)
    db.execute.assert_not_awaited()
