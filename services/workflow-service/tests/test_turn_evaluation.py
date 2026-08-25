import os
import sys
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from workflows.turn_evaluation import QUALITY_DELTAS, TurnEvaluationWorkflow


class FakeRedis:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    def setex(self, key, ttl, value):
        self.values[key] = value

    def delete(self, key):
        self.values.pop(key, None)


class FakeDB:
    def __init__(self, score=0, interaction_count=0, status="pending"):
        self.task = {
            "score": score,
            "interaction_count": interaction_count,
            "status": status,
        }
        self.goal_delta = 0
        self.task_updates = 0

    @asynccontextmanager
    async def transaction(self):
        yield

    async def fetchrow(self, query, *args):
        return dict(self.task)

    async def execute(self, query, *args):
        if "UPDATE user_tasks" in query:
            score, count, completed = args[:3]
            self.task.update(
                score=score,
                interaction_count=count,
                status="completed" if completed else self.task["status"],
            )
            self.task_updates += 1
        elif "UPDATE user_goals" in query:
            self.goal_delta += args[0]


TASK = {
    "id": 42,
    "task_description": "Order coffee politely",
    "scenario_title": "Coffee Shop",
    "target_language": "English",
    "keywords": ["coffee", "please"],
}


async def evaluate(workflow, db, redis, quality, turn_id):
    with patch.object(
        workflow,
        "_evaluate_quality",
        new=AsyncMock(return_value={"quality": quality, "reason": f"{quality} reason"}),
    ):
        return await workflow.evaluate_turn(
            user_id="u1",
            goal_id=7,
            task_id=42,
            user_content="Coffee please",
            ai_response="Certainly.",
            current_task=TASK,
            native_language="Chinese",
            turn_id=turn_id,
            db_connection=db,
            redis_client=redis,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("quality,delta", QUALITY_DELTAS.items())
async def test_every_quality_uses_fixed_delta(quality, delta):
    result = await evaluate(TurnEvaluationWorkflow(), FakeDB(), FakeRedis(), quality, quality)
    assert result["quality"] == quality
    assert result["delta"] == delta
    assert result["score"] == delta
    assert result["interaction_count"] == 1


@pytest.mark.asyncio
async def test_three_satisfactory_turns_complete_task():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB()
    redis = FakeRedis()
    results = [
        await evaluate(workflow, db, redis, "satisfactory", f"turn-{index}")
        for index in range(1, 4)
    ]
    assert [result["score"] for result in results] == [3, 6, 9]
    assert results[-1]["interaction_count"] == 3
    assert results[-1]["task_completed"] is True


@pytest.mark.asyncio
async def test_low_quality_turn_cannot_complete_even_at_nine_points():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB(score=8, interaction_count=2)
    result = await evaluate(workflow, db, FakeRedis(), "needs_work", "bad-third")
    assert result["score"] == 9
    assert result["interaction_count"] == 3
    assert result["task_completed"] is False


@pytest.mark.asyncio
async def test_model_failure_uses_safe_fallback():
    workflow = TurnEvaluationWorkflow()
    with patch.object(
        workflow, "_evaluate_quality", new=AsyncMock(side_effect=TimeoutError("slow"))
    ):
        result = await workflow.evaluate_turn(
            user_id="u1",
            goal_id=7,
            task_id=42,
            user_content="Coffee please",
            ai_response="Certainly.",
            current_task=TASK,
            native_language="Chinese",
            turn_id="fallback-turn",
            db_connection=FakeDB(),
            redis_client=FakeRedis(),
        )
    assert result["fallback_used"] is True
    assert result["quality"] == "satisfactory"
    assert result["delta"] == 3


@pytest.mark.asyncio
async def test_duplicate_turn_id_returns_cached_result_without_second_write():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB()
    redis = FakeRedis()
    first = await evaluate(workflow, db, redis, "strong", "stable-turn")
    second = await evaluate(workflow, db, redis, "mastered", "stable-turn")
    assert second == first
    assert db.task_updates == 1
    assert db.task["score"] == 4
    assert db.task["interaction_count"] == 1
