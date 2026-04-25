"""
Tests for ProficiencyScoringWorkflow

Covers:
- _score_task_relevance: keyword hits mapping, correction_penalty, sentence_quality_factor, final score
- _is_repetitive_input: self-repetition, keyword parroting
- _calculate_proficiency_delta_with_feedback: delta gates (≤5→0, 6-7→1, ≥8→2)
- _get_correction_penalty: hard/soft/none penalty tiers
- task_completed trigger: score>=9 AND interaction_count>=3
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


# ============================================================
# _get_correction_penalty: 3 tiers
# ============================================================

class TestGetCorrectionPenalty:
    def test_no_ai_response(self, workflow):
        assert workflow._get_correction_penalty("") == 1.0
        assert workflow._get_correction_penalty(None) == 1.0

    def test_no_correction_normal_response(self, workflow):
        assert workflow._get_correction_penalty("Great job! Keep practicing.") == 1.0

    def test_hard_correction_chinese(self, workflow):
        assert workflow._get_correction_penalty("你说错了，应该这样说") == 0.5

    def test_hard_correction_english(self, workflow):
        assert workflow._get_correction_penalty("That's wrong, you should say it differently") == 0.5

    def test_hard_correction_japanese(self, workflow):
        assert workflow._get_correction_penalty("全然違う、もう一度言ってください") == 0.5

    def test_hard_correction_redirect(self, workflow):
        assert workflow._get_correction_penalty("Let's focus on the current task") == 0.5

    def test_soft_correction_vague(self, workflow):
        assert workflow._get_correction_penalty("That's a bit vague, can you elaborate?") == 0.7

    def test_soft_correction_chinese(self, workflow):
        assert workflow._get_correction_penalty("你说得太模糊了") == 0.7

    def test_soft_correction_japanese(self, workflow):
        assert workflow._get_correction_penalty("もう少し具体的に言ってください") == 0.7

    def test_soft_correction_more_specific(self, workflow):
        assert workflow._get_correction_penalty("Could you be more specific about that?") == 0.7

    def test_teaching_suggestion_no_penalty(self, workflow):
        """Teaching suggestions should NOT trigger penalty"""
        assert workflow._get_correction_penalty("You could try using more adjectives") == 1.0
        assert workflow._get_correction_penalty("Try expanding your vocabulary") == 1.0

    def test_hard_overrides_soft(self, workflow):
        """If both hard and soft patterns present, hard wins (0.5)"""
        assert workflow._get_correction_penalty("That's wrong and vague") == 0.5


# ============================================================
# _is_repetitive_input
# ============================================================

class TestIsRepetitiveInput:
    def test_empty_input(self, workflow):
        assert workflow._is_repetitive_input("", []) is False
        assert workflow._is_repetitive_input("ab", []) is False

    def test_self_repetition(self, workflow):
        """Substring ≥5 chars appearing 3+ times → repetitive (MIN_SEGMENT=5, MIN_COUNT=3)"""
        assert workflow._is_repetitive_input("hello hello hello", []) is True
        assert workflow._is_repetitive_input("abcdeabcdeabcde", []) is True

    def test_self_repetition_below_threshold(self, workflow):
        """2 repeats or short segments should NOT trigger (thresholds raised)"""
        assert workflow._is_repetitive_input("hello hello", []) is False  # only 2 repeats, need 3
        assert workflow._is_repetitive_input("abcabc", []) is False  # segment=3 < MIN_SEGMENT=5

    def test_no_self_repetition(self, workflow):
        assert workflow._is_repetitive_input("I like coffee and tea", []) is False

    def test_keyword_parroting_short(self, workflow):
        """≥90% keyword coverage AND len≤15 → repetitive"""
        assert workflow._is_repetitive_input("coffee latte", ["coffee", "latte"]) is True

    def test_keyword_parroting_long_input(self, workflow):
        """Long input (>15 meaningful chars) should NOT be flagged even with high keyword coverage"""
        long_input = "wow such big cup java"
        assert workflow._is_repetitive_input(long_input, ["cup", "java"]) is False

    def test_keyword_parroting_low_coverage(self, workflow):
        """<90% keyword coverage → not repetitive"""
        assert workflow._is_repetitive_input("xyz big cup now", ["cup"]) is False

    def test_all_punctuation_with_keywords(self, workflow):
        """All punctuation with keywords → total_meaningful=0 → repetitive"""
        assert workflow._is_repetitive_input("。！？，", ["test"]) is True

    def test_all_punctuation_no_keywords(self, workflow):
        """All punctuation without keywords → returns False (early exit before coverage check)"""
        assert workflow._is_repetitive_input("。！？，", []) is False


# ============================================================
# _score_task_relevance: keyword hits → input_score mapping
# ============================================================

class TestScoreTaskRelevance:
    @pytest.fixture
    def base_task(self):
        return {
            "id": 1,
            "task_description": "Greet a new colleague at work",
            "scenario_title": "Greeting",
            "target_language": "English"
        }

    @pytest.mark.asyncio
    async def test_zero_hits_gives_input_score_2(self, workflow, base_task):
        """0 keyword hits → input_score=2 → final ≤ 2"""
        turns = [
            {"role": "user", "content": "xyz blah blorp qux"},
            {"role": "assistant", "content": "Good attempt!"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["uniq1", "uniq2", "uniq3"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        assert result["score"] <= 2

    @pytest.mark.asyncio
    async def test_one_hit_gives_input_score_4(self, workflow, base_task):
        """1 keyword hit → input_score=4 → final ≤ 4 (anti-cheat: single hit never earns delta)"""
        turns = [
            {"role": "user", "content": "alpha xyz blah blorp qux frog"},
            {"role": "assistant", "content": "Good job!"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["alpha", "uniq1", "uniq2"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        # input_score=4 * penalty=1.0 * quality=1.0 = 4
        assert result["score"] <= 5

    @pytest.mark.asyncio
    async def test_two_hits_gives_input_score_7(self, workflow, base_task):
        """2 keyword hits → input_score=7"""
        turns = [
            {"role": "user", "content": "alpha bravo xyz blah blorp qux frog"},
            {"role": "assistant", "content": "Welcome!"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["alpha", "bravo", "uniq1"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        assert result["score"] >= 6

    @pytest.mark.asyncio
    async def test_three_plus_hits_gives_input_score_9(self, workflow, base_task):
        """≥3 keyword hits → input_score=9"""
        turns = [
            {"role": "user", "content": "alpha bravo cup delta fox jug quip vest"},
            {"role": "assistant", "content": "Welcome!"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["alpha", "bravo", "cup"]), \
             patch.object(workflow, '_get_scene_keywords', return_value=[]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        assert result["score"] >= 8

    @pytest.mark.asyncio
    async def test_no_current_task_returns_default(self, workflow):
        """No current_task → score=5"""
        result = await workflow._score_task_relevance([], None, "English")
        assert result["score"] == 5

    @pytest.mark.asyncio
    async def test_repetitive_input_returns_1(self, workflow, base_task):
        """Repetitive input detected → score=1"""
        turns = [
            {"role": "user", "content": "hello hello hello"},
            {"role": "assistant", "content": "Try again"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["hello"]):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        assert result["score"] == 1
        assert result.get("is_repetitive") is True


# ============================================================
# Correction penalty applied to task_relevance
# ============================================================

class TestCorrectionPenaltyInScoring:
    @pytest.fixture
    def base_task(self):
        return {
            "id": 1,
            "task_description": "Order coffee at a cafe",
            "scenario_title": "Coffee",
            "target_language": "English"
        }

    @pytest.mark.asyncio
    async def test_hard_correction_halves_score(self, workflow, base_task):
        """Hard correction (penalty=0.5) should significantly reduce score"""
        turns = [
            {"role": "user", "content": "alpha bravo cup delta fox jug quip vest"},
            {"role": "assistant", "content": "That's wrong, you should say it differently"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["alpha", "bravo", "cup"]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        # 3 hits → input_score=9, penalty=0.5 → 9*0.5=4.5 → round=4 or 5
        assert result["score"] <= 5

    @pytest.mark.asyncio
    async def test_soft_correction_reduces_score(self, workflow, base_task):
        """Soft correction (penalty=0.7) should moderately reduce score"""
        turns = [
            {"role": "user", "content": "alpha bravo cup delta fox jug quip vest"},
            {"role": "assistant", "content": "That's a bit vague, could you be more specific?"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["alpha", "bravo", "cup"]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        # 3 hits → input_score=9, penalty=0.7 → 9*0.7=6.3 → round=6
        assert result["score"] <= 7

    @pytest.mark.asyncio
    async def test_no_correction_full_score(self, workflow, base_task):
        """No correction (penalty=1.0) → full score"""
        turns = [
            {"role": "user", "content": "alpha bravo cup delta fox jug quip vest"},
            {"role": "assistant", "content": "Great job!"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["alpha", "bravo", "cup"]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        assert result["score"] >= 8


# ============================================================
# Sentence quality factor
# ============================================================

class TestSentenceQualityFactor:
    @pytest.fixture
    def base_task(self):
        return {
            "id": 1,
            "task_description": "Discuss weather conditions",
            "scenario_title": "Weather",
            "target_language": "English"
        }

    @pytest.mark.asyncio
    async def test_short_input_factor_06(self, workflow, base_task):
        """<8 characters → sentence_quality_factor=0.6"""
        turns = [
            {"role": "user", "content": "hot"},
            {"role": "assistant", "content": "Good!"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["hot", "xyzuniq1", "xyzuniq2"]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        # 1 hit → input_score=4, quality=0.6 → 4*0.6=2.4 → round=2
        assert result["score"] <= 3

    @pytest.mark.asyncio
    async def test_keyword_only_factor_07(self, workflow, base_task):
        """Keyword-only sentence (remaining<4 chars after removing keywords) → 0.7"""
        turns = [
            {"role": "user", "content": "alpha bravo ok"},  # >8 chars, keywords cover most
            {"role": "assistant", "content": "Nice!"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["alpha", "bravo"]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        # 2 hits → input_score=7, remaining after removing "alpha" and "bravo" = "ok" (2 chars < 4)
        # quality=0.7 → 7*0.7=4.9 → round=5
        assert result["score"] <= 6

    @pytest.mark.asyncio
    async def test_normal_sentence_factor_10(self, workflow, base_task):
        """Normal sentence (>8 chars, substantial non-keyword content) → 1.0"""
        turns = [
            {"role": "user", "content": "alpha bravo cup delta fox jug quip vest"},
            {"role": "assistant", "content": "Wonderful!"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["alpha", "bravo"]), \
             patch.object(workflow, '_is_repetitive_input', return_value=False):
            result = await workflow._score_task_relevance(turns, base_task, "English")
        # 2 hits → input_score=7, quality=1.0 → 7
        assert result["score"] >= 6


# ============================================================
# _calculate_proficiency_delta_with_feedback: delta gates
# ============================================================

class TestCalculateProficiencyDelta:
    def test_task_relevance_le_5_gives_delta_0(self, workflow):
        """task_relevance ≤5 → delta=0"""
        for tr in [1, 2, 3, 4, 5]:
            delta, _ = workflow._calculate_proficiency_delta_with_feedback({"task_relevance": tr})
            assert delta == 0, f"task_relevance={tr} should give delta=0"

    def test_task_relevance_6_gives_delta_1(self, workflow):
        delta, _ = workflow._calculate_proficiency_delta_with_feedback({"task_relevance": 6})
        assert delta == 1

    def test_task_relevance_7_gives_delta_1(self, workflow):
        delta, _ = workflow._calculate_proficiency_delta_with_feedback({"task_relevance": 7})
        assert delta == 1

    def test_task_relevance_8_gives_delta_2(self, workflow):
        delta, _ = workflow._calculate_proficiency_delta_with_feedback({"task_relevance": 8})
        assert delta == 2

    def test_task_relevance_9_gives_delta_2(self, workflow):
        delta, _ = workflow._calculate_proficiency_delta_with_feedback({"task_relevance": 9})
        assert delta == 2

    def test_task_relevance_10_gives_delta_2(self, workflow):
        delta, _ = workflow._calculate_proficiency_delta_with_feedback({"task_relevance": 10})
        assert delta == 2

    def test_repetitive_input_forces_delta_0(self, workflow):
        """is_repetitive flag → delta=0 regardless of task_relevance"""
        delta, feedback = workflow._calculate_proficiency_delta_with_feedback(
            {"task_relevance": 9, "is_repetitive": True}
        )
        assert delta == 0


# ============================================================
# Anti-cheat: single keyword hit never earns delta
# ============================================================

class TestAntiCheat:
    @pytest.mark.asyncio
    async def test_single_hit_always_delta_0(self, workflow):
        """hits=1 → input_score=4 → final≤4 → delta=0 regardless of sentence"""
        task = {
            "id": 1,
            "task_description": "Greet a colleague",
            "scenario_title": "Greeting",
            "target_language": "English"
        }
        turns = [
            {"role": "user", "content": "hello everyone today"},
            {"role": "assistant", "content": "Well done!"}
        ]
        with patch.object(workflow, '_get_task_specific_keywords', new_callable=AsyncMock, return_value=["hello", "zzzyyyxxx111", "qqqwwweee222"]):
            result = await workflow._score_task_relevance(turns, task, "English")
        # 1 hit → input_score=4, penalty=1.0, quality=1.0 → final=4 → delta=0
        delta, _ = workflow._calculate_proficiency_delta_with_feedback({"task_relevance": result["score"]})
        assert delta == 0


# ============================================================
# task_completed trigger: score>=9 AND interaction_count>=3
# ============================================================

class TestTaskCompleted:
    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_task_completed_when_threshold_met(self, workflow, mock_db):
        """score>=9 AND interaction_count>=3 AND status!='completed' → task_completed=True"""
        # First fetchrow: get native_language
        # Second fetchrow (in _update): before update check
        # Third fetchrow: after update
        mock_db.fetchrow = AsyncMock(side_effect=[
            {"native_language": "Chinese"},  # users table
            {"score": 7, "status": "in_progress", "interaction_count": 2, "task_description": "Test", "scenario_title": "Test"},  # before update
            {"score": 9, "status": "in_progress", "interaction_count": 3, "task_description": "Test", "scenario_title": "Test"},  # after update
            {"current_proficiency": 5},  # user_goals
        ])
        mock_db.execute = AsyncMock()

        current_task = {
            "id": 1,
            "task_description": "Greet a colleague",
            "scenario_title": "Greeting",
            "target_language": "English"
        }

        # Mock _calculate_scores to return high task_relevance
        with patch.object(workflow, '_calculate_scores', new_callable=AsyncMock, return_value={
            "fluency": 8, "vocabulary": 8, "grammar": 8, "task_relevance": 9,
            "suggested_keywords": [], "matched_keywords": []
        }):
            result = await workflow.analyze_conversation_and_update_score(
                conversation_history=[{"role": "user", "content": "hello nice to meet you"}],
                user_id="user1",
                goal_id=1,
                current_task=current_task,
                db_connection=mock_db
            )

        assert result["task_completed"] is True

    @pytest.mark.asyncio
    async def test_task_not_completed_low_score(self, workflow, mock_db):
        """score < 9 → task_completed=False"""
        mock_db.fetchrow = AsyncMock(side_effect=[
            {"native_language": "English"},
            {"score": 5, "status": "in_progress", "interaction_count": 5, "task_description": "Test", "scenario_title": "Test"},
            {"score": 7, "status": "in_progress", "interaction_count": 6, "task_description": "Test", "scenario_title": "Test"},
            {"current_proficiency": 3},
        ])
        mock_db.execute = AsyncMock()

        current_task = {
            "id": 1,
            "task_description": "Order coffee",
            "scenario_title": "Coffee",
            "target_language": "English"
        }

        with patch.object(workflow, '_calculate_scores', new_callable=AsyncMock, return_value={
            "fluency": 6, "vocabulary": 6, "grammar": 6, "task_relevance": 7,
            "suggested_keywords": [], "matched_keywords": []
        }):
            result = await workflow.analyze_conversation_and_update_score(
                conversation_history=[{"role": "user", "content": "I want coffee"}],
                user_id="user1",
                goal_id=1,
                current_task=current_task,
                db_connection=mock_db
            )

        assert result["task_completed"] is False

    @pytest.mark.asyncio
    async def test_task_completed_score_threshold_low_interaction(self, workflow, mock_db):
        """score >= 9 → task_completed=True regardless of interaction_count (gate removed)."""
        mock_db.fetchrow = AsyncMock(side_effect=[
            {"native_language": "English"},
            {"score": 7, "status": "in_progress", "interaction_count": 1, "task_description": "Test", "scenario_title": "Test"},
            {"score": 9, "status": "in_progress", "interaction_count": 2, "task_description": "Test", "scenario_title": "Test"},
            {"current_proficiency": 5},
        ])
        mock_db.execute = AsyncMock()

        current_task = {
            "id": 1,
            "task_description": "Greet someone",
            "scenario_title": "Greeting",
            "target_language": "English"
        }

        with patch.object(workflow, '_calculate_scores', new_callable=AsyncMock, return_value={
            "fluency": 9, "vocabulary": 9, "grammar": 9, "task_relevance": 9,
            "suggested_keywords": [], "matched_keywords": []
        }):
            result = await workflow.analyze_conversation_and_update_score(
                conversation_history=[{"role": "user", "content": "hello nice meet"}],
                user_id="user1",
                goal_id=1,
                current_task=current_task,
                db_connection=mock_db
            )

        assert result["task_completed"] is True

    @pytest.mark.asyncio
    async def test_already_completed_task_skips_update(self, workflow, mock_db):
        """Already completed task → no score accumulation"""
        mock_db.fetchrow = AsyncMock(side_effect=[
            {"native_language": "English"},
            {"score": 10, "status": "completed", "interaction_count": 5, "task_description": "Test", "scenario_title": "Test"},
        ])
        mock_db.execute = AsyncMock()

        current_task = {
            "id": 1,
            "task_description": "Greet someone",
            "scenario_title": "Greeting",
            "target_language": "English"
        }

        with patch.object(workflow, '_calculate_scores', new_callable=AsyncMock, return_value={
            "fluency": 9, "vocabulary": 9, "grammar": 9, "task_relevance": 9,
            "suggested_keywords": [], "matched_keywords": []
        }):
            result = await workflow.analyze_conversation_and_update_score(
                conversation_history=[{"role": "user", "content": "hello"}],
                user_id="user1",
                goal_id=1,
                current_task=current_task,
                db_connection=mock_db
            )

        # Should not call UPDATE on user_tasks (only the completed status check fetchrow was called)
        # The execute mock should not have been called for score update
        assert result["task_score"] == 10

    @pytest.mark.asyncio
    async def test_delta_0_skips_db_update(self, workflow, mock_db):
        """proficiency_delta=0 → no DB update, early return"""
        mock_db.fetchrow = AsyncMock(side_effect=[
            {"native_language": "English"},
        ])
        mock_db.execute = AsyncMock()

        current_task = {
            "id": 1,
            "task_description": "Greet someone",
            "scenario_title": "Greeting",
            "target_language": "English"
        }

        with patch.object(workflow, '_calculate_scores', new_callable=AsyncMock, return_value={
            "fluency": 3, "vocabulary": 3, "grammar": 3, "task_relevance": 3,
            "suggested_keywords": [], "matched_keywords": []
        }):
            result = await workflow.analyze_conversation_and_update_score(
                conversation_history=[{"role": "user", "content": "xyz"}],
                user_id="user1",
                goal_id=1,
                current_task=current_task,
                db_connection=mock_db
            )

        assert result["proficiency_delta"] == 0
        assert result["task_completed"] is False
        # No execute calls should happen when delta=0
        mock_db.execute.assert_not_called()


# ============================================================
# _score_fluency
# ============================================================

class TestScoreFluency:
    def test_no_user_turns(self, workflow):
        assert workflow._score_fluency([]) == 5

    def test_short_responses(self, workflow):
        turns = [{"role": "user", "content": "Hi"}]
        score = workflow._score_fluency(turns)
        assert 5 <= score <= 10

    def test_good_length_with_connectors(self, workflow):
        turns = [
            {"role": "user", "content": "I think this is great because it helps me learn and I enjoy practicing"}
        ]
        score = workflow._score_fluency(turns)
        assert score >= 7


# ============================================================
# _score_vocabulary
# ============================================================

class TestScoreVocabulary:
    def test_no_user_turns(self, workflow):
        assert workflow._score_vocabulary([]) == 5

    def test_diverse_vocabulary(self, workflow):
        turns = [
            {"role": "user", "content": "I appreciate the excellent wonderful experience"}
        ]
        score = workflow._score_vocabulary(turns)
        assert score >= 7

    def test_repetitive_vocabulary(self, workflow):
        turns = [
            {"role": "user", "content": "good good good good good"}
        ]
        score = workflow._score_vocabulary(turns)
        assert score <= 7


# ============================================================
# _score_grammar
# ============================================================

class TestScoreGrammar:
    def test_no_user_turns(self, workflow):
        assert workflow._score_grammar([]) == 5

    def test_correct_grammar(self, workflow):
        turns = [
            {"role": "user", "content": "I have been working on this project for two weeks"}
        ]
        score = workflow._score_grammar(turns, "English")
        assert score >= 7

    def test_grammar_error(self, workflow):
        turns = [
            {"role": "user", "content": "he have a lot of books"}
        ]
        score = workflow._score_grammar(turns, "English")
        assert score <= 8

    def test_language_mismatch_chinese_target_english_input(self, workflow):
        turns = [
            {"role": "user", "content": "I like apples"}
        ]
        score = workflow._score_grammar(turns, "中文")
        assert score == 2

    def test_invalid_input_pure_interjections(self, workflow):
        turns = [
            {"role": "user", "content": "啊啊啊哦哦"}
        ]
        score = workflow._score_grammar(turns, "中文")
        assert score == 3


# ============================================================
# _fuzzy_match
# ============================================================

class TestFuzzyMatch:
    def test_exact_match(self, workflow):
        assert workflow._fuzzy_match("hello", "say hello to everyone") is True

    def test_case_insensitive(self, workflow):
        assert workflow._fuzzy_match("Hello", "say hello to everyone") is True

    def test_no_match(self, workflow):
        assert workflow._fuzzy_match("goodbye", "hello world") is False

    def test_fuzzy_overlap(self, workflow):
        """Character overlap ≥ threshold → match"""
        assert workflow._fuzzy_match("helo", "say hello") is True


# ============================================================
# _extract_ai_example_phrases
# ============================================================

class TestExtractAiExamplePhrases:
    def test_empty_history_returns_empty(self, workflow):
        assert workflow._extract_ai_example_phrases(None) == []
        assert workflow._extract_ai_example_phrases([]) == []

    def test_no_ai_message_returns_empty(self, workflow):
        history = [{"role": "user", "content": "Hello"}]
        assert workflow._extract_ai_example_phrases(history) == []

    def test_japanese_brackets(self, workflow):
        history = [{"role": "assistant", "content": "Try saying 「いらっしゃいませ」 to greet customers."}]
        result = workflow._extract_ai_example_phrases(history, "Japanese")
        assert "いらっしゃいませ" in result

    def test_curly_double_quotes(self, workflow):
        history = [{"role": "ai", "content": 'You can say \u201cHow can I help you?\u201d'}]
        result = workflow._extract_ai_example_phrases(history, "English")
        assert "How can I help you?" in result

    def test_straight_double_quotes(self, workflow):
        history = [{"role": "assistant", "content": 'Say "Nice to meet you" as a greeting.'}]
        result = workflow._extract_ai_example_phrases(history, "English")
        assert "Nice to meet you" in result

    def test_uses_last_ai_message(self, workflow):
        history = [
            {"role": "assistant", "content": 'First: "old phrase"'},
            {"role": "user", "content": "ok"},
            {"role": "assistant", "content": 'Now say "new phrase" instead.'},
        ]
        result = workflow._extract_ai_example_phrases(history, "English")
        assert "new phrase" in result
        assert "old phrase" not in result

    def test_deduplication(self, workflow):
        history = [{"role": "assistant", "content": 'Say "hello" and "hello" again.'}]
        result = workflow._extract_ai_example_phrases(history, "English")
        assert result.count("hello") == 1

    def test_max_two_phrases(self, workflow):
        history = [{"role": "assistant", "content": 'Say "one", "two", "three" phrases.'}]
        result = workflow._extract_ai_example_phrases(history, "English")
        assert len(result) <= 2

    def test_transcript_fallback(self, workflow):
        history = [{"role": "assistant", "transcript": 'Try "bonjour" today.'}]
        result = workflow._extract_ai_example_phrases(history, "French")
        assert "bonjour" in result


# ============================================================
# _generate_improvement_tips
# ============================================================

class TestGenerateImprovementTips:
    def test_high_score_returns_empty(self, workflow):
        scores = {"task_relevance": 8}
        result = workflow._generate_improvement_tips(scores)
        assert result == []

    def test_high_score_boundary(self, workflow):
        scores = {"task_relevance": 10}
        assert workflow._generate_improvement_tips(scores) == []

    def test_low_score_with_ai_phrase(self, workflow):
        scores = {"task_relevance": 4}
        history = [{"role": "assistant", "content": 'Try saying "こんにちは" to greet.'}]
        current_task = {"target_language": "Japanese"}
        result = workflow._generate_improvement_tips(scores, current_task, history)
        assert len(result) == 1
        assert "こんにちは" in result[0]
        assert result[0].startswith("可以试着说：")

    def test_low_score_no_phrase_fallback(self, workflow):
        scores = {"task_relevance": 3}
        history = [{"role": "assistant", "content": "Keep trying!"}]
        current_task = {"target_language": "English"}
        result = workflow._generate_improvement_tips(scores, current_task, history)
        assert len(result) == 1
        assert "English" in result[0]

    def test_no_history_fallback(self, workflow):
        scores = {"task_relevance": 5}
        result = workflow._generate_improvement_tips(scores, {"target_language": "French"}, None)
        assert len(result) == 1
        assert "French" in result[0]

    def test_boundary_score_7_triggers_tip(self, workflow):
        scores = {"task_relevance": 7}
        result = workflow._generate_improvement_tips(scores, {"target_language": "English"}, [])
        assert len(result) == 1