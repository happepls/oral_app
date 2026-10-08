import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from .test_expression_feedback import callback, omni
import audio_evidence as evidence


def test_uncertain_number_cannot_be_declared_clear():
    for text in ('人数は十五か五十でした。', 'The group had 15 or 50 people.', '人数是１５还是５０。'):
        result = evidence.validate({'status': 'clear', 'heard_text': text, 'uncertain_spans': []})
        assert result['status'] == 'uncertain'
        assert result['heard_text'] == text
        assert result['uncertain_spans']


def test_clear_evidence_preserves_actual_errors_and_does_not_guess_missing_units():
    for text in ('私は五人のチームを管理するました。', '予算は五百でした。', 'I want eat steak.'):
        assert evidence.validate({'status': 'clear', 'heard_text': text, 'uncertain_spans': []})['heard_text'] == text


@pytest.mark.parametrize('value', [
    {}, {'status': 'clear', 'heard_text': '', 'uncertain_spans': []},
    {'status': 'clear', 'heard_text': 'text', 'uncertain_spans': ['name']},
    {'status': 'uncertain', 'heard_text': 'text', 'uncertain_spans': []},
    {'status': 'clear', 'heard_text': 'text', 'uncertain_spans': [], 'score': 3},
])
def test_rejects_inconsistent_evidence(value):
    with pytest.raises(ValueError):
        evidence.validate(value)


@pytest.mark.asyncio
async def test_transport_sends_only_original_pcm_not_tutor_or_asr(monkeypatch):
    result = {'status': 'clear', 'heard_text': '予約システム', 'uncertain_spans': []}
    events = iter([{'type': 'session.updated'}, {'type': 'response.text.done', 'text': json.dumps(result)},
                   {'type': 'response.done', 'response': {'status': 'completed'}}])
    sent = []
    class Socket:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def send(self, value): sent.append(json.loads(value))
        def __aiter__(self): return self
        async def __anext__(self):
            try: return json.dumps(next(events))
            except StopIteration: raise StopAsyncIteration
    monkeypatch.setattr(evidence, 'connect', lambda *args, **kwargs: Socket())
    assert await evidence.hear(b'\x00\x01' * 1600, SimpleNamespace(ws_url='wss://test', ws_api_key='test')) == result
    assert [e['type'] for e in sent] == ['session.update', 'input_audio_buffer.append', 'input_audio_buffer.commit', 'response.create']
    assert sent[0]['session']['modalities'] == ['text']
    assert not any('transcript' in e or 'ai_response' in e for e in sent)


@pytest.mark.asyncio
async def test_timeout_closes_socket(monkeypatch):
    closed = []
    class Socket:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): closed.append(True)
        send = AsyncMock()
        def __aiter__(self): return self
        async def __anext__(self): await asyncio.sleep(10)
    monkeypatch.setattr(evidence, 'connect', lambda *args, **kwargs: Socket())
    monkeypatch.setattr(evidence, 'TIMEOUT', 0.01)
    with pytest.raises(asyncio.TimeoutError):
        await evidence.hear(b'\x00\x01' * 1600, SimpleNamespace(ws_url='wss://test', ws_api_key='test'))
    assert closed


def owner():
    cb = callback()
    cb.audio_evidence.save_message = AsyncMock()
    cb._update_session_prompt()
    return cb


def test_acoustic_scores_and_history_use_only_verified_student_evidence():
    clear = {'status': 'clear', 'heard_text': '予約システムです。', 'uncertain_spans': [],
             'speech_scores': {'pronunciation': 85, 'fluency': 80, 'intonation': 75}}
    assert evidence.validate(clear) == clear
    for invalid in (True, '85', -1, 101, None):
        with pytest.raises(ValueError):
            evidence.validate({**clear, 'speech_scores': {**clear['speech_scores'], 'fluency': invalid}})
    history = [
        {'role': 'user', 'content': 'wrong ASR', 'input_source': 'audio', 'audio_evidence': clear},
        {'role': 'user', 'content': 'uncertain ASR', 'input_source': 'audio', 'audio_evidence': {'status': 'uncertain'}},
        {'role': 'assistant', 'content': 'Tutor example'},
    ]
    projected = evidence.assessment_history(history)
    assert [m['content'] for m in projected] == ['予約システムです。', 'Tutor example']
    assert history[0]['content'] == 'wrong ASR'


