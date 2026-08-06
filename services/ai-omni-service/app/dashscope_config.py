"""Strict DashScope endpoint/credential routing without secret-bearing diagnostics."""

from dataclasses import dataclass, field
from urllib.parse import urlparse

PUBLIC_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
PUBLIC_HTTP_BASE = "https://dashscope.aliyuncs.com"
_PUBLIC_HOSTS = {"dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com"}


class DashScopeConfigurationError(ValueError):
    pass


@dataclass(frozen=True)
class DashScopeConfig:
    ws_url: str
    http_base: str
    chat_base: str
    image_base: str
    ws_api_key: str = field(repr=False)
    http_api_key: str = field(repr=False)
    chat_api_key: str = field(repr=False)
    image_api_key: str = field(repr=False)
    ws_credential_source: str
    http_credential_source: str
    chat_credential_source: str
    image_credential_source: str
    ws_dedicated: bool
    http_dedicated: bool
    chat_dedicated: bool
    image_dedicated: bool

    # Backward-compatible names used by the realtime connection path.
    @property
    def api_key(self) -> str:
        return self.ws_api_key

    @property
    def credential_source(self) -> str:
        return self.ws_credential_source

    @property
    def dedicated(self) -> bool:
        return self.ws_dedicated


def _endpoint_family(endpoint: str, *, variable: str, websocket: bool = False) -> bool:
    parsed = urlparse(endpoint)
    expected_scheme = "wss" if websocket else "https"
    if parsed.scheme.lower() != expected_scheme:
        raise DashScopeConfigurationError(f"{variable} must use {expected_scheme}://")
    if not parsed.hostname or parsed.username or parsed.password:
        raise DashScopeConfigurationError(f"{variable} must contain a valid host without userinfo")
    if parsed.query or parsed.fragment:
        raise DashScopeConfigurationError(f"{variable} must not contain a query string or fragment")

    hostname = parsed.hostname.lower().rstrip(".")
    if hostname in _PUBLIC_HOSTS:
        return False
    if hostname.endswith(".maas.aliyuncs.com") and hostname != "maas.aliyuncs.com":
        return True
    raise DashScopeConfigurationError(f"{variable} host is not an approved DashScope endpoint")


def _credential_for(endpoint: str, *, variable: str, env, websocket: bool = False):
    dedicated = _endpoint_family(endpoint, variable=variable, websocket=websocket)
    key_variable = "DASHSCOPE_API_KEY" if dedicated else "QWEN3_OMNI_API_KEY"
    api_key = env.get(key_variable)
    if not api_key:
        family = "dedicated MaaS" if dedicated else "public DashScope"
        raise DashScopeConfigurationError(f"{key_variable} is required for the {family} endpoint in {variable}")
    return api_key, key_variable, dedicated


def resolve_dashscope_config(env) -> DashScopeConfig:
    production = (env.get("NODE_ENV") or env.get("ENVIRONMENT") or "").lower() == "production"
    required_urls = (
        "DASHSCOPE_WS_URL",
        "DASHSCOPE_HTTP_BASE",
        "DASHSCOPE_CHAT_BASE",
        "DASHSCOPE_IMAGE_BASE",
    )
    if production:
        missing = [name for name in ("QWEN3_OMNI_API_KEY", "DASHSCOPE_API_KEY", *required_urls) if not env.get(name)]
        if missing:
            raise DashScopeConfigurationError(
                "Production DashScope configuration is incomplete; missing: " + ", ".join(missing)
            )

    ws_url = (env.get("DASHSCOPE_WS_URL") or PUBLIC_WS_URL).rstrip("/")
    http_base = (env.get("DASHSCOPE_HTTP_BASE") or PUBLIC_HTTP_BASE).rstrip("/")
    chat_base = (env.get("DASHSCOPE_CHAT_BASE") or PUBLIC_HTTP_BASE).rstrip("/")
    image_base = (env.get("DASHSCOPE_IMAGE_BASE") or PUBLIC_HTTP_BASE).rstrip("/")

    ws_key, ws_source, ws_dedicated = _credential_for(
        ws_url, variable="DASHSCOPE_WS_URL", env=env, websocket=True
    )
    http_key, http_source, http_dedicated = _credential_for(
        http_base, variable="DASHSCOPE_HTTP_BASE", env=env
    )
    chat_key, chat_source, chat_dedicated = _credential_for(
        chat_base, variable="DASHSCOPE_CHAT_BASE", env=env
    )
    image_key, image_source, image_dedicated = _credential_for(
        image_base, variable="DASHSCOPE_IMAGE_BASE", env=env
    )

    if production:
        if not ws_dedicated or not http_dedicated:
            raise DashScopeConfigurationError("Production realtime and HTTP endpoints must use dedicated MaaS hosts")
        if chat_dedicated or image_dedicated:
            raise DashScopeConfigurationError("Production chat and image endpoints must use public DashScope hosts")

    return DashScopeConfig(
        ws_url=ws_url,
        http_base=http_base,
        chat_base=chat_base,
        image_base=image_base,
        ws_api_key=ws_key,
        http_api_key=http_key,
        chat_api_key=chat_key,
        image_api_key=image_key,
        ws_credential_source=ws_source,
        http_credential_source=http_source,
        chat_credential_source=chat_source,
        image_credential_source=image_source,
        ws_dedicated=ws_dedicated,
        http_dedicated=http_dedicated,
        chat_dedicated=chat_dedicated,
        image_dedicated=image_dedicated,
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
