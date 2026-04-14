"""
Tests for /reset-phase endpoint in ai-omni-service

Covers:
- scenario="" key format (f"{user_id}:")
- Non-existent key returns success
- Concurrent request isolation
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
import sys
import os

# We cannot import main.py directly because it requires DASHSCOPE_API_KEY
# and imports heavy dependencies. Instead we test the endpoint logic by
# recreating the relevant pieces.

# Add app dir to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))


# ============================================================
# Standalone _TTLDict import (does not require dashscope)
# ============================================================

from collections import OrderedDict
import time as _time

class _TTLDict:
    """Mirror of the _TTLDict in main.py for testing."""
    def __init__(self, ttl: int, maxsize: int):
        self._ttl = ttl
        self._maxsize = maxsize
        self._store: OrderedDict = OrderedDict()

    def _now(self) -> float:
        return _time.monotonic()

    def _is_expired(self, ts: float) -> bool:
        return (self._now() - ts) > self._ttl

    def _evict_expired(self):
        expired = [k for k, (_, ts) in list(self._store.items()) if self._is_expired(ts)]
        for k in expired:
            del self._store[k]

    def get(self, key, default=None):
        if key not in self._store:
            return default
        value, ts = self._store[key]
        if self._is_expired(ts):
            del self._store[key]
            return default
        self._store.move_to_end(key)
        self._store[key] = (value, self._now())
        return value

    def __contains__(self, key):
        return self.get(key) is not None

    def __setitem__(self, key, value):
        self._store[key] = (value, self._now())
        self._store.move_to_end(key)
        if len(self._store) > self._maxsize:
            self._store.popitem(last=False)

    def copy_value(self, key):
        v = self.get(key)
        return v.copy() if isinstance(v, dict) else v


# ============================================================
# Simulate the reset_phase endpoint logic
# ============================================================

async def reset_phase_logic(session_phases, user_id, scenario):
    """
    Extracted reset logic from main.py's /reset-phase endpoint.
    Auth checks are tested separately; this focuses on state manipulation.
    """
    phase_key = f"{user_id}:{scenario or ''}"
    existed = phase_key in session_phases
    if existed:
        old_phase = session_phases.copy_value(phase_key)
        session_phases[phase_key] = {
            "phase": "magic_repetition",
            "task_index": 0,
            "magic_positive_streak": 0,
            "memory_mode": False,
        }
        return {"success": True, "existed": True, "old_phase": old_phase, "phase_key": phase_key}
    else:
        return {"success": True, "existed": False, "phase_key": phase_key}


# ============================================================
# Tests
# ============================================================

class TestResetPhaseKeyFormat:
    @pytest.mark.asyncio
    async def test_empty_scenario_key_format(self):
        """scenario="" → key = "user_id:" """
        sp = _TTLDict(ttl=3600, maxsize=100)
        sp["user1:"] = {"phase": "scene_theater", "task_index": 2}
        result = await reset_phase_logic(sp, "user1", "")
        assert result["phase_key"] == "user1:"
        assert result["existed"] is True

    @pytest.mark.asyncio
    async def test_none_scenario_key_format(self):
        """scenario=None → key = "user_id:" (same as empty)"""
        sp = _TTLDict(ttl=3600, maxsize=100)
        sp["user1:"] = {"phase": "scene_theater", "task_index": 2}
        result = await reset_phase_logic(sp, "user1", None)
        assert result["phase_key"] == "user1:"
        assert result["existed"] is True

    @pytest.mark.asyncio
    async def test_with_scenario_key_format(self):
        """scenario="greeting" → key = "user1:greeting" """
        sp = _TTLDict(ttl=3600, maxsize=100)
        sp["user1:greeting"] = {"phase": "magic_repetition", "task_index": 1}
        result = await reset_phase_logic(sp, "user1", "greeting")
        assert result["phase_key"] == "user1:greeting"
        assert result["existed"] is True


class TestResetPhaseNonExistentKey:
    @pytest.mark.asyncio
    async def test_nonexistent_key_returns_success(self):
        """Non-existent key → success but existed=False"""
        sp = _TTLDict(ttl=3600, maxsize=100)
        result = await reset_phase_logic(sp, "unknown_user", "some_scenario")
        assert result["success"] is True
        assert result["existed"] is False

    @pytest.mark.asyncio
    async def test_nonexistent_does_not_create_entry(self):
        """Non-existent key should NOT create an entry in session_phases"""
        sp = _TTLDict(ttl=3600, maxsize=100)
        await reset_phase_logic(sp, "user_x", "scenario_y")
        assert "user_x:scenario_y" not in sp


class TestResetPhaseState:
    @pytest.mark.asyncio
    async def test_reset_restores_default_state(self):
        """After reset, state should be magic_repetition defaults"""
        sp = _TTLDict(ttl=3600, maxsize=100)
        sp["user1:greeting"] = {
            "phase": "scene_theater",
            "task_index": 5,
            "magic_positive_streak": 3,
            "memory_mode": True,
        }
        await reset_phase_logic(sp, "user1", "greeting")
        state = sp.get("user1:greeting")
        assert state["phase"] == "magic_repetition"
        assert state["task_index"] == 0
        assert state["magic_positive_streak"] == 0
        assert state["memory_mode"] is False


class TestResetPhaseConcurrency:
    @pytest.mark.asyncio
    async def test_concurrent_requests_isolation(self):
        """Concurrent reset requests for different users should be isolated"""
        sp = _TTLDict(ttl=3600, maxsize=100)
        sp["user_a:scenario1"] = {"phase": "scene_theater", "task_index": 3}
        sp["user_b:scenario1"] = {"phase": "scene_theater", "task_index": 5}

        results = await asyncio.gather(
            reset_phase_logic(sp, "user_a", "scenario1"),
            reset_phase_logic(sp, "user_b", "scenario1"),
        )

        # Both should succeed
        assert results[0]["success"] is True
        assert results[1]["success"] is True

        # Both should be reset independently
        state_a = sp.get("user_a:scenario1")
        state_b = sp.get("user_b:scenario1")
        assert state_a["phase"] == "magic_repetition"
        assert state_b["phase"] == "magic_repetition"
        assert state_a["task_index"] == 0
        assert state_b["task_index"] == 0

    @pytest.mark.asyncio
    async def test_concurrent_same_user_different_scenarios(self):
        """Concurrent reset for same user, different scenarios"""
        sp = _TTLDict(ttl=3600, maxsize=100)
        sp["user1:greeting"] = {"phase": "scene_theater", "task_index": 2}
        sp["user1:shopping"] = {"phase": "scene_theater", "task_index": 4}

        results = await asyncio.gather(
            reset_phase_logic(sp, "user1", "greeting"),
            reset_phase_logic(sp, "user1", "shopping"),
        )

        assert results[0]["phase_key"] == "user1:greeting"
        assert results[1]["phase_key"] == "user1:shopping"
        assert sp.get("user1:greeting")["task_index"] == 0
        assert sp.get("user1:shopping")["task_index"] == 0