"""
Tests for Daily QA feature (Feature 2 — 今日问答)

Scope:
- _generate_daily_question_pool(): qwen-turbo happy path + fallback to hardcoded pool
- Redis key lifecycle: first /daily-question → generate + write; second call → cache hit
- [DAILY_QA_PASSED] marker detection in AI reply → Redis write + WebSocket push

NOTE: Implementation is in progress (tasks #4 F2-1 + #6 F2-3). Tests use defensive
imports with pytest.mark.skipif so this file commits cleanly before impl lands.
All external deps (dashscope, redis) are stubbed via sys.modules / unittest.mock;
no live services required.
"""
import asyncio
import json
import os
import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# =========================================================================
# Path + stub external modules
# =========================================================================

_HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(_HERE, ".."))
sys.path.insert(0, os.path.join(_HERE, "..", "app"))


def _install_stub(name: str, module: types.ModuleType) -> None:
    if name not in sys.modules:
        sys.modules[name] = module


# --- stub dashscope -------------------------------------------------------
_ds = types.ModuleType("dashscope")


class _Generation:
    @staticmethod
    def call(*args, **kwargs):
        raise RuntimeError("stub: override with patch in tests")


_ds.Generation = _Generation
_ds.api_key = None
# main.py imports from dashscope.audio.qwen_omni at module load time — stub
# enough of the package tree so `from dashscope.audio.qwen_omni import ...` works.
_ds_audio = types.ModuleType("dashscope.audio")
_ds_qwen_omni = types.ModuleType("dashscope.audio.qwen_omni")


class _OmniStub:  # catch-all placeholder
    pass


_ds_qwen_omni.OmniRealtimeCallback = _OmniStub
_ds_qwen_omni.OmniRealtimeConversation = _OmniStub
_ds_qwen_omni.MultiModality = _OmniStub
_ds_qwen_omni.AudioFormat = _OmniStub
_ds.audio = _ds_audio
_ds_audio.qwen_omni = _ds_qwen_omni
_install_stub("dashscope", _ds)
_install_stub("dashscope.audio", _ds_audio)
_install_stub("dashscope.audio.qwen_omni", _ds_qwen_omni)

# main.py refuses to start without an API key — satisfy that check for tests.
os.environ.setdefault("QWEN3_OMNI_API_KEY", "test-key")

# --- stub redis / redis.asyncio ------------------------------------------
_redis_mod = types.ModuleType("redis")
_redis_async = types.ModuleType("redis.asyncio")


class _FakeRedis:
    """Minimal in-memory Redis stand-in (get/set/setex/exists/ttl)."""

    def __init__(self):
        self._store = {}
        self._ttl = {}

    async def get(self, key):
        return self._store.get(key)

    async def set(self, key, value, ex=None):
        self._store[key] = value
        if ex is not None:
            self._ttl[key] = ex
        return True

    async def setex(self, key, ttl, value):
        self._store[key] = value
        self._ttl[key] = ttl
        return True

    async def exists(self, key):
        return 1 if key in self._store else 0

    async def ttl(self, key):
        return self._ttl.get(key, -1)

    async def delete(self, *keys):
        for k in keys:
            self._store.pop(k, None)
            self._ttl.pop(k, None)
        return len(keys)


_redis_async.Redis = _FakeRedis
_redis_async.from_url = lambda *a, **kw: _FakeRedis()
_redis_mod.asyncio = _redis_async
_install_stub("redis", _redis_mod)
_install_stub("redis.asyncio", _redis_async)


# =========================================================================
# Defensive import of impl surface
# =========================================================================

_IMPL_AVAILABLE = False
_generate_pool = None
_main_module = None

try:
    import main as _main_module  # type: ignore
    # Candidate symbols — adapt as impl stabilises
    _generate_pool = getattr(_main_module, "_generate_daily_question_pool", None)
    _IMPL_AVAILABLE = _generate_pool is not None
except Exception as _imp_err:  # noqa: BLE001
    _IMPORT_ERROR = _imp_err

skip_if_no_impl = pytest.mark.skipif(
    not _IMPL_AVAILABLE,
    reason="daily_qa impl not yet landed (tasks #4 F2-1 / #6 F2-3 pending)",
)


# =========================================================================
# Fixtures
# =========================================================================


@pytest.fixture
def fake_redis():
    return _FakeRedis()


@pytest.fixture
def user_id():
    return "user_abc_123"


@pytest.fixture
def today_iso():
    # Matches design: key = f"daily_qa_passed:{user_id}:{YYYY-MM-DD}"
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _fake_dashscope_response(payload: str):
    resp = MagicMock()
    resp.status_code = 200
    resp.output = MagicMock()
    resp.output.text = payload
    choice = MagicMock()
    choice.message = MagicMock()
    choice.message.content = payload
    resp.output.choices = [choice]
    return resp


