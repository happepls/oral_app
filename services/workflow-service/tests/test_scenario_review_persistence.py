import json
import os
import sys
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from workflows.scenario_review import ScenarioReviewWorkflow


class FakeDB:
    def __init__(self, status="UPDATE 1", error=None):
        self.status = status
        self.error = error
        self.calls = []

    async def execute(self, query, *args):
        self.calls.append((query, args))
        if self.error:
            raise self.error
        return self.status


@pytest.mark.asyncio
async def test_review_persistence_requires_one_updated_goal():
    db = FakeDB()
    workflow = ScenarioReviewWorkflow()

    persisted = await workflow._save_review_to_db(
        user_id="user-1",
        goal_id=7,
        scenario_title="Cafe",
        review_report="Detailed review",
        recommendations=["Keep practising"],
        analysis={"overall_score": 82},
        db_connection=db,
    )

    assert persisted is True
    assert len(db.calls) == 1
    query, args = db.calls[0]
    assert "UPDATE user_goals SET scenario_review" in query
    payload = json.loads(args[0])
    assert payload["scenario_title"] == "Cafe"
    assert payload["analysis"]["overall_score"] == 82
    assert args[1] == 7


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "db",
    [FakeDB(status="UPDATE 0"), FakeDB(error=RuntimeError("database unavailable"))],
)
async def test_review_persistence_fails_closed(db):
    workflow = ScenarioReviewWorkflow()

    persisted = await workflow._save_review_to_db(
        user_id="user-1",
        goal_id=7,
        scenario_title="Cafe",
        review_report="Detailed review",
        recommendations=[],
        analysis={"overall_score": 82},
        db_connection=db,
    )

    assert persisted is False


@pytest.mark.asyncio
async def test_generation_does_not_report_success_when_persistence_fails(monkeypatch):
    workflow = ScenarioReviewWorkflow()
    monkeypatch.setattr(
        workflow,
        "_save_review_to_db",
        AsyncMock(return_value=False),
    )

    with pytest.raises(RuntimeError, match="Failed to persist scenario review"):
        await workflow.generate_scenario_review(
            user_id="user-1",
            goal_id=7,
            scenario_title="Cafe",
            completed_tasks=[],
            conversation_history=[{"role": "user", "content": "One turn"}],
            db_connection=FakeDB(),
            native_language="Chinese",
        )


@pytest.mark.asyncio
async def test_generation_confirms_persistence_in_result(monkeypatch):
    workflow = ScenarioReviewWorkflow()
    monkeypatch.setattr(
        workflow,
        "_save_review_to_db",
        AsyncMock(return_value=True),
    )

    result = await workflow.generate_scenario_review(
        user_id="user-1",
        goal_id=7,
        scenario_title="Cafe",
        completed_tasks=[],
        conversation_history=[{"role": "user", "content": "One turn"}],
        db_connection=FakeDB(),
        native_language="Chinese",
    )

    assert result["persisted"] is True
    assert result["sufficient"] is False