@pytest.mark.asyncio
async def test_slow_history_write_does_not_block_evidence_or_reply(monkeypatch):
    cb = owner()
    gate = asyncio.Event()
    cb.audio_evidence.save_message = AsyncMock(side_effect=lambda *args, **kwargs: None)
    async def slow_save(*args, **kwargs):
        await gate.wait()
    cb.audio_evidence.save_message.side_effect = slow_save
    pending, _ = await asyncio.wait_for(record(cb, monkeypatch, {
        'status': 'clear', 'heard_text': '予約システムです。', 'uncertain_spans': []}), 0.2)
    await asyncio.wait_for(cb.audio_evidence.reply(pending), 0.2)
    cb.conversation.create_response.assert_called_once()
    gate.set()
    await asyncio.gather(*list(cb.expression_jobs))


@pytest.mark.asyncio
async def test_failed_response_creation_invalidates_pairing_and_reconnects(monkeypatch):
    cb = owner()
    pending, _ = await record(cb, monkeypatch, {
        'status': 'clear', 'heard_text': '予約システムです。', 'uncertain_spans': []})
    cb.conversation.create_response.side_effect = RuntimeError('transport failed')
    await cb.audio_evidence.reply(pending)
    assert not cb.is_connected
    assert not cb.audio_evidence.pending_responses
    assert cb.audio_evidence.current is None
    assert cb._safe_send.call_args.args[0]['type'] == 'connection_closed'


@pytest.mark.asyncio
async def test_duplicate_audio_ended_jobs_create_only_one_reply(monkeypatch):
    cb = owner()
    pending, _ = await record(cb, monkeypatch, {
        'status': 'clear', 'heard_text': '予約システムです。', 'uncertain_spans': []})
    await asyncio.gather(cb.audio_evidence.reply(pending), cb.audio_evidence.reply(pending))
    cb.conversation.create_response.assert_called_once()
    assert list(cb.audio_evidence.pending_responses) == [pending]


@pytest.mark.asyncio
async def test_interruption_clears_shared_audio_and_text_before_late_done(monkeypatch):
    cb = owner()
    pending, _ = await record(cb, monkeypatch, {
        'status': 'clear', 'heard_text': '予約システムです。', 'uncertain_spans': []})
    await cb.audio_evidence.reply(pending)
    cb.audio_evidence.response_started('old-reply')
    cb.current_response_id = 'old-reply'
    cb.full_response_text = 'Old reply'
    cb.ai_audio_buffer = bytearray(b'old audio')
    cb._pending_audio_frames = ['old frame']
    cb.audio_evidence.invalidate()
    cb.on_event({'type': 'response.text.done', 'response_id': 'old-reply', 'text': 'Old reply'})
    await asyncio.sleep(0.02)
    assert cb.audio_evidence.stale_response('old-reply')
    assert cb.full_response_text == ''
    assert not cb.ai_audio_buffer and not cb._pending_audio_frames
    assert not any(m['role'] == 'assistant' for m in cb.messages)


@pytest.mark.asyncio
async def test_first_recording_interrupts_welcome_and_discards_its_late_events(monkeypatch):
    cb = owner()
    cb.current_response_id = 'welcome'
    cb.full_response_text = 'Welcome partial.'
    cb.ai_audio_buffer = bytearray(b'welcome audio')
    cb.audio_evidence.invalidate()
    assert cb.full_response_text == '' and not cb.ai_audio_buffer
    pending, _ = await record(cb, monkeypatch, {
        'status': 'clear', 'heard_text': '予約システムです。', 'uncertain_spans': []})
    await cb.audio_evidence.reply(pending)
    cb.on_event({'type': 'response.text.done', 'response_id': 'welcome', 'text': 'Late welcome'})
    await asyncio.sleep(0.02)
    assert not any(m['role'] == 'assistant' for m in cb.messages)
    assert cb.full_response_text == '' and not cb.ai_audio_buffer


