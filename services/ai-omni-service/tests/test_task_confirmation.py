from types import SimpleNamespace

import pytest

from ._omni_stubs import load_main


omni = load_main()


@pytest.mark.asyncio
async def test_confirmation_uses_internal_auth_not_expiring_user_jwt(monkeypatch):
    captured = {}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, **kwargs):
            captured.update(url=url, **kwargs)
            return SimpleNamespace(status_code=200)

    monkeypatch.setenv("INTERNAL_AUTH_SECRET", "service-secret")
    monkeypatch.setattr(omni.httpx, "AsyncClient", FakeClient)

    response = await omni._post_internal_task_confirmation(
        "http://user-service:3000",
        "user/id",
        42,
        "scene",
        "ready-token",
    )

    assert response.status_code == 200
    assert captured["url"].endswith(
        "/api/users/internal/users/user%2Fid/tasks/42/confirm-complete"
    )
    assert captured["headers"] == {"X-Guaji-Internal-Auth": "service-secret"}
    assert "Authorization" not in captured["headers"]
    assert captured["json"] == {"mode": "scene", "ready_token": "ready-token"}


@pytest.mark.asyncio
async def test_confirmation_fails_closed_without_internal_secret(monkeypatch):
    monkeypatch.delenv("INTERNAL_AUTH_SECRET", raising=False)

    with pytest.raises(RuntimeError, match="INTERNAL_AUTH_SECRET"):
        await omni._post_internal_task_confirmation(
            "http://user-service:3000", "u1", 42, None, "ready-token"
        )


def test_confirmed_switch_updates_authoritative_active_goal_task():
    context = {
        "active_goal": {
            "current_task": {"id": 42, "task_description": "Old"},
            "scenarios": [{
                "title": "Cafe",
                "tasks": [
                    {"id": 42, "text": "Old", "status": "pending", "progress": 99},
                    {"id": 43, "text": "New", "status": "pending", "progress": 0},
                ],
            }],
        },
    }
    completed = {"id": 42, "score": 9, "status": "completed"}
    next_task = {
        "id": 43,
        "text": "New",
        "scenario_title": "Cafe",
        "score": 0,
        "status": "pending",
    }

    omni._apply_confirmed_task_context(context, completed, next_task, 50)

    active_goal = context["active_goal"]
    assert active_goal["current_proficiency"] == 50
    assert active_goal["current_task"] == {
        "id": 43,
        "task_description": "New",
        "scenario_title": "Cafe",
        "score": 0,
        "interaction_count": 0,
        "scoring_generation": 0,
        "status": "pending",
    }
    assert context["current_task"] == next_task
    assert context["next_task_text"] == "New"
    assert active_goal["scenarios"][0]["tasks"][0]["status"] == "completed"
    assert active_goal["scenarios"][0]["tasks"][0]["progress"] == 100


def test_cross_scenario_fallback_is_not_treated_as_a_subtask_switch():
    completed = {"id": 42, "scenario_title": "Cafe"}
    same_scenario = {"id": 43, "scenario_title": "Cafe"}
    next_scenario = {"id": 44, "scenario_title": "Hotel"}

    assert omni._next_task_in_confirmed_scenario(completed, same_scenario) == same_scenario
    assert omni._next_task_in_confirmed_scenario(completed, next_scenario) is None
    assert omni._next_task_in_confirmed_scenario(completed, None) is None


@pytest.mark.asyncio
async def test_final_task_generates_persists_and_emits_review_without_user_jwt(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {
                "success": True,
                "data": {
                    "review_report": "Detailed review",
                    "recommendations": ["Keep practising"],
                    "analysis": {"overall_score": 82, "stars": 4},
                    "persisted": True,
                },
            }

    class FakeClient:
        def __init__(self, **kwargs):
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, **kwargs):
            captured.update(url=url, **kwargs)
            return FakeResponse()

    class FakeCallback:
        user_id = "user-1"
        user_context = {}

        def __init__(self):
            self.sent = []

        async def _safe_send(self, message):
            self.sent.append(message)

    history = [
        {"role": "user", "content": "One"},
        {"role": "assistant", "content": "A"},
        {"role": "user", "content": "Two"},
        {"role": "assistant", "content": "B"},
        {"role": "user", "content": "Three"},
        {"role": "assistant", "content": "C"},
    ]
    callback = FakeCallback()
    monkeypatch.setattr(omni.httpx, "AsyncClient", FakeClient)

    result = await omni._generate_and_emit_scenario_review(
        callback, 7, "Cafe", history
    )

    assert captured["url"].endswith("/api/workflows/scenario-review/generate")
    assert "headers" not in captured
    assert captured["json"]["user_id"] == "user-1"
    assert captured["json"]["goal_id"] == 7
    assert captured["json"]["conversation_history"] == history
    assert captured["client_kwargs"]["timeout"] == 60.0
    assert result["analysis"]["overall_score"] == 82
    assert callback.user_context["scenario_review"] == result
    assert callback.sent == [{"type": "scenario_review", "payload": result}]


@pytest.mark.asyncio
async def test_matching_persisted_review_is_reused_without_regeneration(monkeypatch):
    review = {
        "scenario_title": "Cafe",
        "review_report": "Existing",
        "recommendations": [],
        "analysis": {"overall_score": 80},
    }

    class FakeCallback:
        user_id = "user-1"
        user_context = {"scenario_review": review}

        def __init__(self):
            self.sent = []

        async def _safe_send(self, message):
            self.sent.append(message)

    class UnexpectedClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("persisted review should avoid another workflow call")

    callback = FakeCallback()
    monkeypatch.setattr(omni.httpx, "AsyncClient", UnexpectedClient)

    result = await omni._generate_and_emit_scenario_review(
        callback, 7, "Cafe", [{"role": "user", "content": "ignored"}]
    )

    assert result == review
    assert callback.sent == [{"type": "scenario_review", "payload": review}]
