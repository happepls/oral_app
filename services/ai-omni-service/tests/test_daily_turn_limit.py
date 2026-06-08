"""Tests for 每日对话轮次上限 (daily turn limit)."""
import asyncio, json, os, sys, types
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

_HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(_HERE, ".."))
sys.path.insert(0, os.path.join(_HERE, "..", "app"))

def _install_stub(name, module):
    if name not in sys.modules:
        sys.modules[name] = module

# --- stub dashscope (与 test_daily_qa.py 一致) ---
_ds = types.ModuleType("dashscope")
class _Generation:
    @staticmethod
    def call(*a, **k): raise RuntimeError("stub")
_ds.Generation = _Generation
_ds.api_key = None
_ds_audio = types.ModuleType("dashscope.audio")
_ds_qwen_omni = types.ModuleType("dashscope.audio.qwen_omni")
class _OmniStub: pass
_ds_qwen_omni.OmniRealtimeCallback = _OmniStub
_ds_qwen_omni.OmniRealtimeConversation = _OmniStub
_ds_qwen_omni.MultiModality = _OmniStub
_ds_qwen_omni.AudioFormat = _OmniStub
_ds.audio = _ds_audio
_ds_audio.qwen_omni = _ds_qwen_omni
_install_stub("dashscope", _ds)
_install_stub("dashscope.audio", _ds_audio)
_install_stub("dashscope.audio.qwen_omni", _ds_qwen_omni)
os.environ.setdefault("QWEN3_OMNI_API_KEY", "test-key")

# --- stub redis / redis.asyncio （FakeRedis 加 incr/expire） ---
_redis_mod = types.ModuleType("redis")
_redis_async = types.ModuleType("redis.asyncio")
class _FakeRedis:
    def __init__(self):
        self._store = {}
        self._ttl = {}
    async def get(self, key):
        return self._store.get(key)
    async def setex(self, key, ttl, value):
        self._store[key] = value; self._ttl[key] = ttl; return True
    async def incr(self, key):
        self._store[key] = str(int(self._store.get(key, 0)) + 1)
        return int(self._store[key])
    async def expire(self, key, ttl):
        self._ttl[key] = ttl; return True
    async def ttl(self, key):
        return self._ttl.get(key, -1)
_redis_async.Redis = _FakeRedis
_redis_async.from_url = lambda *a, **kw: _FakeRedis()
_redis_mod.asyncio = _redis_async
_install_stub("redis", _redis_mod)
_install_stub("redis.asyncio", _redis_async)

import main as omni  # noqa: E402

@pytest.fixture
def fake_redis():
    return _FakeRedis()

@pytest.fixture
def user_id():
    return "user_abc_123"


@pytest.mark.asyncio
async def test_incr_and_get_daily_turns(fake_redis):
    assert await omni._get_daily_turns(fake_redis, "u1") == 0
    await omni._incr_daily_turns(fake_redis, "u1")
    await omni._incr_daily_turns(fake_redis, "u1")
    assert await omni._get_daily_turns(fake_redis, "u1") == 2
    key = omni._daily_turn_key("u1")
    assert await fake_redis.ttl(key) == 48 * 3600

def test_daily_turn_limit_by_tier():
    assert omni._daily_turn_limit({"subscription_status": "active"}) == omni.PRO_DAILY_TURNS
    assert omni._daily_turn_limit({"subscription_status": "free"}) == omni.FREE_DAILY_TURNS
    assert omni._daily_turn_limit({}) == omni.FREE_DAILY_TURNS
    assert omni._daily_turn_limit(None) == omni.FREE_DAILY_TURNS

@pytest.mark.asyncio
async def test_get_daily_turns_fail_open_on_none_client():
    # rc=None（redis 库缺失 / 初始化失败）→ fail-open 返回 0
    assert await omni._get_daily_turns(None, "u1") == 0

@pytest.mark.asyncio
async def test_get_daily_turns_fail_open_on_redis_error():
    class _Boom:
        async def get(self, *a, **k): raise RuntimeError("redis down")
    assert await omni._get_daily_turns(_Boom(), "u1") == 0

@pytest.mark.asyncio
async def test_incr_fail_open_on_none_client():
    # rc=None → 静默返回 0，不抛
    assert await omni._incr_daily_turns(None, "u1") == 0
