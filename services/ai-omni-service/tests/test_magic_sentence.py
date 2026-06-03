"""Tests for the magic-sentence extraction logic in app/main.py.

The magic-repetition phase pulls the sentence the student must repeat out of
the AI's text. The extraction is performed inline inside ``upload_ai_task``
(around line 1952) using two ordered regexes:

  1. corner-bracket form  ->  r'[「「]([^」」]+)[」」]'   (Japanese 「…」)
  2. straight-quote form  ->  r'"([^"]{10,})"'         (fallback, >=10 chars)

Because the logic is inline (not a standalone function), this test:

  * pins the EXACT regex strings against the live source of main.py, so if the
    extraction in main.py is ever changed the test fails loudly (anti-drift); and
  * exercises an ``extract_magic_sentence`` replica built FROM those same two
    patterns to verify behaviour: 「」 match, "" fallback, and no-match -> None.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import _omni_stubs  # noqa: E402

# Confirms main.py loads cleanly (isolated import under stubs). Not otherwise
# used here — the inline magic-sentence regex is pinned against source below.
_main = _omni_stubs.load_main()  # noqa: F841

_MAIN_PATH = os.path.join(os.path.dirname(__file__), "..", "app", "main.py")

# The two patterns exactly as written in main.py's inline extraction block.
_CORNER_PATTERN = r'[「「]([^」」]+)[」」]'
_QUOTE_PATTERN = r'"([^"]{10,})"'


def extract_magic_sentence(ai_text: str):
    """Replica of main.py's inline extraction order. Returns str or None."""
    if not ai_text:
        return None
    m = re.search(_CORNER_PATTERN, ai_text)
    if not m:
        m = re.search(_QUOTE_PATTERN, ai_text)
    if m:
        return m.group(1).strip()
    return None


class TestSourcePinning:
    """Guard: the inline regexes in main.py must match what we test here."""

    def test_main_source_contains_corner_pattern(self):
        with open(_MAIN_PATH, "r", encoding="utf-8") as fh:
            src = fh.read()
        assert _CORNER_PATTERN in src, (
            "corner-bracket magic-sentence regex changed in main.py; "
            "update test_magic_sentence.py to match"
        )

    def test_main_source_contains_quote_pattern(self):
        with open(_MAIN_PATH, "r", encoding="utf-8") as fh:
            src = fh.read()
        assert _QUOTE_PATTERN in src, (
            "quote-fallback magic-sentence regex changed in main.py; "
            "update test_magic_sentence.py to match"
        )


class TestCornerBracketMatch:
    def test_japanese_corner_brackets(self):
        text = "今日のフレーズはこちらです：「お元気ですか？」覚えてね。"
        assert extract_magic_sentence(text) == "お元気ですか？"

    def test_corner_brackets_with_latin_inside(self):
        text = "Repeat after me: 「How are you doing today?」"
        assert extract_magic_sentence(text) == "How are you doing today?"

    def test_corner_brackets_preferred_over_quotes(self):
        # When BOTH forms are present, the corner-bracket pattern wins (tried first).
        text = '今日は「正しい文」です "this quoted string is long enough"'
        assert extract_magic_sentence(text) == "正しい文"


class TestQuoteFallback:
    def test_straight_quote_fallback(self):
        text = 'Please repeat this sentence: "I would like a cup of coffee please".'
        assert extract_magic_sentence(text) == "I would like a cup of coffee please"

    def test_short_quote_below_min_len_not_matched(self):
        # quote fallback requires >=10 chars between the quotes
        text = 'Say "hi" now.'
        assert extract_magic_sentence(text) is None

    def test_quote_exactly_ten_chars(self):
        text = 'Repeat: "abcdefghij" thanks.'
        assert extract_magic_sentence(text) == "abcdefghij"


class TestNoMatch:
    def test_plain_text_returns_none(self):
        assert extract_magic_sentence("Great job, keep practising every day!") is None

    def test_empty_string_returns_none(self):
        assert extract_magic_sentence("") is None

    def test_none_input_returns_none(self):
        assert extract_magic_sentence(None) is None

    def test_unclosed_bracket_returns_none(self):
        assert extract_magic_sentence("今日は「未完成の文") is None
