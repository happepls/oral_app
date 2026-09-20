import importlib.util
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

spec = importlib.util.spec_from_file_location('product_analytics', Path(__file__).parents[1] / 'app/product_analytics.py')
analytics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analytics)


@pytest.mark.asyncio
async def test_welcome_stale_and_duplicate_responses_cannot_complete_a_new_turn():
    emit = AsyncMock()
    tracker = analytics.ConversationEvidence(emit)
    tracker.response_started('welcome')
    tracker.prepare('user-1', True)
    await tracker.accept('user-1', True)
    await tracker.finish('welcome')
    assert [call.args[0] for call in emit.call_args_list] == ['started']
    tracker.response_started('reply-1')
    await tracker.finish('reply-1')
    await tracker.finish('reply-1')
    await tracker.end()
    assert [call.args[0] for call in emit.call_args_list] == ['started', 'paired', 'ended']


@pytest.mark.asyncio
async def test_audio_commit_pairs_even_when_asr_arrives_after_ai_transcript():
    emit = AsyncMock()
    tracker = analytics.ConversationEvidence(emit)
    tracker.prepare('asr-item', True)
    tracker.response_started('reply')
    await tracker.finish('reply')
    emit.assert_not_called()
    await tracker.accept('asr-item', True)
    assert tracker.paired


@pytest.mark.parametrize('mode,phase,daily,expected', [
    ('tour', 'scene_theater', False, False), ('recall', 'scene_theater', False, False),
    ('daily_qa', 'scene_theater', False, False), (None, 'scene_theater', True, False),
    (None, 'magic_repetition', False, False), ('magic_repetition', 'magic_repetition', False, False),
    ('magic_repetition', 'scene_theater', False, True), (None, None, False, False),
    (None, 'scene_theater', False, True),
])
def test_only_server_real_phase_is_eligible(mode, phase, daily, expected):
    assert analytics.eligible(mode, phase, daily) is expected


@pytest.mark.asyncio
async def test_mixed_mode_and_unmatched_response_do_not_pair():
    emit = AsyncMock()
    tracker = analytics.ConversationEvidence(emit)
    tracker.prepare('magic-turn', False)
    tracker.response_started('magic-reply')
    await tracker.accept('magic-turn', False)
    await tracker.finish('magic-reply')
    emit.assert_not_called()


@pytest.mark.asyncio
async def test_durable_delivery_ack_only_on_204(monkeypatch):
    monkeypatch.setenv('PRODUCT_ANALYTICS_ENABLED', 'true')
    monkeypatch.setenv('ANALYTICS_WRITE_TOKEN', 'test-only-credential-with-32-characters')
    redis = AsyncMock()
    redis.zrangebyscore.return_value = ['key']
    redis.hget.return_value = '{"event":"paired"}'
    client = AsyncMock()
    client.post.return_value.status_code = 503
    await analytics.deliver_once(redis, client)
    redis.eval.assert_not_called()
    redis.zadd.assert_awaited()
    client.post.return_value.status_code = 204
    await analytics.deliver_once(redis, client)
    redis.eval.assert_awaited_once()


@pytest.mark.asyncio
async def test_queue_outage_retried_independently_with_original_timestamp(monkeypatch):
    monkeypatch.setenv('PRODUCT_ANALYTICS_ENABLED', 'true')
    analytics._local_pending.clear()
    redis = AsyncMock()
    redis.eval.side_effect = RuntimeError('offline')
    assert not await analytics.enqueue(redis, 'user', 'session', 'paired')
    key, payload = next(iter(analytics._local_pending.items()))
    redis.eval.side_effect = None
    assert await analytics.persist_pending(redis, key)
    assert payload['occurredAt'] in redis.eval.call_args.args[-2]
    assert not analytics._local_pending


@pytest.mark.asyncio
async def test_authoritative_end_after_reconnect_still_reaches_ledger():
    emit = AsyncMock()
    tracker = analytics.ConversationEvidence(emit)
    await tracker.end()
    emit.assert_awaited_once_with('ended')