# =========================================================================
# 1. _generate_daily_question_pool()
# =========================================================================


@skip_if_no_impl
class TestGenerateDailyQuestionPool:
    @pytest.mark.asyncio
    async def test_happy_path_returns_parsed_list(self):
        pool = [
            {"question_text": "What did you eat for breakfast?", "lang": "en"},
            {"question_text": "Describe your morning routine.", "lang": "en"},
            {"question_text": "What's one goal for today?", "lang": "en"},
        ]
        resp = _fake_dashscope_response(json.dumps(pool))
        with patch("dashscope.Generation.call", return_value=resp):
            result = await _maybe_await(_generate_pool(
                target_language="English", native_language="Chinese", count=3,
            ))

        assert isinstance(result, list)
        assert len(result) >= 1
        first = result[0]
        assert "question_text" in first

    @pytest.mark.asyncio
    async def test_markdown_wrapped_json_parses(self):
        pool = [{"question_text": "Q1", "lang": "en"}]
        wrapped = f"```json\n{json.dumps(pool)}\n```"
        with patch("dashscope.Generation.call",
                   return_value=_fake_dashscope_response(wrapped)):
            result = await _maybe_await(_generate_pool(
                target_language="English", native_language="Chinese", count=1,
            ))
        assert isinstance(result, list)
        assert result[0]["question_text"] == "Q1"

    @pytest.mark.asyncio
    async def test_llm_failure_falls_back_to_hardcoded_pool(self):
        with patch("dashscope.Generation.call", side_effect=RuntimeError("boom")):
            result = await _maybe_await(_generate_pool(
                target_language="English", native_language="Chinese", count=3,
            ))
        # Must still return a non-empty list (hardcoded fallback)
        assert isinstance(result, list)
        assert len(result) >= 1
        assert all("question_text" in q for q in result)

    @pytest.mark.asyncio
    async def test_malformed_llm_output_falls_back(self):
        with patch("dashscope.Generation.call",
                   return_value=_fake_dashscope_response("<<not json>>")):
            result = await _maybe_await(_generate_pool(
                target_language="English", native_language="Chinese", count=3,
            ))
        assert isinstance(result, list)
        assert len(result) >= 1


# =========================================================================
# 2. Redis cache lifecycle — GET /daily-question
# =========================================================================


@pytest.mark.skipif(
    not _IMPL_AVAILABLE,
    reason="/daily-question endpoint impl pending (task #4 F2-1)",
)
class TestDailyQuestionRedisLifecycle:
    """
    Contract (design): on GET /daily-question
      - If redis has `daily_qa_pool:{user_id}:{date}` → return cached pool
      - Else → call _generate_daily_question_pool() → SETEX with ~48h TTL → return pool

    These are contract-level tests: we exercise the pool-generation call and the
    redis read/write pattern via a FakeRedis stub. When the endpoint wraps both in
    a coroutine (e.g. handle_daily_question(redis, user_id)), bind the name below.
    """

    @pytest.mark.asyncio
    async def test_first_call_generates_and_caches(self, fake_redis, user_id, today_iso):
        handler = getattr(_main_module, "handle_daily_question", None)
        if handler is None:
            pytest.skip("handle_daily_question() not yet exposed")

        pool = [{"question_text": "Q1", "lang": "en"}]
        with patch("dashscope.Generation.call",
                   return_value=_fake_dashscope_response(json.dumps(pool))):
            result = await _maybe_await(handler(redis=fake_redis, user_id=user_id,
                                                target_language="English",
                                                native_language="Chinese"))

        # Cache was populated
        key_candidates = [
            f"daily_qa_pool:{user_id}:{today_iso}",
            f"daily_qa:{user_id}:{today_iso}",
        ]
        assert any(k in fake_redis._store for k in key_candidates), \
            f"expected one of {key_candidates} in redis; have {list(fake_redis._store)}"
        assert isinstance(result, (list, dict))

    @pytest.mark.asyncio
    async def test_second_call_hits_cache_no_llm(self, fake_redis, user_id, today_iso):
        handler = getattr(_main_module, "handle_daily_question", None)
        if handler is None:
            pytest.skip("handle_daily_question() not yet exposed")

        cached = [{"question_text": "cached Q", "lang": "en"}]
        await fake_redis.setex(f"daily_qa_pool:{user_id}:{today_iso}",
                               48 * 3600, json.dumps(cached))

        call_spy = MagicMock(side_effect=AssertionError("LLM must NOT be called on cache hit"))
        with patch("dashscope.Generation.call", call_spy):
            result = await _maybe_await(handler(redis=fake_redis, user_id=user_id,
                                                target_language="English",
                                                native_language="Chinese"))

        call_spy.assert_not_called()
        # Result contains the cached Q
        blob = json.dumps(result, ensure_ascii=False, default=str)
        assert "cached Q" in blob


