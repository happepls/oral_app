"""DashScope endpoint/credential resolution without secret-bearing diagnostics."""

from dataclasses import dataclass
from urllib.parse import urlparse

PUBLIC_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
PUBLIC_HTTP_BASE = "https://dashscope.aliyuncs.com"


class DashScopeConfigurationError(ValueError):
    pass


@dataclass(frozen=True)
class DashScopeConfig:
    api_key: str
    ws_url: str
    http_base: str
    chat_base: str
    image_base: str
    credential_source: str
    dedicated: bool


def _is_dedicated(endpoint: str) -> bool:
    hostname = (urlparse(endpoint).hostname or "").lower()
    return hostname.endswith(".maas.aliyuncs.com")


def resolve_dashscope_config(env) -> DashScopeConfig:
    ws_url = (env.get("DASHSCOPE_WS_URL") or PUBLIC_WS_URL).rstrip("/")
    http_base = (env.get("DASHSCOPE_HTTP_BASE") or PUBLIC_HTTP_BASE).rstrip("/")
    chat_base = (env.get("DASHSCOPE_CHAT_BASE") or http_base).rstrip("/")
    image_base = (env.get("DASHSCOPE_IMAGE_BASE") or http_base).rstrip("/")
    if "?" in ws_url:
        raise DashScopeConfigurationError("DASHSCOPE_WS_URL must not contain a query string")

    endpoint_family = { _is_dedicated(value) for value in (ws_url, http_base) }
    if len(endpoint_family) != 1:
        raise DashScopeConfigurationError(
            "DashScope realtime and HTTP endpoints must use the same public or dedicated family"
        )
    dedicated = endpoint_family.pop()
    qwen_key = env.get("QWEN3_OMNI_API_KEY")
    production_key = env.get("DASHSCOPE_API_KEY")
    if dedicated:
        if not production_key:
            raise DashScopeConfigurationError(
                "DASHSCOPE_API_KEY is required for a dedicated MaaS endpoint"
            )
        api_key, source = production_key, "DASHSCOPE_API_KEY"
    else:
        if not qwen_key:
            raise DashScopeConfigurationError(
                "QWEN3_OMNI_API_KEY is required for the public DashScope endpoint"
            )
        api_key, source = qwen_key, "QWEN3_OMNI_API_KEY"

    return DashScopeConfig(
        api_key=api_key,
        ws_url=ws_url,
        http_base=http_base,
        chat_base=chat_base,
        image_base=image_base,
        credential_source=source,
        dedicated=dedicated,
    )


def classify_connection_error(error: Exception) -> dict:
    text = f"{type(error).__name__}: {error}".lower()
    if any(marker in text for marker in ("invalidapikey", "invalid api key", "status 401", "status_code=401")):
        return {
            "code": "dashscope_authentication_failed",
            "message": "AI 服务鉴权失败，请联系管理员检查配置",
            "retryable": False,
        }
    if isinstance(error, DashScopeConfigurationError) or "endpoint" in text:
        return {
            "code": "dashscope_endpoint_invalid",
            "message": "AI 服务 endpoint 配置错误",
            "retryable": False,
        }
    if any(marker in text for marker in ("timeout", "timed out", "temporarily unavailable", "connection reset")):
        return {
            "code": "dashscope_network_timeout",
            "message": "AI 服务连接超时，正在重试",
            "retryable": True,
        }
    return {
        "code": "dashscope_connection_failed",
        "message": "AI 服务暂时无法连接",
        "retryable": True,
    }
