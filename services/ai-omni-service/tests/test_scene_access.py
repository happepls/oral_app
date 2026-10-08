import asyncio
import os
import sys
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
import _omni_stubs

main = _omni_stubs.load_main()
import scene_access

USER = '00000000-0000-4000-8000-000000000001'
ACCESS = {'membership': {'active': True, 'status': 'active', 'source': 'prepaid'}, 'unlocked_count': 4, 'scenarios': []}


@pytest.mark.parametrize('path,payload', [
    ('/generate-scene-image', {'scenario_title': 'fourth'}),
    ('/generate-scenario-image', {'scenario_title': 'fourth', 'goal_id': 7}),
    ('/generate-scenarios', {}), ('/tts', {'text': 'hello'}), ('/translate', {'text': 'hello'}),
])
def test_direct_http_requires_identity_before_paid_calls(monkeypatch, path, payload):
    paid = AsyncMock()
    monkeypatch.setattr(main, '_try_wanx_image', paid)
    response = TestClient(main.app).post(path, json=payload)
    assert response.status_code == 401
    paid.assert_not_called()


def test_http_body_survives_authorization_middleware(monkeypatch):
    access = AsyncMock(return_value=ACCESS)
    paid = AsyncMock(return_value='https://example.com/image.png')
    monkeypatch.setattr(main, 'check_request_access', access)
    monkeypatch.setattr(main, '_try_wanx_image', paid)
    response = TestClient(main.app).post('/generate-scene-image', json={'scenario_title': 'owned-scene'})
    assert response.status_code == 200
    assert access.await_args.args[1] == {'scenario_title': 'owned-scene'}
    assert paid.await_args.args[0] == 'owned-scene'


@pytest.mark.parametrize('status,reason', [(403, 'scene_locked'), (503, 'authorization_unavailable')])
def test_direct_websocket_denied_before_context_or_provider(monkeypatch, status, reason):
    monkeypatch.setattr(main, 'check_token_access', AsyncMock(side_effect=HTTPException(status, reason)))
    context, paid = AsyncMock(), Mock()
    monkeypatch.setattr(main, 'get_user_context', context)
    monkeypatch.setattr(main, 'OmniRealtimeConversation', paid)
    with TestClient(main.app).websocket_connect('/stream?token=test&sessionId=session1&scenario=fourth') as ws:
        assert ws.receive_json()['payload']['status'] == status
        assert ws.receive()['code'] == (1011 if status == 503 else 1008)
    context.assert_not_called()
    paid.assert_not_called()


def test_member_expiry_in_open_websocket_blocks_next_audio_before_append(monkeypatch):
    monkeypatch.setattr(main, 'check_token_access', AsyncMock(return_value=ACCESS))
    monkeypatch.setattr(main, 'check_access', AsyncMock(side_effect=[ACCESS, HTTPException(403, 'scene_locked')]))
    monkeypatch.setattr(main, 'get_user_context', AsyncMock(return_value={
        'id': USER, 'native_language': 'Chinese', 'active_goal': {'id': 7, 'target_language': 'English',
        'scenarios': [{'title': 'fourth', 'tasks': [{'id': 4, 'text': 'task', 'score': 3, 'interaction_count': 4, 'scoring_generation': 3, 'status': 'pending'}]}],
        'current_task': {'id': 4, 'task_description': 'task', 'score': 3, 'interaction_count': 4, 'scoring_generation': 3}},
    }))
    monkeypatch.setattr(main, '_get_redis_client', lambda: None)
    conversation = Mock()
    monkeypatch.setattr(main, 'OmniRealtimeConversation', Mock(return_value=conversation))
    # No external history/analytics calls during this synthetic session.
    response = httpx.Response(404, json={})
    original = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, 'AsyncClient', lambda *a, **kw: original(transport=httpx.MockTransport(lambda req: response)))
    with TestClient(main.app).websocket_connect('/stream?token=test&sessionId=expiry1&scenario=fourth') as ws:
        assert ws.receive_json()['type'] == 'phase_transition'
        ws.send_json({'type': 'audio_stream', 'payload': {'audio': 'AAAA'}})
        assert ws.receive_json()['payload']['status'] == 403
        assert ws.receive()['code'] == 1008
    conversation.append_audio.assert_not_called()
    conversation.create_response.assert_not_called()


