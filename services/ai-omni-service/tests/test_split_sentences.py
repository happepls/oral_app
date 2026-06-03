"""Item 7 (CJK+Latin sentence splitter) — NOT APPLICABLE.

Bundle task asked: "find the CJK+Latin sentence splitter in main.py ... If no
such function exists in main.py, note that and skip ONLY this item."

Verified absence: a full scan of services/ai-omni-service/app/main.py for any
sentence-segmentation helper (def *split*, re.split, tokenize/segment/分句/断句)
turned up only trivial delimiter splits such as
    custom_topic.split(" (Tasks:")[0]
and a CSV-style env split. There is NO function that splits mixed CJK + Latin
prose into sentences. Nothing to test, so this item is intentionally skipped.

A single skipped test is kept (rather than deleting the file) so the skip is
visible in the pytest run and the decision is self-documenting. The guard below
also fails loudly if such a splitter is added later without a real test.
"""
import os
import re

import pytest

_MAIN_PATH = os.path.join(os.path.dirname(__file__), "..", "app", "main.py")

# Heuristic markers of a real sentence-segmentation routine (excludes the known
# trivial delimiter splits on " (Tasks:" / "," etc.).
_SPLITTER_HINTS = [
    r"def\s+\w*split_sentenc",
    r"def\s+\w*sentence_split",
    r"def\s+\w*segment\w*sentence",
    r"re\.split\(\s*r?['\"][^'\"]*[。！？.!?]",  # regex split on sentence punctuation
]


@pytest.mark.skip(reason="No CJK+Latin sentence splitter exists in main.py (item 7 N/A)")
def test_cjk_latin_sentence_split_placeholder():  # pragma: no cover
    pass


def test_no_sentence_splitter_present_in_main():
    """If a real splitter is ever introduced, this fails so a proper test is added."""
    with open(_MAIN_PATH, "r", encoding="utf-8") as fh:
        src = fh.read()
    for pat in _SPLITTER_HINTS:
        assert re.search(pat, src) is None, (
            f"A sentence-splitter-like construct ({pat!r}) appeared in main.py — "
            "item 7 is no longer N/A; write real CJK+Latin split tests."
        )
