import io
import os
import sys
import wave
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))
import recall_asr


def recording(seconds=1, rate=16000):
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
        wav.writeframes(b'\x01\x00' * int(rate * seconds))
    return output.getvalue()


def setup(monkeypatch, denial=None):
    authorize = AsyncMock(side_effect=denial)
    provider = AsyncMock(return_value='はい、はい。')
    monkeypatch.setattr(recall_asr, 'transcribe', provider)
    app = FastAPI()
    app.include_router(recall_asr.router(SimpleNamespace(), authorize))
    return TestClient(app), authorize, provider


def test_manual_recording_returns_final_verbatim_without_cache(monkeypatch):
    client, authorize, provider = setup(monkeypatch)
    response = client.post('/recall-transcribe?language=ja', content=recording(), headers={'Content-Type': 'audio/wav'})
    assert response.json() == {'text': 'はい、はい。'}
    assert response.headers['cache-control'] == 'no-store'
    assert authorize.await_args.args[1:] == ({}, 'generate')
    assert provider.await_args.args[1] == 'ja'


@pytest.mark.parametrize('status', [401, 403, 429, 503])
def test_denied_identity_never_calls_provider(monkeypatch, status):
    client, _, provider = setup(monkeypatch, HTTPException(status, 'denied'))
    assert client.post('/recall-transcribe', content=recording(), headers={'Content-Type': 'audio/wav'}).status_code == status
    provider.assert_not_awaited()


@pytest.mark.parametrize('audio,status', [(b'invalid', 400), (recording(.01), 400), (recording(rate=8000), 400), (b'x' * (recall_asr.MAX_BYTES + 1), 413)], ids=['invalid', 'short', 'sample-rate', 'oversize'])
def test_invalid_audio_never_calls_provider(monkeypatch, audio, status):
    client, _, provider = setup(monkeypatch)
    assert client.post('/recall-transcribe', content=audio, headers={'Content-Type': 'audio/wav'}).status_code == status
    provider.assert_not_awaited()


@pytest.mark.asyncio
async def test_provider_contract_no_target_prompt_or_string_deduplication(monkeypatch):
    import json
    def handle(request):
        body = json.loads(request.content)
        assert body['model'] == 'qwen3-asr-flash'
        assert body['parameters']['asr_options'] == {'language': 'ja', 'enable_itn': False}
        messages = body['input']['messages']
        assert len(messages) == 1 and messages[0]['role'] == 'user'
        assert list(messages[0]['content'][0]) == ['audio']
        assert messages[0]['content'][0]['audio'].startswith('data:audio/wav;base64,')
        return httpx.Response(200, json={'output': {'choices': [{'finish_reason': 'stop', 'message': {'content': [{'text': 'はい、はい。'}]}}]}})
    original = httpx.AsyncClient
    monkeypatch.setattr(recall_asr.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handle), **kw))
    assert await recall_asr.transcribe(recording(), 'ja', SimpleNamespace(chat_base='https://provider.test', chat_api_key='synthetic')) == 'はい、はい。'


@pytest.mark.asyncio
@pytest.mark.parametrize('status,body,expected', [(503, {}, 503), (200, {}, 503), (200, {'output': {'choices': [{'finish_reason': 'length'}]}}, 502), (200, {'output': {'choices': [{'finish_reason': 'stop', 'message': {'content': []}}]}}, 422)])
async def test_provider_failures_do_not_return_success(monkeypatch, status, body, expected):
    original = httpx.AsyncClient
    monkeypatch.setattr(recall_asr.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(lambda _: httpx.Response(status, json=body)), **kw))
    with pytest.raises(HTTPException) as error:
        await recall_asr.transcribe(recording(), 'ja', SimpleNamespace(chat_base='https://provider.test', chat_api_key='synthetic'))
    assert error.value.status_code == expected


@pytest.mark.asyncio
async def test_disconnect_cancels_and_awaits_provider(monkeypatch):
    import asyncio
    cancelled = asyncio.Event()
    async def pending(*args):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()
    monkeypatch.setattr(recall_asr, 'transcribe', pending)
    request = SimpleNamespace(receive=AsyncMock(return_value={'type': 'http.disconnect'}))
    with pytest.raises(HTTPException) as error:
        await recall_asr.transcribe_until_disconnect(request, recording(), 'ja', SimpleNamespace())
    assert error.value.status_code == 499
    assert cancelled.is_set()


@pytest.mark.asyncio
async def test_repeated_disconnects_release_endpoint_capacity(monkeypatch):
    import asyncio
    from starlette.requests import Request
    cancellations = []
    async def pending(*args):
        try:
            await asyncio.Event().wait()
        finally:
            cancellations.append(True)
    monkeypatch.setattr(recall_asr, 'transcribe', pending)
    endpoint = recall_asr.router(SimpleNamespace(), AsyncMock()).routes[0].endpoint
    for _ in range(5):
        messages = iter([{'type': 'http.request', 'body': recording(), 'more_body': False}, {'type': 'http.disconnect'}])
        async def receive():
            return next(messages)
        request = Request({'type': 'http', 'method': 'POST', 'path': '/recall-transcribe', 'headers': [(b'content-type', b'audio/wav')]}, receive)
        with pytest.raises(HTTPException) as error:
            await endpoint(request, 'ja')
        assert error.value.status_code == 499
    assert len(cancellations) == 5