@pytest.mark.asyncio
async def test_queued_old_connection_events_cannot_consume_new_turn_slots(monkeypatch):
    cb = owner()
    await cb._event_lock.acquire()
    old_epoch = cb.current_turn_teaching.connection_epoch
    cb.on_event({'type': 'input_audio_buffer.committed', 'item_id': 'old-input', '_teaching_epoch': old_epoch})
    cb.on_event({'type': 'response.created', 'response': {'id': 'old-response'}, '_teaching_epoch': old_epoch})
    await asyncio.sleep(0)
    cb.audio_evidence.invalidate(disconnected=True)
    cb.current_turn_teaching.connection_epoch += 1
    monkeypatch.setattr(evidence, 'hear', AsyncMock(return_value={
        'status': 'clear', 'heard_text': '予約システムです。', 'uncertain_spans': []}))
    cb.audio_evidence.begin('new-input')
    pending = cb.audio_evidence.commit(b'\x00\x01' * 1600)
    await pending['job']
    cb.audio_evidence.pending_responses.append(pending)
    cb._event_lock.release()
    await asyncio.sleep(0.02)
    assert list(cb.audio_evidence.commits) == [pending]
    assert list(cb.audio_evidence.pending_responses) == [pending]
    assert 'old-response' not in cb.audio_evidence.responses
    assert 'old-input' not in cb.audio_evidence.items


async def record(cb, monkeypatch, result, item='input-1', text='独占力があります。'):
    monkeypatch.setattr(evidence, 'hear', AsyncMock(return_value=result))
    cb.expression_input_sequence += 1
    cb.audio_evidence.begin(item)
    pending = cb.audio_evidence.commit(b'\x00\x01' * 1600)
    cb.audio_evidence.committed(item)
    message = {'id': item, 'turn_id': item, 'role': 'user', 'content': text,
               'timestamp': '2026-09-29T08:00:00'}
    assert cb.audio_evidence.attach(message, item)
    await pending['job']
    cb.messages.append(message)
    return pending, message


@pytest.mark.asyncio
async def test_heard_audio_replaces_only_evaluation_text_and_binds_reply(monkeypatch):
    cb = owner()
    clear = {'status': 'clear', 'heard_text': '即戦力があります。', 'uncertain_spans': []}
    pending, message = await record(cb, monkeypatch, clear)
    await cb.audio_evidence.reply(pending)
    cb.audio_evidence.response_started('reply-1')
    snapshot = cb.audio_evidence.snapshot('reply-1')
    assert message['content'] == '独占力があります。'  # displayed ASR is not rewritten
    assert evidence.assessment_text(snapshot['user']) == '即戦力があります。'
    assert snapshot['identity'][3] == 3
    cb.expression_input_sequence += 1
    cb.audio_evidence.begin('input-2')
    assert cb.audio_evidence.stale_response('reply-1')
    assert cb.audio_evidence.snapshot('reply-1') is None
    assert evidence.assessment_text(snapshot['user']) == '即戦力があります。'


@pytest.mark.asyncio
@pytest.mark.parametrize('status', ['uncertain', 'unavailable'])
async def test_uncertain_or_failed_audio_requests_repeat_and_never_scores(monkeypatch, status):
    from .test_expression_feedback import omni
    cb = owner()
    pending, message = await record(cb, monkeypatch, {
        'status': status, 'heard_text': '十五か五十', 'uncertain_spans': ['十五か五十']})
    accumulator = AsyncMock()
    monkeypatch.setattr(omni, '_handle_turn_with_accumulator', accumulator)
    await cb.audio_evidence.reply(pending)
    assert 'Do not praise' in cb.conversation.create_response.call_args.kwargs['instructions']
    assert evidence.assessment_text(message) is None
    assert await omni._evaluate_scene_turn_progress(cb, 7, 42, 'That was perfect.') is None
    accumulator.assert_not_awaited()


@pytest.mark.asyncio
async def test_late_duplicate_asr_and_generation_reset_cannot_bind_next_recording(monkeypatch):
    cb = owner()
    clear = {'status': 'clear', 'heard_text': 'I managed five people.', 'uncertain_spans': []}
    monkeypatch.setattr(evidence, 'hear', AsyncMock(return_value=clear))
    cb.audio_evidence.begin('first')
    first = cb.audio_evidence.commit(b'\x00\x01' * 1600)
    await first['job']
    cb.expression_input_sequence += 1
    cb.audio_evidence.begin('second')
    second = cb.audio_evidence.commit(b'\x00\x01' * 1600)
    cb.audio_evidence.committed('first')
    cb.audio_evidence.committed('first')
    cb.audio_evidence.committed('second')
    assert not cb.audio_evidence.attach({'turn_id': 'first'}, 'first')
    message = {'turn_id': 'second', 'content': 'wrong ASR'}
    assert cb.audio_evidence.attach(message, 'second')
    assert not cb.audio_evidence.attach(message, 'second')
    cb.user_context['active_goal']['current_task']['scoring_generation'] = 4
    await second['job']
    await cb.audio_evidence.reply(second)
    cb.conversation.create_response.assert_not_called()
    assert evidence.assessment_text(message) is None


