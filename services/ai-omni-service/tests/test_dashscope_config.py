import pytest

from app.dashscope_config import (
    DashScopeConfigurationError,
    PUBLIC_HTTP_BASE,
    PUBLIC_WS_URL,
    resolve_dashscope_config,
)


def test_public_endpoints_select_only_public_key():
    config = resolve_dashscope_config({
        "QWEN3_OMNI_API_KEY": "public-secret",
        "DASHSCOPE_API_KEY": "must-not-be-used",
    })
    assert config.ws_url == PUBLIC_WS_URL
    assert config.http_base == PUBLIC_HTTP_BASE
    assert {config.ws_api_key, config.http_api_key, config.chat_api_key, config.image_api_key} == {"public-secret"}
    assert config.ws_credential_source == "QWEN3_OMNI_API_KEY"


def test_production_mixed_topology_routes_each_key_by_hostname():
    host = "workspace.ap-southeast-1.maas.aliyuncs.com"
    config = resolve_dashscope_config({
        "NODE_ENV": "production",
        "QWEN3_OMNI_API_KEY": "public-secret",
        "DASHSCOPE_API_KEY": "maas-secret",
        "DASHSCOPE_WS_URL": f"wss://{host}/api-ws/v1/realtime",
        "DASHSCOPE_HTTP_BASE": f"https://{host}",
        "DASHSCOPE_CHAT_BASE": "https://dashscope-intl.aliyuncs.com",
        "DASHSCOPE_IMAGE_BASE": "https://dashscope-intl.aliyuncs.com",
    })
    assert config.ws_api_key == config.http_api_key == "maas-secret"
    assert config.chat_api_key == config.image_api_key == "public-secret"
    assert config.ws_dedicated and config.http_dedicated
    assert not config.chat_dedicated and not config.image_dedicated
    assert "public-secret" not in repr(config)
    assert "maas-secret" not in repr(config)


@pytest.mark.parametrize("variable,value", [
    ("DASHSCOPE_WS_URL", "wss://workspace.maas.aliyuncs.com/api-ws/v1/realtime?api_key=public-secret"),
    ("DASHSCOPE_HTTP_BASE", "https://dashscope.aliyuncs.com.evil.test"),
    ("DASHSCOPE_CHAT_BASE", "https://public-secret@dashscope.aliyuncs.com"),
    ("DASHSCOPE_IMAGE_BASE", "http://dashscope.aliyuncs.com"),
])
def test_malicious_or_misclassified_endpoint_fails_without_secret_value(variable, value):
    env = {
        "QWEN3_OMNI_API_KEY": "public-secret",
        "DASHSCOPE_API_KEY": "maas-secret",
        variable: value,
    }
    with pytest.raises(DashScopeConfigurationError) as caught:
        resolve_dashscope_config(env)
    assert "public-secret" not in str(caught.value)
    assert "maas-secret" not in str(caught.value)


@pytest.mark.parametrize("missing", [
    "QWEN3_OMNI_API_KEY", "DASHSCOPE_API_KEY", "DASHSCOPE_WS_URL",
    "DASHSCOPE_HTTP_BASE", "DASHSCOPE_CHAT_BASE", "DASHSCOPE_IMAGE_BASE",
])
def test_production_requires_complete_explicit_configuration(missing):
    env = {
        "NODE_ENV": "production",
        "QWEN3_OMNI_API_KEY": "public-secret",
        "DASHSCOPE_API_KEY": "maas-secret",
        "DASHSCOPE_WS_URL": "wss://workspace.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/realtime",
        "DASHSCOPE_HTTP_BASE": "https://workspace.ap-southeast-1.maas.aliyuncs.com",
        "DASHSCOPE_CHAT_BASE": "https://dashscope-intl.aliyuncs.com",
        "DASHSCOPE_IMAGE_BASE": "https://dashscope-intl.aliyuncs.com",
    }
    del env[missing]
    with pytest.raises(DashScopeConfigurationError, match="incomplete"):
        resolve_dashscope_config(env)


def test_public_key_can_never_satisfy_a_maas_request():
    with pytest.raises(DashScopeConfigurationError, match="DASHSCOPE_API_KEY"):
        resolve_dashscope_config({
            "QWEN3_OMNI_API_KEY": "public-secret",
            "DASHSCOPE_WS_URL": "wss://workspace.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/realtime",
        })
