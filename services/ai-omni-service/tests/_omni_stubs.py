"""Isolated loader for app/main.py used by the bundle's NEW tests.

`app/main.py` imports fastapi, pydantic, httpx, dashscope and redis at module
load time. Those live in the service's Docker image but not in a bare local
checkout. ``load_main()`` installs minimal stand-ins, imports main.py under a
PRIVATE module name, then REMOVES the stubs again — so the global import state
is left exactly as it was found.

Why the cleanup matters: the pre-existing speculative tests (test_daily_qa.py
et al.) intentionally ``import main`` inside try/except and skip locally when it
fails. If we left fastapi/redis stubs registered (or registered ``main`` under
its real name), those tests would silently flip from "skipped" to "run" and
expose unrelated, pre-existing cache-key drift. Loading under a private name and
tearing the stubs down keeps their behaviour untouched.

The loaded module is cached here so repeated ``load_main()`` calls are cheap and
return the same object.
"""
import importlib.util
import os
import sys
import types

_PRIVATE_NAME = "_omni_main_under_test"
_cached = None


def _make_stubs() -> dict:
    """Build the stub modules main.py needs at import time."""
    mods = {}

    # --- fastapi -------------------------------------------------------------
    _fastapi = types.ModuleType("fastapi")

    class _HTTPException(Exception):
        def __init__(self, status_code: int = 500, detail=None, **kwargs):
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail)

    def _Query(default=None, *a, **kw):
        return default

    def _Body(default=None, *a, **kw):
        return default

    class _FastAPI:
        def __init__(self, *a, **kw):
            pass

        def add_middleware(self, *a, **kw):
            return None

        def _decorator(self, *a, **kw):
            def _wrap(fn):
                return fn
            return _wrap

        get = post = put = delete = patch = websocket = middleware = _decorator

    _fastapi.FastAPI = _FastAPI
    _fastapi.WebSocket = type("WebSocket", (), {})
    _fastapi.WebSocketDisconnect = type("WebSocketDisconnect", (Exception,), {})
    _fastapi.Query = _Query
    _fastapi.Body = _Body
    _fastapi.HTTPException = _HTTPException
    _fastapi.Request = type("Request", (), {})

    _fastapi_mw = types.ModuleType("fastapi.middleware")
    _fastapi_cors = types.ModuleType("fastapi.middleware.cors")
    _fastapi_cors.CORSMiddleware = type("CORSMiddleware", (), {})
    _fastapi_mw.cors = _fastapi_cors

    _fastapi_resp = types.ModuleType("fastapi.responses")
    _fastapi_resp.Response = type("Response", (), {"__init__": lambda self, *a, **kw: None})

    mods["fastapi"] = _fastapi
    mods["fastapi.middleware"] = _fastapi_mw
    mods["fastapi.middleware.cors"] = _fastapi_cors
    mods["fastapi.responses"] = _fastapi_resp

    # --- pydantic ------------------------------------------------------------
    _pydantic = types.ModuleType("pydantic")

    class _BaseModel:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

    _pydantic.BaseModel = _BaseModel
    mods["pydantic"] = _pydantic

    # --- httpx ---------------------------------------------------------------
    _httpx = types.ModuleType("httpx")

    class _AsyncClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    _httpx.AsyncClient = _AsyncClient
    mods["httpx"] = _httpx

    # --- dashscope -----------------------------------------------------------
    _ds = types.ModuleType("dashscope")

    class _Generation:
        @staticmethod
        def call(*a, **kw):
            return None

    class _MultiModalConversation:
        @staticmethod
        def call(*a, **kw):
            return None

    _ds.Generation = _Generation
    _ds.MultiModalConversation = _MultiModalConversation
    _ds.api_key = None

    _ds_audio = types.ModuleType("dashscope.audio")
    _ds_omni = types.ModuleType("dashscope.audio.qwen_omni")

    class _StubClass:
        pass

    for _attr in ("OmniRealtimeCallback", "OmniRealtimeConversation", "MultiModality", "AudioFormat"):
        setattr(_ds_omni, _attr, _StubClass)

    _ds.audio = _ds_audio
    _ds_audio.qwen_omni = _ds_omni
    mods["dashscope"] = _ds
    mods["dashscope.audio"] = _ds_audio
    mods["dashscope.audio.qwen_omni"] = _ds_omni

    # --- redis ---------------------------------------------------------------
    _redis = types.ModuleType("redis")
    _redis_async = types.ModuleType("redis.asyncio")
    _redis_async.Redis = type("Redis", (), {})
    _redis_async.from_url = lambda *a, **kw: object()
    _redis.asyncio = _redis_async
    mods["redis"] = _redis
    mods["redis.asyncio"] = _redis_async

    return mods


def load_main():
    """Import app/main.py in isolation and return the module object.

    Stubs are installed only for the duration of the import and removed
    afterwards, and the module is registered under a private name so that
    ``import main`` elsewhere is unaffected.
    """
    global _cached
    if _cached is not None:
        return _cached

    main_path = os.path.join(os.path.dirname(__file__), "..", "app", "main.py")
    os.environ.setdefault("QWEN3_OMNI_API_KEY", "test-key")
    os.environ.setdefault("DASHSCOPE_API_KEY", "test-key")

    stubs = _make_stubs()
    installed = []
    for name, mod in stubs.items():
        if name not in sys.modules:
            try:
                __import__(name)  # real package present — don't shadow it
            except Exception:  # noqa: BLE001
                sys.modules[name] = mod
                installed.append(name)

    try:
        spec = importlib.util.spec_from_file_location(_PRIVATE_NAME, main_path)
        module = importlib.util.module_from_spec(spec)
        # Register under the private name so `main.py`'s own internal references
        # resolve, but `import main` elsewhere does NOT pick this up.
        sys.modules[_PRIVATE_NAME] = module
        spec.loader.exec_module(module)
        _cached = module
        return module
    finally:
        # Tear down the stubs we installed so other test modules see the
        # original "deps absent" state and keep their skip behaviour.
        for name in installed:
            sys.modules.pop(name, None)
