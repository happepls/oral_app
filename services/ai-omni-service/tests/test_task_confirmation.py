from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
import asyncio

import pytest

from ._omni_stubs import load_main


omni = load_main()


def earned_callback(score=9, generation=3, mode=None):
    task = {"id": 42, "goal_id": 7, "scenario_title": "Cafe", "task_description": "Old",
            "score": score, "interaction_count": 27, "scoring_generation": generation, "status": "pending"}
    return SimpleNamespace(
        user_id="u1", mode=mode, is_daily_qa_mode=False, phase_key="u1:Cafe", scenario="Cafe",
        user_context={"active_goal": {"id": 7, "current_task": task,
                      "scenarios": [{"title": "Cafe", "tasks": [dict(task)]}]}},
        messages=[{"role": "user", "content": "test only"}],
        _safe_send=AsyncMock(), _clear_dashscope_items=Mock(), _update_session_prompt=Mock(),
        analytics_real_mode=Mock(return_value=False), conversation=SimpleNamespace(send_raw=Mock()),
    )


def completion_response(next_task=True, generation=3):
    return SimpleNamespace(status_code=200, json=lambda: {"data": {
        "completed_task": {"id": 42, "goal_id": 7, "scenario_title": "Cafe", "task_description": "Old",
                           "status": "completed", "score": 9, "scoring_generation": generation},
        "next_task": ({"id": 43, "scenario_title": "Cafe", "text": "New", "score": 0,
                       "interaction_count": 0, "scoring_generation": 5, "status": "pending"} if next_task else None),
        "current_proficiency": 50,
    }})


@pytest.mark.asyncio
async def test_earned_score_completes_once_and_advances_nonzero_generation(monkeypatch):
    cb = earned_callback()
    current = cb.user_context["active_goal"]["current_task"]
    post = AsyncMock(return_value=completion_response())
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", post)
    assert await asyncio.gather(*[omni._complete_earned_scene_task(cb, current) for _ in range(2)]) == [True, True]
    post.assert_awaited_once()
    assert post.await_args.kwargs == {"scoring_generation": 3}
    assert cb._safe_send.await_count == 1
    event = cb._safe_send.await_args.args[0]
    assert event["type"] == "task_completed"
    assert event["payload"]["next_task"] == "New"
    assert event["payload"]["scoring_generation"] == 3
    assert cb.user_context["active_goal"]["scenarios"][0]["tasks"][0]["progress"] == 100
    assert cb.user_context["active_goal"]["current_task"]["scoring_generation"] == 5
    cb._update_session_prompt.assert_called_once()
    assert "New" in cb.conversation.send_raw.call_args.args[0]


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["recall", "daily_qa", "tour", "magic_repetition", "quick_experience"])
async def test_earned_completion_excludes_other_modes(monkeypatch, mode):
    cb = earned_callback(mode=mode)
    post = AsyncMock()
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", post)
    assert not await omni._complete_earned_scene_task(cb, cb.user_context["active_goal"]["current_task"])
    post.assert_not_awaited()


@pytest.mark.asyncio
async def test_score_below_threshold_does_not_complete(monkeypatch):
    cb = earned_callback(score=8)
    post = AsyncMock()
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", post)
    assert not await omni._complete_earned_scene_task(cb, cb.user_context["active_goal"]["current_task"])
    post.assert_not_awaited()


@pytest.mark.asyncio
async def test_failed_confirmation_retries_without_false_switch(monkeypatch):
    cb = earned_callback()
    current = cb.user_context["active_goal"]["current_task"]
    post = AsyncMock(side_effect=[SimpleNamespace(status_code=503), completion_response()])
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", post)
    assert not await omni._complete_earned_scene_task(cb, current)
    cb._safe_send.assert_not_awaited()
    assert cb.user_context["active_goal"]["current_task"]["id"] == 42
    assert await omni._complete_earned_scene_task(cb, current)
    assert post.await_count == 2