def test_committed_audio_blocks_second_input_before_delayed_asr(monkeypatch):
    monkeypatch.setenv('SCENE_AUDIO_EVIDENCE_ENABLED', 'false')
    monkeypatch.setenv('SCENE_CURRENT_TURN_TEACHING_ENABLED', 'false')
    monkeypatch.setenv('SCENE_EXPRESSION_FEEDBACK_ENABLED', 'false')
    monkeypatch.setattr(main, 'check_token_access', AsyncMock(return_value=ACCESS))
    checks = AsyncMock(return_value=ACCESS)
    monkeypatch.setattr(main, 'check_access', checks)
    monkeypatch.setattr(main, 'get_user_context', AsyncMock(return_value={
        'id': USER, 'active_goal': {'id': 7, 'target_language': 'English', 'scenarios': [], 'current_task': {}},
    }))
    reserve = AsyncMock(return_value=(False, {'limit': 15, 'used': 14, 'pending': 0}))
    monkeypatch.setattr(main, '_reserve_daily_slot', reserve)
    monkeypatch.setattr(main, '_get_redis_client', lambda: None)
    monkeypatch.setattr(main.WebSocketCallback, 'upload_audio_to_cos', AsyncMock(return_value=None))
    conversation = Mock()
    def provider(**kwargs):
        kwargs['callback'].is_connected = True
        return conversation
    monkeypatch.setattr(main, 'OmniRealtimeConversation', provider)
    original = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, 'AsyncClient', lambda *a, **kw: original(transport=httpx.MockTransport(lambda req: httpx.Response(404, json={}))))
    with TestClient(main.app).websocket_connect('/stream?token=test&sessionId=audioflight&scenario=fourth') as ws:
        assert ws.receive_json()['type'] == 'phase_transition'
        ws.send_json({'type': 'audio_stream', 'payload': {'audio': 'AAAA'}})
        ws.send_json({'type': 'user_audio_ended', 'payload': {}})
        # No ASR event yet: the first committed audio still owns the one slot.
        ws.send_json({'type': 'audio_stream', 'payload': {'audio': 'AAAA'}})
        assert ws.receive_json()['payload']['code'] == 'turn_in_progress'
        ws.send_json({'type': 'user_audio_ended', 'payload': {}})
        assert ws.receive_json()['payload']['code'] == 'turn_in_progress'
    assert conversation.append_audio.call_count == 1
    assert conversation.commit.call_count == 1
    assert conversation.create_response.call_count == 1
    assert reserve.await_count == 2
    assert reserve.await_args_list[0].args[3] == reserve.await_args_list[1].args[3]
    assert all(call.args[3] == 7 for call in checks.await_args_list)


@pytest.mark.parametrize('input_kind', ['text', 'audio'])
def test_interrupted_paid_submission_keeps_quota_charge(monkeypatch, input_kind):
    for flag in ['SCENE_AUDIO_EVIDENCE_ENABLED', 'SCENE_CURRENT_TURN_TEACHING_ENABLED', 'SCENE_EXPRESSION_FEEDBACK_ENABLED']:
        monkeypatch.setenv(flag, 'false')
    monkeypatch.setattr(main, 'check_token_access', AsyncMock(return_value=ACCESS))
    monkeypatch.setattr(main, 'check_access', AsyncMock(return_value=ACCESS))
    monkeypatch.setattr(main, 'get_user_context', AsyncMock(return_value={
        'id': USER, 'active_goal': {'id': 7, 'target_language': 'English', 'scenarios': [], 'current_task': {}},
    }))
    redis = Mock(zrem=AsyncMock())
    monkeypatch.setattr(main, '_get_redis_client', lambda: redis)
    charged = []
    async def reserve(*args):
        return bool(charged), {'status': 429, 'limit': 15, 'used': 15 if charged else 14, 'pending': 0}
    async def settle(rc, user, turn_id, reservation):
        charged.append((turn_id, reservation))
        return 15
    monkeypatch.setattr(main, '_reserve_daily_slot', reserve)
    monkeypatch.setattr(main, '_finish_reserved_turn', settle)
    monkeypatch.setattr(main.WebSocketCallback, 'upload_audio_to_cos', AsyncMock(return_value=None))
    conversation = Mock()
    def provider(**kwargs):
        kwargs['callback'].is_connected = True
        return conversation
    monkeypatch.setattr(main, 'OmniRealtimeConversation', provider)
    original = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, 'AsyncClient', lambda *a, **kw: original(transport=httpx.MockTransport(lambda req: httpx.Response(404, json={}))))
    with TestClient(main.app).websocket_connect(f'/stream?token=test&sessionId=interrupt-{input_kind}&scenario=fourth') as ws:
        assert ws.receive_json()['type'] == 'phase_transition'
        if input_kind == 'text':
            ws.send_json({'type': 'text_message', 'payload': {'text': 'My paid answer'}})
        else:
            ws.send_json({'type': 'audio_stream', 'payload': {'audio': 'AAAA'}})
            ws.send_json({'type': 'user_audio_ended', 'payload': {}})
        # A forged audio-cancel cannot refund an already admitted text either.
        ws.send_json({'type': 'user_audio_cancelled', 'payload': {}})
        assert ws.receive_json()['payload']['code'] == 'turn_in_progress'
        ws.send_json({'type': 'interrupt', 'payload': {}})
        ws.send_json({'type': 'text_message', 'payload': {'text': 'Repeated answer'}})
        assert ws.receive_json()['type'] == 'daily_limit_reached'
    assert len(charged) == 1
    assert charged[0][0] == charged[0][1]
    assert conversation.create_response.call_count == 1


