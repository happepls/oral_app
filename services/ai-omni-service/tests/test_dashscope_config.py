import pytest

from app.dashscope_config import (
    DashScopeConfigurationError,
    PUBLIC_HTTP_BASE,
    PUBLIC_WS_URL,
    resolve_dashscope_config,
)


def test_public_endpoints_select_local_qwen_key():
    config = resolve_dashscope_config({"QWEN3_OMNI_API_KEY": "local-secret"})
    assert config.api_key == "local-secret"
    assert config.ws_url == PUBLIC_WS_URL
    assert config.http_base == PUBLIC_HTTP_BASE
    assert config.credential_source == "QWEN3_OMNI_API_KEY"


def test_dedicated_endpoints_select_production_key():
    host = "ws-example.ap-southeast-1.maas.aliyuncs.com"
    config = resolve_dashscope_config({
        "DASHSCOPE_API_KEY": "production-secret",
        "DASHSCOPE_WS_URL": f"wss://{host}/api-ws/v1/realtime",
        "DASHSCOPE_HTTP_BASE": f"https://{host}",
    })
    assert config.api_key == "production-secret"
    assert config.dedicated is True


@pytest.mark.parametrize("env", [
    {
        "QWEN3_OMNI_API_KEY": "local-secret",
        "DASHSCOPE_WS_URL": "wss://workspace.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/realtime",
        "DASHSCOPE_HTTP_BASE": "https://workspace.ap-southeast-1.maas.aliyuncs.com",
    },
    {
        "DASHSCOPE_API_KEY": "production-secret",
        "DASHSCOPE_WS_URL": PUBLIC_WS_URL,
        "DASHSCOPE_HTTP_BASE": PUBLIC_HTTP_BASE,
    },
])
def test_endpoint_key_mismatch_fails_without_secret_value(env):
    with pytest.raises(DashScopeConfigurationError) as caught:
        resolve_dashscope_config(env)
    message = str(caught.value)
    assert "local-secret" not in message
    assert "production-secret" not in message
