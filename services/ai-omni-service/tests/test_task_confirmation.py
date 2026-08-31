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
