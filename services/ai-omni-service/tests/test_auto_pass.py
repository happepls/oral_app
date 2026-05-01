"""
Tests for Daily QA auto-pass fallback logic.

The auto-pass mechanism triggers when:
  1. ai_response_count >= 2
  2. AI reply does NOT contain any negative_indicators

negative_indicators include retry/correction words in English, Chinese, and Japanese.
"""
import pytest


NEGATIVE_INDICATORS = [
    "try again", "もう一度", "再试", "再说", "重新",
    "let's try", "could you", "can you try",
    "もう少し", "やり直", "言い直",
    "not quite", "not correct", "incorrect",
    "off-topic", "off topic", "関係ない", "关系不大",
    "话题", "質問に", "question", "about the question",
    "答えてみ", "回答一下", "answer the",
    "今日の質問", "今天的问题", "today's question",
    "日本語で", "in japanese", "in english", "用日语", "用英语",
    "please use", "please answer",
]


def check_auto_pass(ai_text: str, response_count: int) -> bool:
    if response_count < 2:
        return False
    ai_lower = ai_text.lower()
    has_negative = any(ind in ai_lower for ind in NEGATIVE_INDICATORS)
    return not has_negative


class TestAutoPassFallback:

    def test_response_count_below_threshold(self):
        assert check_auto_pass("Great answer! Well done.", 1) is False

    def test_positive_response_at_threshold(self):
        assert check_auto_pass("Great answer! Well done.", 2) is True

    def test_positive_response_above_threshold(self):
        assert check_auto_pass("Excellent work! You nailed it.", 3) is True

    def test_english_negative_try_again(self):
        assert check_auto_pass("Not bad, but try again with more detail.", 2) is False

    def test_english_negative_not_correct(self):
        assert check_auto_pass("That's not correct. Let me help you.", 2) is False

    def test_english_negative_not_quite(self):
        assert check_auto_pass("Not quite right. Can you elaborate?", 2) is False

    def test_english_negative_incorrect(self):
        assert check_auto_pass("That answer is incorrect.", 2) is False

    def test_japanese_negative_mou_ichido(self):
        assert check_auto_pass("もう少し詳しく話してください。", 2) is False

    def test_japanese_negative_yarinao(self):
        assert check_auto_pass("やり直してみましょう。", 2) is False

    def test_chinese_negative_zaishi(self):
        assert check_auto_pass("再试一次吧，加油！", 2) is False

    def test_chinese_negative_chongxin(self):
        assert check_auto_pass("请重新回答一下。", 2) is False

    def test_off_topic_english(self):
        assert check_auto_pass("That seems off-topic. Let's focus on the question.", 2) is False

    def test_wrong_language_prompt(self):
        assert check_auto_pass("Please answer in japanese.", 2) is False

    def test_empty_text_passes(self):
        assert check_auto_pass("", 2) is True

    def test_mixed_positive_negative(self):
        assert check_auto_pass("Good effort, but could you try again?", 2) is False

    def test_case_insensitive(self):
        assert check_auto_pass("TRY AGAIN please.", 2) is False
        assert check_auto_pass("NOT CORRECT at all.", 2) is False


# =========================================================================
# Sync-check: when main.py is importable (CI / Docker), make sure the real
# `_check_auto_pass` behaves identically to the replica above. Catches drift
# if the negative-indicator list ever changes in only one place.
# =========================================================================

import os
import sys
import types

_HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(_HERE, ".."))
sys.path.insert(0, os.path.join(_HERE, "..", "app"))


def _stub(name, mod):
    if name not in sys.modules:
        sys.modules[name] = mod


_ds = types.ModuleType("dashscope")
class _Gen:  # noqa: E701
    @staticmethod
    def call(*a, **kw): pass
_ds.Generation = _Gen
_ds.api_key = None
_ds_audio = types.ModuleType("dashscope.audio")
_ds_omni = types.ModuleType("dashscope.audio.qwen_omni")
class _Stub: pass  # noqa: E701
for _attr in ("OmniRealtimeCallback", "OmniRealtimeConversation", "MultiModality", "AudioFormat"):
    setattr(_ds_omni, _attr, _Stub)
_ds.audio = _ds_audio
_ds_audio.qwen_omni = _ds_omni
_stub("dashscope", _ds)
_stub("dashscope.audio", _ds_audio)
_stub("dashscope.audio.qwen_omni", _ds_omni)

_redis = types.ModuleType("redis")
_redis_async = types.ModuleType("redis.asyncio")
class _R: pass  # noqa: E701
_redis_async.Redis = _R
_redis_async.from_url = lambda *a, **kw: _R()
_redis.asyncio = _redis_async
_stub("redis", _redis)
_stub("redis.asyncio", _redis_async)

os.environ.setdefault("QWEN3_OMNI_API_KEY", "test-key")

_real_impl = None
try:
    import main as _main_module  # type: ignore
    _real_impl = getattr(_main_module, "_check_auto_pass", None)
except Exception:  # noqa: BLE001
    _real_impl = None


@pytest.mark.skipif(
    _real_impl is None,
    reason="main._check_auto_pass not importable (fastapi/httpx not installed locally)",
)
class TestRealImplMatchesReplica:
    """Run the same fixtures against the real main.py impl to catch drift."""

    @pytest.mark.parametrize("ai_text,count,expected", [
        ("Great answer! Well done.", 1, False),    # below threshold
        ("Great answer! Well done.", 2, True),     # positive at threshold
        ("Excellent work! You nailed it.", 3, True),
        ("Not bad, but try again with more detail.", 2, False),
        ("That's not correct. Let me help you.", 2, False),
        ("もう少し詳しく話してください。", 2, False),
        ("再试一次吧，加油！", 2, False),
        ("Please answer in japanese.", 2, False),
        ("", 2, True),
        ("TRY AGAIN please.", 2, False),
    ])
    def test_real_matches_expected(self, ai_text, count, expected):
        assert _real_impl(ai_text, count) is expected