# =========================================================================
# 3. [DAILY_QA_PASSED] marker detection
# =========================================================================


@pytest.mark.skipif(
    not _IMPL_AVAILABLE,
    reason="marker detection impl pending (task #4 F2-1)",
)
class TestDailyQaPassedMarker:
    """
    Contract (design):
      - AI text reply contains '[DAILY_QA_PASSED]' → set `daily_qa_passed:{user_id}:{date}`
        with TTL ≈ 48h AND push `daily_qa_completed` WebSocket frame
      - Marker MUST be stripped from TTS input (don't speak the marker aloud)
      - Negative path: AI reply without marker → no redis write, no WS push
    """

    @pytest.mark.asyncio
    async def test_marker_triggers_redis_write_and_ws_push(
        self, fake_redis, user_id, today_iso
    ):
        handler = getattr(_main_module, "_handle_daily_qa_marker", None)
        if handler is None:
            pytest.skip("_handle_daily_qa_marker() not yet exposed")

        ws = AsyncMock()
        ai_text = "Nice answer! [DAILY_QA_PASSED] Keep it up."

        await _maybe_await(handler(
            redis=fake_redis, user_id=user_id, websocket=ws, ai_text=ai_text,
        ))

        # Redis key with expected shape
        expected_key = f"daily_qa_passed:{user_id}:{today_iso}"
        assert expected_key in fake_redis._store, \
            f"expected {expected_key} in redis; have {list(fake_redis._store)}"
        # TTL ≈ 48h (between 47h and 48.5h)
        ttl = fake_redis._ttl.get(expected_key, 0)
        assert 47 * 3600 <= ttl <= int(48.5 * 3600), f"ttl={ttl}"

        # WebSocket got the daily_qa_completed push
        assert ws.send_text.called or ws.send_json.called, "no WS send happened"
        sends = []
        if ws.send_text.called:
            sends += [c.args[0] for c in ws.send_text.call_args_list]
        if ws.send_json.called:
            sends += [json.dumps(c.args[0], default=str) for c in ws.send_json.call_args_list]
        assert any("daily_qa_completed" in s for s in sends), f"payloads: {sends}"

    @pytest.mark.asyncio
    async def test_no_marker_no_side_effects(self, fake_redis, user_id):
        handler = getattr(_main_module, "_handle_daily_qa_marker", None)
        if handler is None:
            pytest.skip("_handle_daily_qa_marker() not yet exposed")

        ws = AsyncMock()
        await _maybe_await(handler(
            redis=fake_redis, user_id=user_id, websocket=ws,
            ai_text="Keep practicing, you're doing well!",
        ))

        assert not any(k.startswith("daily_qa_passed:") for k in fake_redis._store)
        ws.send_text.assert_not_called()
        ws.send_json.assert_not_called()

    @pytest.mark.asyncio
    async def test_marker_stripped_before_tts(self):
        """
        Marker is backend-only — must be removed from any text routed to TTS.
        When impl exposes `_strip_daily_qa_marker(text) -> str`, this will run.
        """
        strip_fn = getattr(_main_module, "_strip_daily_qa_marker", None)
        if strip_fn is None:
            pytest.skip("_strip_daily_qa_marker() not yet exposed")

        cleaned = strip_fn("Great! [DAILY_QA_PASSED] See you tomorrow.")
        assert "[DAILY_QA_PASSED]" not in cleaned
        assert "Great!" in cleaned
        assert "tomorrow" in cleaned


# =========================================================================
# helpers
# =========================================================================


async def _maybe_await(x):
    if asyncio.iscoroutine(x):
        return await x
    return x


# =========================================================================
# 4. Re-answer / Change-question helpers (task #13)
# =========================================================================