@pytest.mark.asyncio
async def test_authority_fault_is_503_and_cookie_identity_is_forwarded(monkeypatch):
    original = httpx.AsyncClient
    received = []
    def handler(request):
        received.append(request)
        return httpx.Response(503, json={'reason': 'authorization_unavailable'})
    monkeypatch.setattr(scene_access.httpx, 'AsyncClient', lambda *a, **kw: original(transport=httpx.MockTransport(handler)))
    request = Mock(headers={}, cookies={'accessToken': 'synthetic-cookie'})
    with pytest.raises(HTTPException) as error:
        await scene_access.check_request_access(request, {'user_id': 'attacker', 'scenario': 'fourth'}, 'practice')
    assert error.value.status_code == 503
    assert received[0].headers['cookie'] == 'accessToken=synthetic-cookie'
    assert b'attacker' not in received[0].content


@pytest.mark.asyncio
async def test_atomic_concurrent_reservations_and_idempotent_settlement():
    url = os.getenv('SCENE_ACCESS_TEST_REDIS_URL')
    if not url:
        pytest.skip('SCENE_ACCESS_TEST_REDIS_URL required for actual Redis Lua')
    import redis.asyncio as redis
    from uuid import uuid4
    client = redis.from_url(url, decode_responses=True)
    user = str(uuid4())
    counter = main._daily_turn_key(user)
    try:
        await client.set(counter, main.FREE_DAILY_TURNS - 1)
        results = await asyncio.gather(*(main._reserve_daily_slot(client, user, {}, str(i)) for i in range(10)))
        winners = [i for i, (blocked, _) in enumerate(results) if not blocked]
        assert len(winners) == 1
        winner = str(winners[0])
        count = await main._finish_reserved_turn(client, user, 'stable-turn', winner)
        assert count == main.FREE_DAILY_TURNS
        assert await main._finish_reserved_turn(client, user, 'stable-turn', winner) == count
        assert await client.zcard(f'{counter}:pending') == 0
        assert (await main._reserve_daily_slot(client, user, {}, 'late'))[0] is True
        # Expiry/downgrade uses the refreshed authority rather than Stripe fields.
        assert main._daily_turn_limit({'stripe_subscription_status': 'active', 'access': {'membership': {'active': False}}}) == main.FREE_DAILY_TURNS
    finally:
        import hashlib
        marker = hashlib.sha256(f'{user}\0stable-turn'.encode()).hexdigest()
        await client.delete(counter, f'{counter}:pending', f'daily_turn_seen:v1:{marker}')
        await client.aclose()


@pytest.mark.asyncio
async def test_quota_dependency_failure_fails_closed():
    with pytest.raises(HTTPException) as error:
        await main._reserve_daily_slot(None, USER, {}, 'reservation')
    assert error.value.status_code == 503
