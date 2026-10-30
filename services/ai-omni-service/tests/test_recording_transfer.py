"""Exercise the real WS receive loop with synthetic audio, no provider calls."""
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from ._omni_stubs import load_main

main = load_main()
ACCESS = {'membership': {'status': 'active', 'active': True}, 'scenarios': []}


@pytest.fixture
def transfer(monkeypatch):
    for name in ['SCENE_AUDIO_EVIDENCE_ENABLED', 'SCENE_CURRENT_TURN_TEACHING_ENABLED', 'SCENE_EXPRESSION_FEEDBACK_ENABLED']:
        monkeypatch.setenv(name, 'false')
    context = {'id': 'recording-transfer-user', 'active_goal': {'id': 7, 'target_language': 'English',
        'current_task': {'id': 42, 'score': 0, 'interaction_count': 0, 'scoring_generation': 3}, 'scenarios': []}}
    monkeypatch.setattr(main, 'check_token_access', AsyncMock(return_value=ACCESS))
    authority = AsyncMock(return_value=ACCESS)
    monkeypatch.setattr(main, 'check_access', authority)
    monkeypatch.setattr(main, 'get_user_context', AsyncMock(return_value=context))
    monkeypatch.setattr(main, '_restore_progress_feedback', AsyncMock(return_value=None))
    monkeypatch.setattr(main, '_release_input_reservations', AsyncMock())
    reserve = AsyncMock(return_value=(False, {}))
    monkeypatch.setattr(main, '_reserve_daily_slot', reserve)
    values = {}
    async def set_value(key, value, nx=False, **kwargs):
        if nx and key in values: return False
        values[key] = value
        return True
    redis = Mock(get=AsyncMock(side_effect=lambda key: values.get(key)), set=AsyncMock(side_effect=set_value))
    monkeypatch.setattr(main, '_get_redis_client', lambda: redis)
    monkeypatch.setattr(main.WebSocketCallback, 'upload_audio_to_cos', AsyncMock(return_value=None))
    provider = Mock()
    def connect(**kwargs):
        kwargs['callback'].is_connected = True
        return provider
    monkeypatch.setattr(main, 'OmniRealtimeConversation', connect)
    original = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, 'AsyncClient', lambda *a, **kw: original(transport=httpx.MockTransport(lambda req: httpx.Response(404, json={}))))
    return authority, reserve, provider


def start(ws):
    ws.send_json({'type': 'user_audio_started', 'payload': {'input_id': 'recording-1',
        'scope': {'goal_id': 7, 'task_id': 42, 'scoring_generation': 3}}})


def end(ws, chunks=120):
    ws.send_json({'type': 'user_audio_ended', 'payload': {'input_id': 'recording-1', 'chunks': chunks}})


@pytest.mark.asyncio
async def test_realtime_keepalive_never_appends_audio_or_commits():
    provider = Mock()
    provider.ws.sock.connected = True
    await main._ping_realtime_transport(provider)
    provider.ws.sock.ping.assert_called_once_with()
    provider.append_audio.assert_not_called()
    provider.commit.assert_not_called()
    provider.ws.sock.connected = False
    await main._ping_realtime_transport(provider)
    provider.ws.sock.ping.assert_called_once_with()


def test_real_loop_checks_authority_twice_per_recording_and_deduplicates_reconnect(transfer):
    authority, reserve, provider = transfer
    for replay in (False, True):
        with TestClient(main.app).websocket_connect('/stream?token=test&sessionId=transfer1&scenario=scene') as ws:
            assert ws.receive_json()['type'] == 'phase_transition'
            start(ws)
            if not replay:
                # Heartbeats and silence do not submit or restart the recording.
                ws.send_json({'type': 'ping', 'payload': {}})
                assert ws.receive_json()['type'] == 'pong'
                provider.commit.assert_not_called()
                for sequence in range(120):
                    ws.send_json({'type': 'audio_stream', 'payload': {'input_id': 'recording-1', 'sequence': sequence, 'audio': 'AAAAAA=='}})
                end(ws)
            assert ws.receive_json() == {'type': 'user_audio_received', 'payload': {'input_id': 'recording-1'}}
    assert provider.commit.call_count == 1
    assert provider.create_response.call_count == 1
    assert provider.append_audio.call_count == 120
    assert reserve.await_count == 2  # First fragment + commit renewal, not 120 fragments.
    assert authority.await_count == 5  # Initial + start + commit; reconnect initial + start.


