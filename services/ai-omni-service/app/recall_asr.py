"""Bounded, in-memory transcription of a manually stopped Recall recording."""
import asyncio
import base64
import io
import wave

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

MAX_BYTES = 16000 * 2 * 120 + 44
LANGUAGES = {'zh', 'en', 'ja', 'ko', 'fr', 'es', 'de', 'pt', 'ru', 'it', 'ar'}


def validate_wav(audio):
    try:
        with wave.open(io.BytesIO(audio), 'rb') as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 16000, 'NONE'):
                raise ValueError()
            frames = wav.getnframes()
            if not 1600 <= frames <= 16000 * 120:
                raise ValueError()
            pcm = wav.readframes(frames)
            if len(pcm) != frames * 2:
                raise ValueError()
    except (wave.Error, EOFError, ValueError):
        raise HTTPException(400, 'invalid_recording') from None


async def transcribe(audio, language, config):
    # No target sentence/context, URLs, files, cache, or transcript logging.
    payload = {
        'model': 'qwen3-asr-flash',
        'input': {'messages': [{'role': 'user', 'content': [
            {'audio': 'data:audio/wav;base64,' + base64.b64encode(audio).decode('ascii')}
        ]}]},
        'parameters': {'asr_options': {'language': language, 'enable_itn': False}},
    }
    try:
        async with httpx.AsyncClient(timeout=40, follow_redirects=False) as client:
            response = await client.post(
                config.chat_base.rstrip('/') + '/api/v1/services/aigc/multimodal-generation/generation',
                headers={'Authorization': 'Bearer ' + config.chat_api_key}, json=payload,
            )
        if response.status_code != 200:
            raise HTTPException(503, 'transcription_unavailable')
        choice = response.json()['output']['choices'][0]
        if choice.get('finish_reason') != 'stop':
            raise HTTPException(502, 'incomplete_transcription')
        text = ''.join(part['text'] for part in choice['message']['content'] if 'text' in part).strip()
        if not text:
            raise HTTPException(422, 'no_speech')
        return text
    except HTTPException:
        raise
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        raise HTTPException(503, 'transcription_unavailable') from None


async def transcribe_until_disconnect(request, audio, language, config):
    async def disconnected():
        # The upload has been fully consumed. Await ASGI disconnect directly;
        # polling is_disconnected uses cancellation scopes around receive.
        while True:
            if (await request.receive())['type'] == 'http.disconnect':
                return
    provider = asyncio.create_task(transcribe(audio, language, config))
    watcher = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait({provider, watcher}, timeout=45, return_when=asyncio.FIRST_COMPLETED)
        if watcher in done:
            raise HTTPException(499, 'recording_cancelled')
        if provider not in done:
            raise HTTPException(504, 'transcription_timeout')
        return provider.result()
    finally:
        for task in (provider, watcher):
            if not task.done():
                task.cancel()
        await asyncio.gather(provider, watcher, return_exceptions=True)


def router(config, authorize):
    routes = APIRouter()
    capacity = None

    @routes.post('/recall-transcribe')
    async def recall_transcribe(request: Request, language: str = 'en'):
        nonlocal capacity
        await authorize(request, {}, 'generate')
        if language not in LANGUAGES:
            raise HTTPException(400, 'unsupported_language')
        if request.headers.get('content-type', '').split(';')[0].strip() != 'audio/wav':
            raise HTTPException(415, 'wav_required')
        if capacity is None:
            capacity = asyncio.Semaphore(4)
        if capacity.locked():
            raise HTTPException(503, 'transcription_busy')
        async with capacity:
            audio = bytearray()
            try:
                async def receive():
                    async for chunk in request.stream():
                        if len(audio) + len(chunk) > MAX_BYTES:
                            raise HTTPException(413, 'recording_too_large')
                        audio.extend(chunk)
                await asyncio.wait_for(receive(), 20)
                validate_wav(audio)
                text = await transcribe_until_disconnect(request, audio, language, config)
                return JSONResponse({'text': text}, headers={'Cache-Control': 'no-store'})
            except asyncio.TimeoutError:
                raise HTTPException(504, 'transcription_timeout') from None
            finally:
                audio.clear()

    return routes
