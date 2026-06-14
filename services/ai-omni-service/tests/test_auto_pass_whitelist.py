"""Tests for the REAL ``_check_auto_pass`` whitelist gate in app/main.py.

Current contract (whitelist approach):
  * response_count < 3            -> False  (must have had >=3 AI turns)
  * stripped/lowered text < 10ch  -> False  (too short to judge)
  * otherwise True iff the AI text contains ANY positive-evaluation indicator
    from ``_DAILY_QA_POSITIVE_INDICATORS`` (great answer / well done / 太棒了 / …)

This is distinct from the older negative-indicator scheme in test_auto_pass.py;
these tests pin the live whitelist behaviour.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import _omni_stubs  # noqa: E402

_main = _omni_stubs.load_main()
_check_auto_pass = _main._check_auto_pass
_INDICATORS = _main._DAILY_QA_POSITIVE_INDICATORS


class TestPositiveIndicatorsPass:
    def test_great_answer_passes_at_threshold(self):
        assert _check_auto_pass("Great answer! You explained it clearly.", 3) is True

    def test_well_done_variant(self):
        assert _check_auto_pass("Well done, that was a thoughtful response.", 3) is True

    def test_excellent_variant(self):
        assert _check_auto_pass("Excellent! You covered everything nicely.", 4) is True

    def test_case_insensitive_indicator(self):
        assert _check_auto_pass("GREAT ANSWER overall, keep it up!", 3) is True

    def test_chinese_positive_indicator(self):
        assert _check_auto_pass("太棒了，你的回答非常完整。", 3) is True

    def test_japanese_positive_indicator(self):
        assert _check_auto_pass("素晴らしい答えですね、よくできました。", 3) is True

    def test_every_indicator_is_recognized(self):
        # Each whitelisted indicator, padded past the 10-char minimum, must pass.
        for ind in _INDICATORS:
            text = f"{ind} -- nicely done overall keep going"
            assert _check_auto_pass(text, 3) is True, f"indicator failed: {ind!r}"


class TestResponseCountGating:
    def test_below_threshold_count_zero(self):
        assert _check_auto_pass("Great answer! Well done.", 0) is False

    def test_below_threshold_count_two(self):
        assert _check_auto_pass("Great answer! Well done.", 2) is False

    def test_exactly_at_threshold_count_three(self):
        assert _check_auto_pass("Great answer! Well done.", 3) is True


class TestRejection:
    def test_empty_text_rejected(self):
        assert _check_auto_pass("", 5) is False

    def test_whitespace_only_rejected(self):
        assert _check_auto_pass("     ", 5) is False

    def test_too_short_text_rejected(self):
        # Has a positive word but < 10 chars after strip -> rejected.
        assert _check_auto_pass("perfect", 5) is False

    def test_no_positive_indicator_rejected(self):
        assert _check_auto_pass("Could you try again with more detail?", 5) is False

    def test_neutral_long_text_rejected(self):
        assert _check_auto_pass("I see what you mean, let's continue practising now.", 5) is False