@pytest.mark.asyncio
async def test_reset_generation_mismatch_never_emits_completion(monkeypatch):
    cb = earned_callback()
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", AsyncMock(return_value=completion_response(generation=4)))
    assert not await omni._complete_earned_scene_task(cb, cb.user_context["active_goal"]["current_task"])
    cb._safe_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_reset_rejection_requests_reconnect_instead_of_retrying_stale_score_forever(monkeypatch):
    cb = earned_callback()
    post = AsyncMock(return_value=SimpleNamespace(status_code=409, json=lambda: {"code": "stale_generation"}))
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", post)
    await omni._evaluate_scene_turn_progress(cb, 7, 42, "old response")
    assert cb.scoring_reset_notified is True
    assert cb._safe_send.await_args.args[0]["type"] == "connection_closed"
    await omni._evaluate_scene_turn_progress(cb, 7, 42, "late response")
    post.assert_awaited_once()


@pytest.mark.asyncio
async def test_final_earned_task_emits_completion_and_generates_review(monkeypatch):
    context = earned_callback().user_context
    cb = omni.WebSocketCallback(AsyncMock(), asyncio.get_running_loop(), context,
                               "token", "u1", "final-test", scenario="Cafe")
    cb.conversation = Mock()
    cb._safe_send = AsyncMock()
    cb.analytics_real_mode = Mock(return_value=False)
    monkeypatch.setattr(omni, "session_phases", {cb.phase_key: {"phase": "scene_theater"}})
    monkeypatch.setattr(omni.prompt_manager, "generate_scene_theater_prompt", Mock(return_value="Practice"))
    monkeypatch.setattr(omni, "MultiModality", Mock(TEXT="text", AUDIO="audio"))
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", AsyncMock(return_value=completion_response(next_task=False)))
    review = AsyncMock()
    monkeypatch.setattr(omni, "_generate_and_emit_scenario_review", review)
    assert await omni._complete_earned_scene_task(cb, cb.user_context["active_goal"]["current_task"])
    assert cb._safe_send.await_args.args[0]["payload"]["next_task"] is None
    assert cb.user_context["active_goal"]["current_task"] is None
    review.assert_awaited_once()
    assert review.await_args.args[1:3] == (7, "Cafe")
    cb.conversation.update_session.assert_called_once()
    assert "the next task" not in cb.conversation.update_session.call_args.kwargs["instructions"]
    assert await omni._complete_earned_scene_task(cb, {"id": 42, "score": 9, "scoring_generation": 3})
    review.assert_awaited_once()


@pytest.mark.asyncio
async def test_reconnect_publishes_restored_state_before_automatic_switch(monkeypatch):
    context = earned_callback().user_context
    socket = SimpleNamespace(client_state=SimpleNamespace(name="CONNECTED"), send_json=AsyncMock())
    cb = omni.WebSocketCallback(socket, asyncio.get_running_loop(), context,
                               "token", "u1", "reconnect-test", scenario="Cafe")
    cb.conversation = Mock()
    cb.restored_state = {"task_id": 42, "score": 9, "scoring_generation": 3}
    cb.welcome_muted = True
    cb._safe_send = socket.send_json
    monkeypatch.setattr(omni, "session_phases", {cb.phase_key: {"phase": "scene_theater"}})
    monkeypatch.setattr(omni.prompt_manager, "generate_scene_theater_prompt", Mock(return_value="Practice"))
    monkeypatch.setattr(omni, "MultiModality", Mock(TEXT="text", AUDIO="audio"))
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", AsyncMock(return_value=completion_response()))
    futures = []
    original = asyncio.run_coroutine_threadsafe
    def schedule(coro, loop):
        future = original(coro, loop)
        futures.append(future)
        return future
    monkeypatch.setattr(omni.asyncio, "run_coroutine_threadsafe", schedule)
    cb.on_open()
    await asyncio.gather(*(asyncio.wrap_future(future) for future in futures))
    assert [call.args[0]["type"] for call in socket.send_json.await_args_list] == [
        "session_restored", "connection_established", "task_completed"]
    assert context["active_goal"]["current_task"]["scoring_generation"] == 5