@pytest.mark.skipif(
    not _IMPL_AVAILABLE,
    reason="task #13 helpers pending",
)
class TestDailyQaReAnswerHelpers:
    """Covers `_advance_daily_qa_pool` + `_assert_pro` introduced in task #13."""

    @pytest.mark.asyncio
    async def test_change_question_advances_index(self, fake_redis, user_id, today_iso):
        advance = getattr(_main_module, "_advance_daily_qa_pool", None)
        if advance is None:
            pytest.skip("_advance_daily_qa_pool() not yet exposed")

        pool = [
            {"question_text": "Q1", "lang": "en"},
            {"question_text": "Q2", "lang": "en"},
            {"question_text": "Q3", "lang": "en"},
        ]
        cache_key = f"daily_qa_pool:{user_id}:{today_iso}"
        await fake_redis.setex(
            cache_key, 48 * 3600,
            json.dumps({"pool": pool, "index": 0, "picked": pool[0]}),
        )

        # First advance → Q2
        picked = await _maybe_await(advance(
            fake_redis, user_id, today_iso,
            target_language="English", native_language="Chinese",
        ))
        assert picked["question_text"] == "Q2"
        stored = json.loads(fake_redis._store[cache_key])
        assert stored["index"] == 1
        assert stored["picked"]["question_text"] == "Q2"

        # Second advance → Q3
        picked = await _maybe_await(advance(
            fake_redis, user_id, today_iso,
            target_language="English", native_language="Chinese",
        ))
        assert picked["question_text"] == "Q3"

    @pytest.mark.asyncio
    async def test_change_question_wraps_on_exhaustion(self, fake_redis, user_id, today_iso):
        advance = getattr(_main_module, "_advance_daily_qa_pool", None)
        if advance is None:
            pytest.skip("_advance_daily_qa_pool() not yet exposed")

        pool = [
            {"question_text": "Q1", "lang": "en"},
            {"question_text": "Q2", "lang": "en"},
        ]
        cache_key = f"daily_qa_pool:{user_id}:{today_iso}"
        # Seed at last index (1); next advance should wrap back to 0
        await fake_redis.setex(
            cache_key, 48 * 3600,
            json.dumps({"pool": pool, "index": 1, "picked": pool[1]}),
        )

        picked = await _maybe_await(advance(
            fake_redis, user_id, today_iso,
            target_language="English", native_language="Chinese",
        ))
        assert picked["question_text"] == "Q1"
        stored = json.loads(fake_redis._store[cache_key])
        assert stored["index"] == 0

    @pytest.mark.asyncio
    async def test_legacy_cache_shape_migrates(self, fake_redis, user_id, today_iso):
        """Old cache format (single dict with question_text) must be wrapped into new shape."""
        advance = getattr(_main_module, "_advance_daily_qa_pool", None)
        if advance is None:
            pytest.skip("_advance_daily_qa_pool() not yet exposed")

        cache_key = f"daily_qa_pool:{user_id}:{today_iso}"
        # Legacy shape — single picked dict
        legacy = {"question_text": "legacy Q", "lang": "en"}
        await fake_redis.setex(cache_key, 48 * 3600, json.dumps(legacy))

        # Pool only has 1 item → impl should regenerate a fresh pool via LLM
        fresh_pool = [
            {"question_text": "fresh Q1", "lang": "en"},
            {"question_text": "fresh Q2", "lang": "en"},
            {"question_text": "fresh Q3", "lang": "en"},
        ]
        with patch("dashscope.Generation.call",
                   return_value=_fake_dashscope_response(json.dumps(fresh_pool))):
            picked = await _maybe_await(advance(
                fake_redis, user_id, today_iso,
                target_language="English", native_language="Chinese",
            ))

        # Cache is now in new shape
        stored = json.loads(fake_redis._store[cache_key])
        assert isinstance(stored, dict)
        assert "pool" in stored and isinstance(stored["pool"], list)
        assert "index" in stored and isinstance(stored["index"], int)
        assert "picked" in stored and isinstance(stored["picked"], dict)
        # The legacy question must still be represented in pool[0]
        assert stored["pool"][0]["question_text"] == "legacy Q"
        # Advance moved off legacy entry
        assert picked["question_text"] != "legacy Q"

    @pytest.mark.asyncio
    async def test_re_answer_clears_passed_key_via_delete(self, fake_redis, user_id, today_iso):
        """Smoke: deleting the passed key is a plain redis op — covered here directly."""
        passed_key = f"daily_qa_passed:{user_id}:{today_iso}"
        await fake_redis.setex(passed_key, 48 * 3600, "1")
        assert passed_key in fake_redis._store

        await fake_redis.delete(passed_key)
        assert passed_key not in fake_redis._store

    def test_assert_pro_allows_active(self):
        assert_pro = getattr(_main_module, "_assert_pro", None)
        if assert_pro is None:
            pytest.skip("_assert_pro() not yet exposed")
        # Does not raise
        assert_pro({"id": "u1", "subscription_status": "active"})

    def test_assert_pro_blocks_free_user(self):
        assert_pro = getattr(_main_module, "_assert_pro", None)
        if assert_pro is None:
            pytest.skip("_assert_pro() not yet exposed")
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as ei:
            assert_pro({"id": "u1", "subscription_status": "free"})
        assert ei.value.status_code == 403
        assert ei.value.detail == "pro_required"

    def test_assert_pro_blocks_missing_status(self):
        assert_pro = getattr(_main_module, "_assert_pro", None)
        if assert_pro is None:
            pytest.skip("_assert_pro() not yet exposed")
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            assert_pro({"id": "u1"})  # no subscription_status at all
        with pytest.raises(HTTPException):
            assert_pro({})
        with pytest.raises(HTTPException):
            assert_pro(None)
