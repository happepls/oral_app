import copy
import json
import os
import sys
from unittest.mock import AsyncMock, Mock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from workflows.scenario_review import ScenarioReviewWorkflow


def audio(index, status='clear'):
    return {'id': str(index), 'turn_id': str(index), 'role': 'user', 'content': 'broken ASR',
            'input_source': 'audio', 'audio_evidence': {
                'status': status, 'heard_text': f'私は{index + 3}人のチームを管理しました。',
                'uncertain_spans': [] if status == 'clear' else ['number'],
                'speech_scores': {'pronunciation': 90, 'fluency': 80, 'intonation': 70} if status == 'clear' else None}}


async def generate(history, vocabulary=60):
    workflow = ScenarioReviewWorkflow()
    workflow._llm_deep_evaluate = AsyncMock(return_value=(None if vocabulary is None else {
        'detail_scores': {'vocabulary': vocabulary}, 'reason': 'synthetic vocabulary assessment'}))
    workflow._generate_ai_feedback = AsyncMock(return_value=None)
    db = Mock(execute=AsyncMock(return_value='UPDATE 1'))
    result = await workflow.generate_scenario_review('synthetic', 7, '自我紹介',
        [{'score': 9, 'text': 'Tutor task example: 500 people'}], history, db, 'Chinese')
    persisted = json.loads(db.execute.call_args.args[1])
    assert persisted['analysis'] == result['analysis']
    assert 'user_tasks' not in db.execute.call_args.args[0]
    return workflow, result['analysis']


@pytest.mark.asyncio
async def test_report_uses_audio_scores_verified_words_and_server_average():
    history = [audio(i) for i in range(3)] + [audio(4, 'uncertain'),
        {'role': 'assistant', 'content': 'I led 500 people; you were perfect.'}]
    original = copy.deepcopy(history)
    workflow, result = await generate(history)
    assert result['detail_scores'] == {'pronunciation': 90, 'fluency': 80, 'intonation': 70, 'vocabulary': 60}
    assert result['overall_score'] == 75 and result['evaluation_status'] == 'completed'
    assert result['audio_turn_count'] == 3
    supplied = workflow._llm_deep_evaluate.call_args.args[2]
    assert [m['content'] for m in supplied if m['role'] == 'user'] == [audio(i)['audio_evidence']['heard_text'] for i in range(3)]
    assert history == original
    assert result['total_words'] is None
    assert result['grammar_errors'] is None
    assert not result['weaknesses'] and not result['strengths']


@pytest.mark.asyncio
@pytest.mark.parametrize('history', [
    [audio(0), audio(0), audio(1)],
    [audio(0), audio(1), audio(2, 'uncertain')],
    [{'role': 'user', 'content': 'Text only'} for _ in range(3)],
    [{'role': 'user', 'content': 'Old ASR', 'audioUrl': 'https://example.test/audio.wav'} for _ in range(3)],
])
async def test_missing_audio_never_invents_low_scores(history):
    _, result = await generate(history)
    assert result['evaluation_status'] == 'pending'
    assert result['overall_score'] is None and result['stars'] is None
    assert result['detail_scores']['pronunciation'] is None


@pytest.mark.asyncio
@pytest.mark.parametrize('vocabulary', [None, True, '90', -1, 101])
async def test_failed_or_invalid_text_evaluation_has_no_numeric_fallback(vocabulary):
    _, result = await generate([audio(i) for i in range(3)], vocabulary)
    assert result['evaluation_status'] == 'pending'
    assert result['overall_score'] is None and result['detail_scores']['vocabulary'] is None


@pytest.mark.asyncio
async def test_zero_is_real_score_not_pending():
    history = [audio(i) for i in range(3)]
    for message in history:
        message['audio_evidence']['speech_scores'] = dict.fromkeys(['pronunciation', 'fluency', 'intonation'], 0)
    _, result = await generate(history, 0)
    assert result['overall_score'] == 0 and result['evaluation_status'] == 'completed'


@pytest.mark.asyncio
async def test_live_prompt_contract_never_requests_acoustics_from_text(monkeypatch):
    import workflows.scenario_review as module
    import workflows.batch_evaluation as batch
    monkeypatch.setenv('DASHSCOPE_API_KEY', 'wrong-endpoint-key')
    monkeypatch.setenv('QWEN3_OMNI_API_KEY', 'synthetic-test')
    monkeypatch.setenv('QWEN_TEXT_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1')
    response = Mock(status_code=200)
    response.json.return_value = {'choices': [{'message': {'content': json.dumps({'vocabulary': 85, 'reason': 'clear meaning'})}}]}
    client = AsyncMock()
    client.post.return_value = response
    client.__aenter__.return_value = client
    monkeypatch.setattr(batch.httpx, 'AsyncClient', Mock(return_value=client))
    result = await ScenarioReviewWorkflow()._llm_deep_evaluate('自己紹介', [], [audio(i) for i in range(3)])
    assert result['detail_scores'] == {'vocabulary': 85}
    prompt = client.post.call_args.kwargs['json']['messages'][0]['content']
    assert 'broken ASR' not in prompt
    assert 'Do not infer pronunciation' in prompt
    assert 'cap fluency at 40' not in prompt
    assert client.post.call_args.kwargs['headers']['Authorization'] == 'Bearer synthetic-test'


@pytest.mark.asyncio
async def test_report_generation_rejects_untrusted_audio_scores(monkeypatch):
    import main
    from fastapi import HTTPException
    monkeypatch.setenv('INTERNAL_AUTH_SECRET', 'report-test-secret')
    request = main.ScenarioReviewRequest(user_id='synthetic', goal_id=7,
        scenario_title='自己紹介', conversation_history=[audio(i) for i in range(3)])
    db = Mock(fetch=AsyncMock())
    for supplied in ('', 'browser-forgery'):
        with pytest.raises(HTTPException) as exc:
            await main.generate_scenario_review(request, db, supplied)
        assert exc.value.status_code == 403
    db.fetch.assert_not_awaited()