@pytest.mark.asyncio
async def test_existing_99_recovers_without_another_scoring_window(monkeypatch):
    cb = earned_callback()
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", AsyncMock(return_value=completion_response()))
    scorer = AsyncMock()
    monkeypatch.setattr(omni, "_handle_turn_with_accumulator", scorer)
    await omni._evaluate_scene_turn_progress(cb, 7, 42, "next response")
    scorer.assert_not_awaited()
    assert cb.user_context["active_goal"]["current_task"]["id"] == 43


@pytest.mark.asyncio
async def test_threshold_result_does_not_wait_for_legacy_readiness_redis(monkeypatch):
    result = {"evaluation_status": "completed", "score": 9,
              "readiness_intent": {"ready": True}, "ready_token": None}
    post = AsyncMock(return_value=SimpleNamespace(status_code=200, json=lambda: {"data": result}))
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return SimpleNamespace(post=post)
        async def __aexit__(self, *args): pass
    monkeypatch.setattr(omni.httpx, "AsyncClient", Client)
    assert await omni._post_scoring_window({"evaluation_id": "threshold"}, "token") == result
    post.assert_awaited_once()


@pytest.mark.asyncio
async def test_three_turn_window_at_score_eight_completes_and_switches_on_needs_work(monkeypatch):
    from .test_scoring_windows import FakeRedis
    cb = earned_callback(score=8)
    cb.token = "token"
    cb.websocket = None
    cb.messages = []
    redis = FakeRedis()
    scorer = AsyncMock(return_value={"evaluation_status": "completed", "evidence_sufficient": True,
        "task_id": 42, "scoring_generation": 3, "score": 9, "delta": 1, "interaction_count": 30,
        "quality": "needs_work", "completed_window_count": 10, "completion_blocker": "quality",
        "task_completed": False, "task_ready_to_complete": False})
    monkeypatch.setattr(omni, "_get_redis_client", lambda: redis)
    monkeypatch.setattr(omni, "_post_scoring_window", scorer)
    complete = AsyncMock(return_value=completion_response())
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", complete)
    for i in range(3):
        cb.current_turn_id = f"earned-{i}"
        cb.messages.append({"role": "user", "turn_id": cb.current_turn_id, "content": "Test answer"})
        await omni._evaluate_scene_turn_progress(cb, 7, 42, "Test reply")
        if i < 2:
            scorer.assert_not_awaited()
            complete.assert_not_awaited()
    scorer.assert_awaited_once()
    complete.assert_awaited_once()
    assert [call.args[0]["type"] for call in cb._safe_send.await_args_list] == ["proficiency_update", "task_completed"]
    assert cb.user_context["active_goal"]["current_task"]["id"] == 43
    assert cb.user_context["active_goal"]["scenarios"][0]["tasks"][0]["progress"] == 100


@pytest.mark.asyncio
async def test_already_completed_scoring_replay_uses_internal_context_not_expired_user_jwt(monkeypatch):
    cb = earned_callback()
    expired = AsyncMock(return_value=None)
    monkeypatch.setattr(omni, "get_user_context", expired)
    post = AsyncMock(return_value=completion_response())
    monkeypatch.setattr(omni, "_post_internal_task_confirmation", post)
    result = await omni._emit_scoring_result(cb, cb.user_context["active_goal"]["current_task"], 42, [], {
        "evaluation_status": "already_completed", "task_completed": True, "score": 9,
        "scoring_generation": 3, "delta": 0, "interaction_count": 30,
    }, "expired-jwt")
    assert result["task_completed"] is True
    expired.assert_not_awaited()
    post.assert_awaited_once()
    assert cb._safe_send.await_args.args[0]["payload"]["next_task"] == "New"
    assert cb.user_context["active_goal"]["current_task"]["scoring_generation"] == 5


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
