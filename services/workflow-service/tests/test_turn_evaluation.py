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

    def eval(self, script, numkeys, key, order, ttl, value):
        current = str(self.values.get(key) or "")
        current_order = int(current.split(":", 1)[0] or 0) if ":" in current else 0
        if current and current_order > int(order):
            return 0
        self.values[key] = value
        return 1


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
            score, count = args[:2]
            self.task.update(
                score=score,
                interaction_count=count,
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
            turn_order={
                "ready-turn": 10,
                "bad-turn": 20,
                "older-good": 10,
                "newer-bad": 20,
            }.get(turn_id, 1),
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
async def test_three_satisfactory_turns_make_task_ready_for_confirmation():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB()
    redis = FakeRedis()
    results = [
        await evaluate(workflow, db, redis, "satisfactory", f"turn-{index}")
        for index in range(1, 4)
    ]
    assert [result["score"] for result in results] == [3, 6, 9]
    assert results[-1]["interaction_count"] == 3
    assert results[-1]["task_ready_to_complete"] is True
    assert len(results[-1]["ready_token"]) >= 20
    assert results[-1]["task_completed"] is False
    assert db.task["status"] == "pending"


@pytest.mark.asyncio
async def test_later_low_quality_turn_revokes_ready_capability():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB(score=6, interaction_count=2)
    redis = FakeRedis()
    ready = await evaluate(workflow, db, redis, "satisfactory", "ready-turn")
    ready_key = workflow._ready_key("u1", 42)
    assert redis.values[ready_key].endswith(f":{ready['ready_token']}")

    revoked = await evaluate(workflow, db, redis, "off_topic", "bad-turn")
    assert revoked["task_ready_to_complete"] is False
    assert revoked["ready_token"] is None
    assert redis.values[ready_key] == "20:"

    replayed_old_ready = await evaluate(
        workflow, db, redis, "satisfactory", "ready-turn"
    )
    assert replayed_old_ready["task_ready_to_complete"] is False
    assert replayed_old_ready["ready_token"] is None


@pytest.mark.asyncio
async def test_older_good_result_cannot_restore_readiness_after_newer_bad_turn():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB(score=8, interaction_count=2)
    redis = FakeRedis()
    newer = await evaluate(workflow, db, redis, "off_topic", "newer-bad")
    older = await evaluate(workflow, db, redis, "satisfactory", "older-good")
    assert newer["task_ready_to_complete"] is False
    assert older["task_ready_to_complete"] is False
    assert redis.values[workflow._ready_key("u1", 42)] == "20:"


@pytest.mark.asyncio
async def test_low_quality_turn_cannot_complete_even_at_nine_points():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB(score=8, interaction_count=2)
    result = await evaluate(workflow, db, FakeRedis(), "needs_work", "bad-third")
    assert result["score"] == 9
    assert result["interaction_count"] == 3
    assert result["task_ready_to_complete"] is False
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
            turn_order=1,
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


@pytest.mark.asyncio
async def test_duplicate_ready_turn_returns_cached_result_without_completing_task():
    workflow = TurnEvaluationWorkflow()
    db = FakeDB(score=6, interaction_count=2)
    redis = FakeRedis()
    first = await evaluate(workflow, db, redis, "satisfactory", "stable-ready-turn")
    second = await evaluate(workflow, db, redis, "mastered", "stable-ready-turn")
    assert second == first
    assert first["task_ready_to_complete"] is True
    assert first["task_completed"] is False
    assert db.task_updates == 1
    assert db.task["score"] == 9
    assert db.task["interaction_count"] == 3
    assert db.task["status"] == "pending"