@pytest.mark.asyncio
async def test_disconnect_cancels_verification_and_discards_old_commit(monkeypatch):
    cb = owner()
    gate = asyncio.Event()
    async def wait(*args):
        await gate.wait()
    monkeypatch.setattr(evidence, 'hear', wait)
    cb.audio_evidence.begin('first')
    first = cb.audio_evidence.commit(b'\x00\x01' * 1600)
    await asyncio.sleep(0)
    cb.audio_evidence.invalidate(disconnected=True)
    with pytest.raises(asyncio.CancelledError):
        await first['job']
    assert not cb.audio_evidence.commits and not cb.audio_evidence.items
    assert not cb.audio_evidence.valid(first)


@pytest.mark.parametrize('mode', ['recall', 'daily_qa', 'tour', 'magic_repetition', 'quick_experience'])
@pytest.mark.asyncio
async def test_other_modes_do_not_request_audio_evidence(mode):
    cb = owner()
    cb.mode = mode
    cb.audio_evidence.begin('excluded')
    assert cb.audio_evidence.commit(b'\x00\x01' * 1600) is None


@pytest.mark.asyncio
async def test_verified_audio_survives_prompt_refresh_full_window_and_reset(monkeypatch):
    from .test_scoring_windows import FakeRedis
    cb = owner()
    cb.messages = []
    redis = FakeRedis()
    monkeypatch.setattr(omni, '_get_redis_client', lambda: redis)
    post = AsyncMock(return_value={
        'evaluation_status': 'evaluated', 'evidence_sufficient': True, 'quality': 'strong',
        'delta': 3, 'score': 3, 'interaction_count': 3, 'task_completed': False, 'scoring_generation': 3,
    })
    monkeypatch.setattr(omni, '_post_scoring_window', post)
    snapshots = []
    heard = ['I would like the sirloin.', 'Medium rare, please.', 'Could I have a small portion?']
    for index, text in enumerate(heard):
        if index == 1:
            pending, uncertain = await record(cb, monkeypatch, {
                'status': 'uncertain', 'heard_text': '', 'uncertain_spans': ['unintelligible']}, item='unclear')
            assert await omni._evaluate_scene_turn_progress(cb, 7, 42, 'That was perfect.') is None
        pending, message = await record(cb, monkeypatch, {
            'status': 'clear', 'heard_text': text, 'uncertain_spans': []}, item=f'input-{index}', text='corrupted ASR')
        await cb.audio_evidence.reply(pending)
        cb.audio_evidence.response_started(f'reply-{index}')
        snapshot = cb.audio_evidence.snapshot(f'reply-{index}')
        snapshots.append(snapshot)
        for _ in range(3):
            cb._update_session_prompt()
        await omni._evaluate_scene_turn_progress(cb, 7, 42, 'Tutor example: I led 500 people.', turn_snapshot=snapshot)
    post.assert_awaited_once()
    request = post.call_args.args[0]
    assert [t['user_content'] for t in request['turn_window']] == heard
    assert [t['turn_id'] for t in request['turn_window']] == ['input-0', 'input-1', 'input-2']
    assert request['scoring_generation'] == request['current_task']['scoring_generation'] == 3
    assert cb.user_context['active_goal']['current_task']['score'] == 3
    assert cb.user_context['active_goal']['current_task']['interaction_count'] == 3
    # The same completed turn cannot create a second scoring window.
    await omni._evaluate_scene_turn_progress(cb, 7, 42, 'duplicate', turn_snapshot=snapshots[-1])
    post.assert_awaited_once()
    cb.user_context['active_goal']['current_task']['scoring_generation'] = 4
    assert await omni._evaluate_scene_turn_progress(cb, 7, 42, 'late', turn_snapshot=snapshots[-1]) is None
    post.assert_awaited_once()
