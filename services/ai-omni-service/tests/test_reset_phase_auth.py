from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from ._omni_stubs import load_main

omni = load_main()


@pytest.mark.asyncio
@pytest.mark.parametrize('use_cookie', [True, False])
async def test_phase_reset_uses_authenticated_identity_without_local_profile(use_cookie):
    request = SimpleNamespace(
        cookies={'accessToken': 'test-token'} if use_cookie else {},
        headers={} if use_cookie else {'Authorization': 'Bearer test-token'},
    )
    phases = omni._TTLDict(ttl=60, maxsize=10)
    phases['owner:Cafe'] = {'phase': 'scene_theater', 'task_index': 2}
    phases['other:Cafe'] = {'phase': 'scene_theater', 'task_index': 1}
    context = AsyncMock(return_value={'id': 'owner'})
    with patch.object(omni, 'get_user_context', context), patch.object(omni, 'session_phases', phases):
        result = await omni.reset_phase(request, user_id=None, scenario='Cafe')
    assert result['success'] is True
    assert phases['owner:Cafe']['task_index'] == 0
    assert phases['other:Cafe']['task_index'] == 1
    context.assert_awaited_once_with('test-token', profile_only=True)


@pytest.mark.asyncio
@pytest.mark.parametrize('profile,claimed,status', [(None, None, 401), ({}, None, 401), ({'id': 'owner'}, 'other', 403)])
async def test_phase_reset_rejects_expired_or_cross_user_identity(profile, claimed, status):
    request = SimpleNamespace(cookies={'accessToken': 'test-token'}, headers={})
    with patch.object(omni, 'get_user_context', AsyncMock(return_value=profile)):
        with pytest.raises(omni.HTTPException) as error:
            await omni.reset_phase(request, user_id=claimed, scenario='Cafe')
    assert error.value.status_code == status


@pytest.mark.asyncio
async def test_phase_reset_without_credentials_does_not_fetch_context():
    with patch.object(omni, 'get_user_context', AsyncMock()) as context:
        with pytest.raises(omni.HTTPException) as error:
            await omni.reset_phase(SimpleNamespace(cookies={}, headers={}), user_id=None, scenario='Cafe')
    assert error.value.status_code == 401
    context.assert_not_awaited()
