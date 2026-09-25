"""Offline endpoint tests: every generation transport is stubbed."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from ._omni_stubs import load_main

omni = load_main()
VALID = {"scenario": {"title": "在药店咨询", "tasks": ["说明症状", "询问用药方法", "确认价格"]}}


@pytest.fixture
def generation(monkeypatch):
    monkeypatch.setenv("INTERNAL_AUTH_SECRET", "test-internal-only")
    response = Mock()
    response.json.return_value = {"choices": [{"message": {"content": json.dumps(VALID)}}]}
    client = SimpleNamespace(post=AsyncMock(return_value=response))
    factory = AsyncMock()
    factory.__aenter__.return_value = client
    monkeypatch.setattr(omni.httpx, "AsyncClient", Mock(return_value=factory))
    return client, response


def request(secret="test-internal-only"):
    return SimpleNamespace(headers={"X-Guaji-Internal-Auth": secret})


@pytest.mark.asyncio
async def test_single_scenario_success_preserves_goal_language_level_and_exclusions(generation):
    client, _ = generation
    payload = dict(target_language="French", target_level="A1", type="travel",
                   native_language="Chinese", interests="徒步", exclude_titles=["在餐厅点餐"])
    assert await omni.generate_scenario(request(), payload) == VALID
    args = client.post.call_args
    assert args.args[0] == f"{omni.DASHSCOPE_CHAT_BASE}/compatible-mode/v1/chat/completions"
    assert args.kwargs["json"]["model"] == omni.QWEN_TEXT_MODEL
    prompts = args.kwargs["json"]["messages"]
    assert prompts[0]["role"] == "system"
    assert "语义重复" in prompts[0]["content"]
    assert json.loads(prompts[1]["content"]) == payload
    assert args.kwargs["headers"]["Authorization"] == f"Bearer {omni.DASHSCOPE_CONFIG.chat_api_key}"


@pytest.mark.asyncio
@pytest.mark.parametrize("content", [
    "not json", "[]", "{}", '{"scenario":null}',
    json.dumps({"scenario": {"title": "在餐厅点餐", "tasks": ["一", "二", "三"]}}),
    json.dumps({"scenario": {"title": "在餐厅点餐！", "tasks": ["一", "二", "三"]}}),
    json.dumps({"scenario": {"title": "药店", "tasks": ["一", "二"]}}),
    json.dumps({"scenario": {"title": "药店", "tasks": ["一", " ", "三"]}}),
    json.dumps({"scenario": {"title": "药店", "tasks": ["一", "一", "三"]}}),
    json.dumps({"scenario": {"title": "药" * 101, "tasks": ["一", "二", "三"]}}),
    json.dumps({"scenario": {"title": "药店", "tasks": ["一" * 301, "二", "三"]}}),
    json.dumps({"scenario": {"title": "药店", "tasks": [1, "二", "三"]}}),
])
async def test_invalid_or_duplicate_model_output_is_failure(generation, content):
    _, response = generation
    response.json.return_value = {"choices": [{"message": {"content": content}}]}
    with pytest.raises(Exception) as caught:
        await omni.generate_scenario(request(), {"exclude_titles": ["在餐厅点餐"]})
    assert caught.value.status_code == 502


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    {"exclude_titles": ["a"] * 13}, {"exclude_titles": "restaurant"},
    {"exclude_titles": [None]}, {"target_level": []}, {"target_language": " "},
    {"interests": ["travel"]}, {"interests": "a" * 201},
])
async def test_invalid_request_never_calls_model(generation, payload):
    client, _ = generation
    with pytest.raises(Exception) as caught:
        await omni.generate_scenario(request(), payload)
    assert caught.value.status_code == 400
    client.post.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("secret", ["", "wrong", "非ASCII"])
async def test_direct_endpoint_requires_internal_auth(generation, secret):
    client, _ = generation
    with pytest.raises(Exception) as caught:
        await omni.generate_scenario(request(secret), {})
    assert caught.value.status_code == 401
    client.post.assert_not_called()


@pytest.mark.asyncio
async def test_unconfigured_internal_auth_fails_closed(generation, monkeypatch):
    client, _ = generation
    monkeypatch.delenv("INTERNAL_AUTH_SECRET")
    with pytest.raises(Exception) as caught:
        await omni.generate_scenario(request(), {})
    assert caught.value.status_code == 503
    client.post.assert_not_called()


@pytest.mark.asyncio
async def test_upstream_failure_is_safe_and_does_not_return_bad_scenario(generation):
    client, _ = generation
    client.post.side_effect = TimeoutError("upstream detail must not reach client")
    with pytest.raises(Exception) as caught:
        await omni.generate_scenario(request(), {})
    assert caught.value.status_code == 502
    assert "upstream detail" not in str(caught.value)
