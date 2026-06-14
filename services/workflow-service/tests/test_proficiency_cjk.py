"""
Tests for CJK-specific sentence_quality_factor thresholds in
ProficiencyScoringWorkflow._score_task_relevance.

The scorer applies a sentence_quality_factor in _score_task_relevance:
- CJK languages (Japanese/Chinese/Korean/Mandarin/Cantonese): _min_len=4, _min_remaining=2
- All other languages: _min_len=8, _min_remaining=4

Branches:
- len(stripped) < _min_len           → factor 0.6
- hit_count>0 and remaining<_min_remaining (after stripping matched kw) → 0.7
- otherwise                          → 1.0

These tests pin the CJK path: short CJK sentences (len>=4) are NOT penalized to
0.6 the way the non-CJK path would, keyword-only CJK (remaining<2) → 0.7, and a
substantial CJK sentence → 1.0. Semantic Signal 1 is forced unavailable
(_semantic_similarity → None) so input_score reduces to the pure keyword signal,
isolating the quality factor under test.

Import style mirrors tests/test_proficiency_scoring.py.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import os

# Add src to path so we can import the workflow
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from workflows.proficiency_scoring import ProficiencyScoringWorkflow


@pytest.fixture
def workflow():
    return ProficiencyScoringWorkflow()


def _patch_no_semantic(workflow):
    """Force Signal 1 (embedding) unavailable so input_score == keyword score.

    This isolates the sentence_quality_factor under test from the semantic
    rescue path (which would otherwise lift input_score independent of length).
    """
    workflow._semantic_similarity = MagicMock(return_value=None)


# ============================================================
# CJK: short sentences (len>=4) are NOT penalized to 0.6
# ============================================================

class TestCjkShortSentenceNotPenalized:
    """CJK _min_len=4: a 4-7 char CJK sentence must NOT hit the 0.6 short branch,
    whereas the same length under a non-CJK language (8/4) WOULD be penalized."""

    @pytest.fixture
    def jp_task(self):
        return {
            "id": 1,
            "task_description": "同僚に挨拶する",
            "scenario_title": "挨拶",
            "target_language": "Japanese",
        }

    @pytest.mark.asyncio
    async def test_japanese_short_two_hits_full_quality(self, workflow, jp_task):
        """2 hits (kw_score=7), CJK input len>=4 with substantial remaining → quality=1.0.

        "おはようございます" is 9 chars; matched keywords "おはよう","ござい" leave
        "ます" (2 chars) >= _min_remaining(2) → not the 0.7 branch, and 9 >= 4 → not 0.6.
        """
        turns = [
            {"role": "user", "content": "おはようございます"},
            {"role": "assistant", "content": "いいですね！"},
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["おはよう", "ござい"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            _patch_no_semantic(workflow)
            result = await workflow._score_task_relevance(turns, jp_task, "Japanese")
        # input_score=7 (2 hits) * penalty=1.0 * quality=1.0 = 7
        assert result["signals"]["hit_count"] == 2
        assert result["signals"]["quality"] == 1.0
        assert result["score"] == 7

    @pytest.mark.asyncio
    async def test_japanese_len5_zero_hits_not_short_penalized(self, workflow, jp_task):
        """5-char CJK input with 0 keyword hits: CJK _min_len=4 → NOT the 0.6 branch.

        kw_score=2, hit_count=0 so the 0.7 branch is skipped (requires hit_count>0),
        quality stays 1.0 → final = round(2*1.0*1.0) = 2.
        Contrast: the same 5-char input under English (_min_len=8) WOULD be 0.6 → 1.
        """
        turns = [
            {"role": "user", "content": "ありがとう"},  # 5 chars
            {"role": "assistant", "content": "どういたしまして"},
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["挨拶", "おはよう", "こんにちは"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            _patch_no_semantic(workflow)
            result = await workflow._score_task_relevance(turns, jp_task, "Japanese")
        assert result["signals"]["hit_count"] == 0
        assert result["signals"]["quality"] == 1.0  # NOT penalized to 0.6
        assert result["score"] == 2

    @pytest.mark.asyncio
    async def test_non_cjk_same_len5_is_short_penalized(self, workflow):
        """Control: identical 5-char input under English (non-CJK, _min_len=8) → 0.6.

        Proves the CJK threshold genuinely diverges from the default path.
        """
        en_task = {
            "id": 2,
            "task_description": "Greet a colleague",
            "scenario_title": "Greeting",
            "target_language": "English",
        }
        turns = [
            {"role": "user", "content": "thanx"},  # 5 chars, < 8
            {"role": "assistant", "content": "You're welcome"},
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["greet", "hello", "morning"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            _patch_no_semantic(workflow)
            result = await workflow._score_task_relevance(turns, en_task, "English")
        assert result["signals"]["hit_count"] == 0
        assert result["signals"]["quality"] == 0.6  # English 5<8 → penalized
        assert result["score"] == 1  # round(2 * 0.6) = 1

    @pytest.mark.asyncio
    async def test_chinese_len4_boundary_not_penalized(self, workflow):
        """Chinese 4-char input == _min_len(4): boundary `len < _min_len` is False → not 0.6."""
        zh_task = {
            "id": 3,
            "task_description": "在咖啡店点单",
            "scenario_title": "咖啡店",
            "target_language": "Chinese",
        }
        turns = [
            {"role": "user", "content": "我要拿铁"},  # 4 chars == _min_len
            {"role": "assistant", "content": "好的"},
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["菜单", "价格", "外带"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            _patch_no_semantic(workflow)
            result = await workflow._score_task_relevance(turns, zh_task, "Chinese")
        assert result["signals"]["hit_count"] == 0
        assert result["signals"]["quality"] == 1.0  # 4 is NOT < 4
        assert result["score"] == 2


# ============================================================
# CJK: keyword-only (remaining < _min_remaining=2) → 0.7
# ============================================================

class TestCjkKeywordOnlyFactor:
    """CJK _min_remaining=2: when content is essentially just matched keywords
    (remaining chars < 2 after stripping matches), quality = 0.7."""

    @pytest.fixture
    def zh_task(self):
        return {
            "id": 1,
            "task_description": "在咖啡店点单",
            "scenario_title": "咖啡店",
            "target_language": "Chinese",
        }

    @pytest.mark.asyncio
    async def test_chinese_keyword_only_factor_07(self, workflow, zh_task):
        """Input ">=_min_len but keyword-only" → remaining<2 → 0.7.

        Input "菜单价格好" (5 chars >= _min_len 4). Matched keywords "菜单","价格"
        strip to remaining "好" (1 char < _min_remaining 2) → 0.7.
        2 hits → kw_score=7; final = round(7 * 1.0 * 0.7) = round(4.9) = 5.
        """
        turns = [
            {"role": "user", "content": "菜单价格好"},
            {"role": "assistant", "content": "不错"},
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["菜单", "价格"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            _patch_no_semantic(workflow)
            result = await workflow._score_task_relevance(turns, zh_task, "Chinese")
        assert result["signals"]["hit_count"] == 2
        assert result["signals"]["quality"] == 0.7
        assert result["score"] == 5

    @pytest.mark.asyncio
    async def test_japanese_keyword_only_factor_07(self, workflow):
        """Japanese keyword-only: matched kw leave <2 chars remaining → 0.7."""
        jp_task = {
            "id": 2,
            "task_description": "レストランで注文する",
            "scenario_title": "レストラン",
            "target_language": "Japanese",
        }
        # "メニュー注文を" = 7 chars; kw "メニュー","注文" → remaining "を" (1 < 2) → 0.7
        turns = [
            {"role": "user", "content": "メニュー注文を"},
            {"role": "assistant", "content": "かしこまりました"},
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["メニュー", "注文"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            _patch_no_semantic(workflow)
            result = await workflow._score_task_relevance(turns, jp_task, "Japanese")
        assert result["signals"]["hit_count"] == 2
        assert result["signals"]["quality"] == 0.7
        assert result["score"] == 5


# ============================================================
# CJK: normal sentence → 1.0
# ============================================================

class TestCjkNormalSentenceFactor:
    @pytest.fixture
    def zh_task(self):
        return {
            "id": 1,
            "task_description": "在咖啡店点单",
            "scenario_title": "咖啡店",
            "target_language": "Chinese",
        }

    @pytest.mark.asyncio
    async def test_chinese_normal_sentence_factor_10(self, workflow, zh_task):
        """Substantial CJK sentence with hits and ample non-keyword remaining → 1.0.

        "我想要一杯热拿铁还有菜单" — matched "菜单" leaves >=2 remaining chars, and
        len >= _min_len → quality = 1.0. 1 hit → kw_score=4 → final = round(4*1.0*1.0)=4.
        """
        turns = [
            {"role": "user", "content": "我想要一杯热拿铁还有菜单"},
            {"role": "assistant", "content": "好的，马上来"},
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["菜单", "价格", "外带"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            _patch_no_semantic(workflow)
            result = await workflow._score_task_relevance(turns, zh_task, "Chinese")
        assert result["signals"]["hit_count"] == 1
        assert result["signals"]["quality"] == 1.0
        assert result["score"] == 4

    @pytest.mark.asyncio
    async def test_japanese_normal_two_hits_factor_10(self, workflow):
        """Japanese substantial sentence, 2 hits, ample remaining → 1.0, score=7."""
        jp_task = {
            "id": 2,
            "task_description": "レストランで注文する",
            "scenario_title": "レストラン",
            "target_language": "Japanese",
        }
        turns = [
            {"role": "user", "content": "このメニューから注文をお願いしたいです"},
            {"role": "assistant", "content": "かしこまりました"},
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["メニュー", "注文"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            _patch_no_semantic(workflow)
            result = await workflow._score_task_relevance(turns, jp_task, "Japanese")
        assert result["signals"]["hit_count"] == 2
        assert result["signals"]["quality"] == 1.0
        assert result["score"] == 7


# ============================================================
# CJK threshold recognition: language label casing / synonyms
# ============================================================

class TestCjkLanguageRecognition:
    """_CJK_LANGS membership is case-insensitive (target_language.lower())."""

    @pytest.mark.asyncio
    async def test_mixed_case_japanese_uses_cjk_threshold(self, workflow):
        """'JAPANESE' (upper) still resolves to CJK threshold → 5 chars not penalized."""
        jp_task = {
            "id": 1,
            "task_description": "挨拶する",
            "scenario_title": "挨拶",
            "target_language": "JAPANESE",
        }
        turns = [
            {"role": "user", "content": "ありがとう"},  # 5 chars
            {"role": "assistant", "content": "はい"},
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["挨拶", "おはよう"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            _patch_no_semantic(workflow)
            result = await workflow._score_task_relevance(turns, jp_task, "JAPANESE")
        assert result["signals"]["quality"] == 1.0  # CJK path despite upper-case label

    @pytest.mark.asyncio
    async def test_korean_uses_cjk_threshold(self, workflow):
        """Korean is in _CJK_LANGS → 5-char input not short-penalized."""
        ko_task = {
            "id": 2,
            "task_description": "동료에게 인사하기",
            "scenario_title": "인사",
            "target_language": "Korean",
        }
        turns = [
            {"role": "user", "content": "안녕하세요"},  # 5 chars
            {"role": "assistant", "content": "네"},
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["인사", "안부"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            _patch_no_semantic(workflow)
            result = await workflow._score_task_relevance(turns, ko_task, "Korean")
        assert result["signals"]["quality"] == 1.0  # Korean CJK → not 0.6
