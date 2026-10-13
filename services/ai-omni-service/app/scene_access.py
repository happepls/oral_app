"""Fail-closed, uncached authorization for every protected AI operation."""
import os
import hmac
import re
import httpx
from fastapi import HTTPException


async def check_access(user_id, scenario=None, mode=None, goal_id=None, operation="practice"):
    secret = os.getenv("INTERNAL_AUTH_SECRET")
    if not secret:
        raise HTTPException(503, "authorization_unavailable")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(
                f"{os.getenv('USER_SERVICE_URL', 'http://user-service:3000').rstrip('/')}/api/users/internal/users/{user_id}/access/check",
                headers={"X-Guaji-Internal-Auth": secret},
                json={"scenario": scenario, "mode": mode, "goal_id": goal_id, "operation": operation},
            )
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError('invalid authority response')
    except Exception:
        raise HTTPException(503, "authorization_unavailable") from None
    if response.status_code != 200 or result.get("allowed") is not True:
        status = response.status_code if response.status_code in (401, 403, 429) else 503
        raise HTTPException(status, result.get("reason", "authorization_unavailable"))
    if not isinstance(result.get("access"), dict):
        raise HTTPException(503, "authorization_unavailable")
    return result["access"]


async def deny_websocket(websocket, error):
    await websocket.send_json({"type": "error", "payload": {"status": error.status_code, "code": error.detail, "message": error.detail}})
    await websocket.close(code=1011 if error.status_code == 503 else 1008, reason=str(error.detail))


async def check_request_access(request, payload, operation='generate'):
    scenario = payload.get('scenario_title') or payload.get('scenario')
    goal_id = payload.get('goal_id')
    if request.headers.get('x-guaji-internal-auth'):
        expected = os.getenv('INTERNAL_AUTH_SECRET', '')
        if not expected or not hmac.compare_digest(request.headers['x-guaji-internal-auth'], expected):
            raise HTTPException(401, 'authentication_required')
        user_id = request.headers.get('x-guaji-user-id', '')
        if not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', user_id):
            raise HTTPException(401, 'authentication_required')
        return await check_access(user_id, scenario, payload.get('mode'), goal_id, operation)
    headers = {}
    token = request.cookies.get('accessToken')
    if token:
        headers['Cookie'] = f'accessToken={token}'
    elif request.headers.get('authorization', '').startswith('Bearer '):
        headers['Authorization'] = request.headers['authorization']
    else:
        raise HTTPException(401, 'authentication_required')
    return await _check_public_access(headers, payload, operation)


async def check_token_access(token, scenario=None, mode=None):
    return await _check_public_access({'Authorization': f'Bearer {token}'}, {'scenario': scenario, 'mode': mode}, 'practice')


async def _check_public_access(headers, payload, operation):
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(
                f"{os.getenv('USER_SERVICE_URL', 'http://user-service:3000').rstrip('/')}/api/users/access/check",
                headers=headers,
                json={'scenario': payload.get('scenario_title') or payload.get('scenario'), 'goal_id': payload.get('goal_id'), 'mode': payload.get('mode'), 'operation': operation},
            )
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError('invalid authority response')
    except Exception:
        raise HTTPException(503, 'authorization_unavailable') from None
    if response.status_code != 200 or result.get('allowed') is not True:
        status = response.status_code if response.status_code in (401, 403, 429) else 503
        raise HTTPException(status, result.get('reason', 'authorization_unavailable'))
    if not isinstance(result.get('access'), dict):
        raise HTTPException(503, 'authorization_unavailable')
    return result['access']