def test_revocation_while_microphone_open_blocks_submission(transfer):
    authority, _, provider = transfer
    with TestClient(main.app).websocket_connect('/stream?token=test&sessionId=transfer2&scenario=scene') as ws:
        assert ws.receive_json()['type'] == 'phase_transition'
        start(ws)
        ws.send_json({'type': 'ping', 'payload': {}})
        assert ws.receive_json()['type'] == 'pong'
        authority.side_effect = HTTPException(403, 'scene_locked')
        ws.send_json({'type': 'audio_stream', 'payload': {'input_id': 'recording-1', 'sequence': 0, 'audio': 'AAAAAA=='}})
        end(ws, 1)
        assert ws.receive_json()['payload']['code'] == 'scene_locked'
        assert ws.receive()['code'] == 1008
    provider.commit.assert_not_called()
    provider.create_response.assert_not_called()


def test_generation_change_during_recording_rejects_late_audio(transfer):
    _, _, provider = transfer
    with TestClient(main.app).websocket_connect('/stream?token=test&sessionId=transfer3&scenario=scene') as ws:
        assert ws.receive_json()['type'] == 'phase_transition'
        start(ws)
        ws.send_json({'type': 'ping', 'payload': {}})
        assert ws.receive_json()['type'] == 'pong'
        main.get_user_context.return_value['active_goal']['current_task']['scoring_generation'] = 4
        end(ws, 0)
        assert ws.receive_json()['payload']['code'] == 'stale_input'
        assert ws.receive()['code'] == 1008
    provider.commit.assert_not_called()


def test_uncertain_provider_commit_is_visible_and_never_replayed(transfer):
    _, _, provider = transfer
    provider.commit.side_effect = RuntimeError('synthetic commit failure')
    with TestClient(main.app).websocket_connect('/stream?token=test&sessionId=transfer4&scenario=scene') as ws:
        assert ws.receive_json()['type'] == 'phase_transition'
        start(ws)
        ws.send_json({'type': 'audio_stream', 'payload': {'input_id': 'recording-1', 'sequence': 0, 'audio': 'AAAAAA=='}})
        end(ws, 1)
        assert ws.receive_json()['payload']['code'] == 'input_submission_pending'
        assert ws.receive()['code'] == 1011
    with TestClient(main.app).websocket_connect('/stream?token=test&sessionId=transfer4&scenario=scene') as ws:
        assert ws.receive_json()['type'] == 'phase_transition'
        start(ws)
        assert ws.receive_json()['payload']['code'] == 'input_submission_pending'
    assert provider.commit.call_count == 1
    provider.create_response.assert_not_called()


def test_failed_pcm_append_closes_retryably_without_committing_partial_audio(transfer):
    _, _, provider = transfer
    provider.append_audio.side_effect = RuntimeError('synthetic upload failure')
    with TestClient(main.app).websocket_connect('/stream?token=test&sessionId=transfer5&scenario=scene') as ws:
        assert ws.receive_json()['type'] == 'phase_transition'
        start(ws)
        ws.send_json({'type': 'audio_stream', 'payload': {'input_id': 'recording-1', 'sequence': 0, 'audio': 'AAAAAA=='}})
        assert ws.receive_json()['payload']['code'] == 'audio_upload_interrupted'
        assert ws.receive()['code'] == 1011
    provider.commit.assert_not_called()
    provider.create_response.assert_not_called()
