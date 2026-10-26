import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location('audio_input', Path(__file__).parents[1] / 'app/audio_input.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
AudioInput, needs_access_check = module.AudioInput, module.needs_access_check


@pytest.mark.parametrize('pause', [5, 15, 30])
def test_silence_does_not_end_recording_or_trigger_per_chunk_authorization(pause):
    transfer = AudioInput()
    transfer.start('long-input')
    assert needs_access_check('user_audio_started', transfer)
    # 120 seconds of 50ms legacy-sized chunks, including pauses.
    for sequence in range(2400):
        assert transfer.chunk(dict(input_id='long-input', sequence=sequence))
        assert not needs_access_check('audio_stream', transfer)
    assert transfer.recording  # Wall-clock silence is not an input boundary.
    assert needs_access_check('user_audio_ended', transfer)
    assert transfer.end(dict(input_id='long-input', chunks=2400))
    assert not transfer.recording


def test_partial_upload_restarts_with_same_id_but_rejects_missing_chunks():
    transfer = AudioInput()
    transfer.start('input')
    transfer.chunk(dict(input_id='input', sequence=0))
    transfer.start('input')
    with pytest.raises(ValueError, match='sequence'):
        transfer.chunk(dict(input_id='input', sequence=1))
    transfer.chunk(dict(input_id='input', sequence=0))
    with pytest.raises(ValueError, match='incomplete'):
        transfer.end(dict(input_id='input', chunks=2))
    with pytest.raises(ValueError, match='mismatch'):
        transfer.chunk(dict(input_id='other', sequence=1))


def test_dedupe_is_scoped_to_user_task_and_nonzero_generation():
    transfer = AudioInput()
    transfer.start('input')
    cb = SimpleNamespace(user_id='user', scenario='scene', user_context={
        'active_goal': {'id': 1, 'current_task': {'id': 42, 'scoring_generation': 3}}})
    key = transfer.key(cb)
    cb.user_context['active_goal']['current_task']['scoring_generation'] = 4
    assert key != transfer.key(cb)
    transfer.suppress = True
    assert not transfer.chunk({})
    assert not transfer.end({})


def test_legacy_first_chunk_and_final_submission_still_require_authority():
    transfer = AudioInput()
    assert needs_access_check('audio_stream', transfer, False)
    assert not needs_access_check('audio_stream', transfer, True)
    assert needs_access_check('user_audio_ended', transfer, True)
    assert not needs_access_check('ping', transfer)


def test_frozen_recording_scope_rejects_task_switch_reset_and_missing_generation():
    scope = dict(goal_id=7, task_id=42, scoring_generation=3)
    transfer = AudioInput()
    transfer.start('input', scope.copy())
    cb = SimpleNamespace(user_context={'active_goal': {'id': 7,
        'current_task': {'id': 42, 'scoring_generation': 3}}})
    assert transfer.current_scope(cb)
    cb.user_context['active_goal']['current_task']['scoring_generation'] = 4
    assert not transfer.current_scope(cb)
    cb.user_context['active_goal']['current_task'].pop('scoring_generation')
    assert not transfer.current_scope(cb)
