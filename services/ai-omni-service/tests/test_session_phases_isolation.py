"""
Tests for session_phases composite key isolation: f"{user_id}:{scenario}"

Covers:
- Different users, same scenario → isolated
- Same user, different scenarios → isolated
- State modification does not pollute sibling keys
"""
import pytest
from collections import OrderedDict
import time as _time


class _TTLDict:
    """Mirror of _TTLDict from main.py for testing."""
    def __init__(self, ttl: int, maxsize: int):
        self._ttl = ttl
        self._maxsize = maxsize
        self._store: OrderedDict = OrderedDict()

    def _now(self) -> float:
        return _time.monotonic()

    def _is_expired(self, ts: float) -> bool:
        return (self._now() - ts) > self._ttl

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

    def __delitem__(self, key):
        del self._store[key]

    def setdefault(self, key, default=None):
        existing = self.get(key)
        if existing is not None:
            return existing
        self[key] = default
        return default

    def copy_value(self, key):
        v = self.get(key)
        return v.copy() if isinstance(v, dict) else v


def make_phase_key(user_id: str, scenario: str) -> str:
    return f"{user_id}:{scenario or ''}"


def default_phase_state(task_index=0):
    return {
        "phase": "magic_repetition",
        "task_index": task_index,
        "magic_positive_streak": 0,
        "memory_mode": False,
    }


@pytest.fixture
def sp():
    return _TTLDict(ttl=3600, maxsize=100)


class TestDifferentUsersSameScenario:
    """Different users with the same scenario should be fully isolated."""

    def test_keys_are_distinct(self, sp):
        key_a = make_phase_key("user_a", "greeting")
        key_b = make_phase_key("user_b", "greeting")
        assert key_a != key_b
        assert key_a == "user_a:greeting"
        assert key_b == "user_b:greeting"

    def test_independent_state(self, sp):
        sp["user_a:greeting"] = default_phase_state(task_index=0)
        sp["user_b:greeting"] = default_phase_state(task_index=0)

        # Advance user_a
        state_a = sp.get("user_a:greeting")
        state_a["task_index"] = 3
        state_a["phase"] = "scene_theater"
        sp["user_a:greeting"] = state_a

        # user_b should be unchanged
        state_b = sp.get("user_b:greeting")
        assert state_b["task_index"] == 0
        assert state_b["phase"] == "magic_repetition"

    def test_delete_one_keeps_other(self, sp):
        sp["user_a:greeting"] = default_phase_state()
        sp["user_b:greeting"] = default_phase_state()

        del sp["user_a:greeting"]

        assert "user_a:greeting" not in sp
        assert "user_b:greeting" in sp


class TestSameUserDifferentScenarios:
    """Same user with different scenarios should be fully isolated."""

    def test_keys_are_distinct(self, sp):
        key1 = make_phase_key("user1", "greeting")
        key2 = make_phase_key("user1", "shopping")
        key3 = make_phase_key("user1", "")
        assert key1 == "user1:greeting"
        assert key2 == "user1:shopping"
        assert key3 == "user1:"
        assert key1 != key2 != key3

    def test_independent_state(self, sp):
        sp["user1:greeting"] = default_phase_state(task_index=0)
        sp["user1:shopping"] = default_phase_state(task_index=0)
        sp["user1:"] = default_phase_state(task_index=0)

        # Advance greeting only
        state_g = sp.get("user1:greeting")
        state_g["task_index"] = 5
        state_g["phase"] = "scene_theater"
        state_g["memory_mode"] = True
        sp["user1:greeting"] = state_g

        # shopping and empty should be untouched
        state_s = sp.get("user1:shopping")
        assert state_s["task_index"] == 0
        assert state_s["phase"] == "magic_repetition"
        assert state_s["memory_mode"] is False

        state_e = sp.get("user1:")
        assert state_e["task_index"] == 0

    def test_new_scenario_starts_fresh(self, sp):
        """Switching to a new scenario should get default state via setdefault."""
        sp["user1:greeting"] = {"phase": "scene_theater", "task_index": 5}

        # New scenario — setdefault initializes from scratch
        new_state = sp.setdefault("user1:travel", default_phase_state())
        assert new_state["phase"] == "magic_repetition"
        assert new_state["task_index"] == 0

        # Original scenario unchanged
        assert sp.get("user1:greeting")["task_index"] == 5


class TestStateMutationIsolation:
    """Modifying state of one key must not pollute sibling keys."""

    def test_dict_mutation_not_shared(self, sp):
        """Each key's dict value should be independent (no shared references)."""
        base = default_phase_state()
        sp["user1:greeting"] = base.copy()
        sp["user1:shopping"] = base.copy()

        # Mutate via get → modify → set
        g = sp.get("user1:greeting")
        g["task_index"] = 99
        g["magic_positive_streak"] = 10
        sp["user1:greeting"] = g

        s = sp.get("user1:shopping")
        assert s["task_index"] == 0
        assert s["magic_positive_streak"] == 0

    def test_copy_value_returns_independent_copy(self, sp):
        """copy_value should return a shallow copy, not a reference."""
        sp["user1:greeting"] = default_phase_state()

        copy1 = sp.copy_value("user1:greeting")
        copy1["task_index"] = 999

        original = sp.get("user1:greeting")
        assert original["task_index"] == 0

    def test_reset_one_preserves_sibling(self, sp):
        """Resetting one scenario should not affect another."""
        sp["user1:greeting"] = {
            "phase": "scene_theater",
            "task_index": 5,
            "magic_positive_streak": 3,
            "memory_mode": True,
        }
        sp["user1:shopping"] = {
            "phase": "scene_theater",
            "task_index": 4,
            "magic_positive_streak": 2,
            "memory_mode": True,
        }

        # Reset greeting
        sp["user1:greeting"] = default_phase_state()

        # shopping should remain unchanged
        shopping = sp.get("user1:shopping")
        assert shopping["phase"] == "scene_theater"
        assert shopping["task_index"] == 4
        assert shopping["magic_positive_streak"] == 2
        assert shopping["memory_mode"] is True

    def test_many_users_many_scenarios(self, sp):
        """Stress test: multiple users × multiple scenarios, all independent."""
        users = [f"user_{i}" for i in range(5)]
        scenarios = ["greeting", "shopping", "travel", "coffee"]

        # Initialize all
        for u in users:
            for s in scenarios:
                sp[f"{u}:{s}"] = default_phase_state()

        # Advance specific combination
        sp["user_2:travel"] = {
            "phase": "scene_theater",
            "task_index": 8,
            "magic_positive_streak": 5,
            "memory_mode": True,
        }

        # All others should still be default
        for u in users:
            for s in scenarios:
                if u == "user_2" and s == "travel":
                    state = sp.get(f"{u}:{s}")
                    assert state["task_index"] == 8
                else:
                    state = sp.get(f"{u}:{s}")
                    assert state["task_index"] == 0, f"Polluted: {u}:{s}"
                    assert state["phase"] == "magic_repetition", f"Polluted: {u}:{s}"
