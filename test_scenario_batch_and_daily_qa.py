#!/usr/bin/env python3
"""
E2E scenario script for Feature 1 (batch evaluation) and Feature 2 (daily QA).

Runs against the deployed stack (localhost:8081 by default) OR in --mock mode,
which feeds prerecorded server frames through an in-process fake WebSocket /
REST client so the assertion skeleton is executable today — before ai-omni-service
ships the /daily-question endpoint and accumulator-driven proficiency_update.

Scenarios:
  - batch   : 4-turn WebSocket window validating inline -> batch tip_source
              transition + turn-5 teaching directive (guide|correct + [NATIVE: ...])
  - daily   : GET /api/ai/daily-question lifecycle (1st call + cache hit) +
              WS mode=daily_qa with [DAILY_QA_PASSED] marker -> daily_qa_completed
  - cheat   : 4 turns repeating same keyword -> delta==0
  - all     : run everything

CLI:
  python3 test_scenario_batch_and_daily_qa.py --scenario all --mock
  python3 test_scenario_batch_and_daily_qa.py --scenario batch \\
      --api-base http://localhost:8081 --ws-url ws://localhost:8081/api/ws/ai
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Color output — matches auto_test.py style
# ---------------------------------------------------------------------------


class C:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    GRAY = "\033[90m"
    BOLD = "\033[1m"
    END = "\033[0m"


def ok(msg: str) -> None:
    print(f"{C.GREEN}PASS{C.END} {msg}")


def fail(msg: str) -> None:
    print(f"{C.RED}FAIL{C.END} {msg}")


def skip(msg: str) -> None:
    print(f"{C.YELLOW}SKIP{C.END} {msg}")


def info(msg: str) -> None:
    print(f"{C.CYAN}->{C.END} {msg}")


def section(msg: str) -> None:
    print(f"\n{C.BOLD}{C.CYAN}=== {msg} ==={C.END}")


# ---------------------------------------------------------------------------
# Result tracker
# ---------------------------------------------------------------------------


@dataclass
class Results:
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    failures: List[str] = field(default_factory=list)

    def expect(self, cond: bool, label: str) -> bool:
        if cond:
            ok(label)
            self.passed += 1
            return True
        fail(label)
        self.failed += 1
        self.failures.append(label)
        return False

    def mark_skip(self, label: str) -> None:
        skip(label)
        self.skipped += 1

    def summary(self) -> int:
        print(
            f"\n{C.BOLD}Summary:{C.END} "
            f"{C.GREEN}{self.passed} passed{C.END}  "
            f"{C.RED}{self.failed} failed{C.END}  "
            f"{C.YELLOW}{self.skipped} skipped{C.END}"
        )
        if self.failures:
            print(f"{C.RED}Failures:{C.END}")
            for f in self.failures:
                print(f"  - {f}")
        return 0 if self.failed == 0 else 1


# ---------------------------------------------------------------------------
# Mock server frames — mirrors what ai-omni-service is expected to emit
# per docs/batch-evaluation-agent-design.md + plans/imperative-dreaming-sparrow.md
# ---------------------------------------------------------------------------


def mock_frames_batch() -> List[List[Dict[str, Any]]]:
    """
    Returns a list of lists — one inner list per user turn.
    Frames within each inner list are delivered after that turn's `send`.
    """
    inline = {
        "type": "proficiency_update",
        "delta": 0,
        "tip_source": "inline",
        "tips": ["Try longer sentences"],
    }
    batch = {
        "type": "proficiency_update",
        "delta": 1,
        "tip_source": "batch_eval",
        "teaching_mode": "correct",
        "scores": {
            "keyword_coverage": 4.0,
            "grammar_quality": 7.0,
            "topic_relevance": 6.0,
            "fluency": 6.0,
        },
        "improvement_tips": ["use reservation / available"],
        "keyword_coverage_detail": {
            "matched": ["check-in"],
            "missed": ["room", "reservation", "available"],
            "coverage_ratio": 0.25,
        },
    }
    turn5 = {
        "type": "ai_response",
        "text": "Good attempt! [NATIVE: 你可以问问有没有空房间] "
                "Try saying: \"Do you have any rooms available for tonight?\" "
                "Let's try that again.",
        "isFinal": True,
    }
    return [
        [inline],
        [inline],
        [inline],
        [batch],
        [turn5],
    ]


def mock_frames_cheat() -> List[List[Dict[str, Any]]]:
    inline = {"type": "proficiency_update", "delta": 0, "tip_source": "inline", "tips": []}
    batch_zero = {
        "type": "proficiency_update",
        "delta": 0,
        "tip_source": "batch_eval",
        "teaching_mode": "correct",
        "keyword_coverage_detail": {
            "matched": ["check-in"],
            "missed": ["room", "reservation", "available"],
            "coverage_ratio": 0.25,
        },
        "scores": {"keyword_coverage": 2.5, "grammar_quality": 6,
                   "topic_relevance": 4, "fluency": 4},
    }
    return [[inline], [inline], [inline], [batch_zero]]


def mock_frames_daily_pass() -> List[List[Dict[str, Any]]]:
    ai_reply = {
        "type": "ai_response",
        "text": "[DAILY_QA_PASSED] Great answer — enjoy the rest of your day!",
        "isFinal": True,
    }
    completed = {"type": "daily_qa_completed", "qa_date": time.strftime("%Y-%m-%d")}
    return [[ai_reply, completed]]


def mock_frames_daily_retry() -> List[List[Dict[str, Any]]]:
    ai_reply = {
        "type": "ai_response",
        "text": "Hmm, can you try again? [NATIVE: 可以再描述一下今天的心情吗？]",
        "isFinal": True,
    }
    return [[ai_reply]]


# ---------------------------------------------------------------------------
# Fake clients (used in --mock mode)
# ---------------------------------------------------------------------------


class FakeWSClient:
    """Replays scripted frames when send() is called — one batch per send."""

    def __init__(self, frame_batches: List[List[Dict[str, Any]]]):
        self._batches = list(frame_batches)
        self._inbox: List[Dict[str, Any]] = []
        self.sent: List[Dict[str, Any]] = []
        self.closed = False

    def send(self, payload: Dict[str, Any]) -> None:
        self.sent.append(payload)
        if self._batches:
            self._inbox.extend(self._batches.pop(0))

    def drain(self) -> List[Dict[str, Any]]:
        out = list(self._inbox)
        self._inbox.clear()
        return out

    def close(self) -> None:
        self.closed = True


class FakeHTTP:
    """In-process mock of the REST surface relevant to these scenarios."""

    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._passed_flags: Dict[str, bool] = {}
        self.generate_calls = 0

    def get_daily_question(self, user_id: str) -> Dict[str, Any]:
        today = time.strftime("%Y-%m-%d")
        key = f"{user_id}:{today}"
        passed = self._passed_flags.get(key, False)
        if key not in self._cache:
            self.generate_calls += 1
            self._cache[key] = {
                "question_text": "What was the best part of your morning?",
                "qa_date": today,
            }
        q = self._cache[key]
        return {"question_text": q["question_text"], "qa_date": q["qa_date"], "passed": passed}

    def mark_passed(self, user_id: str) -> None:
        today = time.strftime("%Y-%m-%d")
        self._passed_flags[f"{user_id}:{today}"] = True


# ---------------------------------------------------------------------------
# Real-mode adapters (thin wrappers; fallback to skip if unreachable)
# ---------------------------------------------------------------------------


def _try_import_websocket():
    try:
        import websocket  # type: ignore
        return websocket
    except ImportError:
        return None


def _try_import_requests():
    try:
        import requests  # type: ignore
        return requests
    except ImportError:
        return None


class RealHTTP:
    def __init__(self, api_base: str, token: Optional[str] = None):
        self.api_base = api_base.rstrip("/")
        self.token = token
        self._r = _try_import_requests()

    def available(self) -> bool:
        return self._r is not None

    def get_daily_question(self, user_id: str) -> Dict[str, Any]:
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        resp = self._r.get(f"{self.api_base}/api/ai/daily-question",
                           headers=headers, timeout=5)
        resp.raise_for_status()
        body = resp.json()
        return body.get("data", body)


class RealWS:
    """Blocking-style collect: send N payloads, recv until timeout, return frames."""

    def __init__(self, ws_url: str, token: Optional[str] = None):
        self.ws_url = ws_url
        self.token = token
        self._mod = _try_import_websocket()
        self._ws = None
        self._received: List[Dict[str, Any]] = []

    def available(self) -> bool:
        return self._mod is not None

    def connect(self, mode: Optional[str] = None, scenario: Optional[str] = None,
                timeout: float = 5.0) -> bool:
        import threading

        url = self.ws_url
        qs = []
        if self.token:
            qs.append(f"token={self.token}")
        if mode:
            qs.append(f"mode={mode}")
        if scenario:
            qs.append(f"scenario={scenario}")
        if qs:
            url = url + ("&" if "?" in url else "?") + "&".join(qs)

        def on_message(_ws, message):
            try:
                self._received.append(json.loads(message))
            except Exception:
                self._received.append({"raw": message})

        self._ws = self._mod.WebSocketApp(
            url,
            on_message=on_message,
            on_error=lambda *_: None,
            on_close=lambda *_: None,
        )
        t = threading.Thread(target=self._ws.run_forever, daemon=True)
        t.start()
        deadline = time.time() + timeout
        while time.time() < deadline:
            if getattr(self._ws, "sock", None) and self._ws.sock.connected:
                return True
            time.sleep(0.1)
        return False

    def send(self, payload: Dict[str, Any]) -> None:
        if self._ws:
            self._ws.send(json.dumps(payload))

    def collect(self, wait_s: float = 3.0) -> List[Dict[str, Any]]:
        time.sleep(wait_s)
        frames = list(self._received)
        self._received.clear()
        return frames

    def close(self) -> None:
        if self._ws:
            try:
                self._ws.close()
            except Exception:
                pass


def _collect_one_batch(ws: Any, mock: bool) -> List[Dict[str, Any]]:
    """In mock mode, drain FakeWSClient inbox. In real mode, wait + collect."""
    if mock:
        return ws.drain()
    return ws.collect(wait_s=3.0)


# ---------------------------------------------------------------------------
# Scenario: batch
# ---------------------------------------------------------------------------


def run_batch(results: Results, mock: bool, ws_url: str, token: Optional[str]) -> None:
    section("Feature 1 - Batch Evaluation (4-turn window -> tip_source transition)")

    turn_texts = [
        "I want to check-in please.",
        "I have a reservation under Smith.",
        "Any room with a good view?",
        "Is a double room available tonight?",
    ]

    if mock:
        ws: Any = FakeWSClient(mock_frames_batch())
    else:
        ws = RealWS(ws_url, token=token)
        if not ws.available():
            results.mark_skip("batch: websocket-client not installed; rerun with --mock")
            return
        if not ws.connect(scenario="Hotel Check-In", timeout=5.0):
            results.mark_skip("batch: could not connect to WS — backend not deployed?")
            return

    try:
        tip_sources: List[str] = []
        last_batch_frame: Optional[Dict[str, Any]] = None

        for i, text in enumerate(turn_texts, start=1):
            info(f"turn {i}: send user text -> {text!r}")
            ws.send({"type": "text", "text": text})
            frames = _collect_one_batch(ws, mock)
            info(f"turn {i}: {len(frames)} frames received")
            for f in frames:
                if f.get("type") == "proficiency_update":
                    src = f.get("tip_source")
                    tip_sources.append(src)
                    if src == "batch_eval":
                        last_batch_frame = f

        first_three = tip_sources[:3]
        results.expect(
            first_three == ["inline", "inline", "inline"],
            f"turn 1-3 tip_source == 'inline' (got {first_three})",
        )
        results.expect(
            last_batch_frame is not None
            and last_batch_frame.get("tip_source") == "batch_eval",
            "turn 4 proficiency_update has tip_source=='batch_eval'",
        )
        if last_batch_frame:
            for key in ("delta", "scores", "improvement_tips", "teaching_mode"):
                results.expect(key in last_batch_frame,
                               f"batch_eval payload has '{key}'")

        info("turn 5: send user text -> expect teaching directive applied")
        ws.send({"type": "text", "text": "Ok let me try again — I need a room."})
        turn5_frames = _collect_one_batch(ws, mock)
        ai_texts = [f.get("text", "") for f in turn5_frames
                    if f.get("type") == "ai_response"]
        combined = " ".join(ai_texts)
        mode = (last_batch_frame or {}).get("teaching_mode")
        if mode == "correct":
            results.expect(
                "[NATIVE:" in combined,
                f"turn 5 (correct mode) reply contains [NATIVE: ...] "
                f"(reply: {combined[:120]!r})",
            )
        elif mode == "guide":
            results.expect(bool(combined),
                           "turn 5 (guide mode) produced non-empty AI reply")
        else:
            results.mark_skip(
                f"turn 5: teaching_mode not reported ({mode!r}) — "
                f"cannot assert directive"
            )
    finally:
        ws.close()


# ---------------------------------------------------------------------------
# Scenario: daily QA
# ---------------------------------------------------------------------------


def run_daily(results: Results, mock: bool,
              api_base: str, ws_url: str, token: Optional[str]) -> None:
    section("Feature 2 - Daily QA (REST lifecycle + [DAILY_QA_PASSED] marker)")

    user_id = f"test_user_{uuid.uuid4().hex[:8]}"

    if mock:
        http: Any = FakeHTTP()
    else:
        http = RealHTTP(api_base, token=token)
        if not http.available():
            results.mark_skip("daily: 'requests' not installed; rerun with --mock")
            return

    try:
        r1 = http.get_daily_question(user_id)
    except Exception as e:
        results.mark_skip(
            f"daily: first GET failed ({e}) — backend endpoint not deployed?"
        )
        return

    results.expect("question_text" in r1 and bool(r1["question_text"]),
                   "GET /daily-question returned question_text")
    results.expect("qa_date" in r1, "GET /daily-question returned qa_date")
    results.expect(
        r1.get("passed") is False,
        f"GET /daily-question initial passed==false (got {r1.get('passed')})",
    )

    r2 = http.get_daily_question(user_id)
    results.expect(
        r2.get("question_text") == r1.get("question_text"),
        "second GET returns SAME question_text (cache hit)",
    )
    if isinstance(http, FakeHTTP):
        results.expect(http.generate_calls == 1,
                       f"pool generator invoked exactly once "
                       f"(got {http.generate_calls})")

    info("WS: mode=daily_qa — satisfying answer -> expect [DAILY_QA_PASSED]")
    if mock:
        ws: Any = FakeWSClient(mock_frames_daily_pass())
    else:
        ws = RealWS(ws_url, token=token)
        if not ws.available() or not ws.connect(mode="daily_qa", timeout=5.0):
            results.mark_skip("daily WS: cannot connect — backend not deployed?")
            return

    try:
        ws.send({"type": "text",
                 "text": "My morning was great — I meditated and had coffee."})
        frames = _collect_one_batch(ws, mock)
        ai_text = " ".join(f.get("text", "") for f in frames
                           if f.get("type") == "ai_response")
        results.expect(
            "[DAILY_QA_PASSED]" in ai_text,
            f"AI reply contains [DAILY_QA_PASSED] (reply: {ai_text[:120]!r})",
        )
        completed = [f for f in frames if f.get("type") == "daily_qa_completed"]
        results.expect(len(completed) == 1,
                       f"received daily_qa_completed event (count={len(completed)})")
        if completed:
            results.expect("qa_date" in completed[0],
                           "daily_qa_completed has qa_date field")
        if isinstance(http, FakeHTTP):
            http.mark_passed(user_id)
    finally:
        ws.close()

    if isinstance(http, FakeHTTP):
        r3 = http.get_daily_question(user_id)
        results.expect(r3.get("passed") is True,
                       "after pass, subsequent GET reports passed==true")

    info("WS: mode=daily_qa — unsatisfying answer -> no marker, user can retry")
    if mock:
        ws2: Any = FakeWSClient(mock_frames_daily_retry())
    else:
        ws2 = RealWS(ws_url, token=token)
        if not ws2.available() or not ws2.connect(mode="daily_qa", timeout=5.0):
            results.mark_skip("daily retry WS: cannot connect")
            return

    try:
        ws2.send({"type": "text", "text": "uh"})
        frames2 = _collect_one_batch(ws2, mock)
        ai_text2 = " ".join(f.get("text", "") for f in frames2
                            if f.get("type") == "ai_response")
        results.expect("[DAILY_QA_PASSED]" not in ai_text2,
                       "unsatisfying answer -> no [DAILY_QA_PASSED] marker")
        results.expect(
            not [f for f in frames2 if f.get("type") == "daily_qa_completed"],
            "unsatisfying answer -> no daily_qa_completed WS event",
        )
    finally:
        ws2.close()


# ---------------------------------------------------------------------------
# Scenario: cheat defense
# ---------------------------------------------------------------------------


def run_cheat(results: Results, mock: bool, ws_url: str, token: Optional[str]) -> None:
    section("Cheat defense - repeated keyword across 4 turns -> delta==0")

    cheat_turns = ["check-in", "check-in please", "check-in now", "check-in check-in"]

    if mock:
        ws: Any = FakeWSClient(mock_frames_cheat())
    else:
        ws = RealWS(ws_url, token=token)
        if not ws.available() or not ws.connect(scenario="Hotel Check-In", timeout=5.0):
            results.mark_skip("cheat: cannot connect to real WS")
            return

    try:
        batch_frame: Optional[Dict[str, Any]] = None
        for text in cheat_turns:
            ws.send({"type": "text", "text": text})
            for f in _collect_one_batch(ws, mock):
                if (f.get("type") == "proficiency_update"
                        and f.get("tip_source") == "batch_eval"):
                    batch_frame = f

        results.expect(batch_frame is not None,
                       "cheat window produced a batch_eval frame")
        if batch_frame:
            results.expect(batch_frame.get("delta") == 0,
                           f"cheat window delta == 0 "
                           f"(got {batch_frame.get('delta')})")
            kcd = batch_frame.get("keyword_coverage_detail", {})
            matched = {m.lower() for m in (kcd.get("matched") or [])}
            results.expect(
                matched == {"check-in"},
                f"unique keyword hits == 1 (matched={matched})",
            )
    finally:
        ws.close()

    info("short-repetitive input check covered by unit tests "
         "(proficiency_scoring._is_repetitive_input) — skipping here")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="E2E scenarios for batch evaluation + daily QA"
    )
    p.add_argument("--scenario",
                   choices=["batch", "daily", "cheat", "all"],
                   default="all")
    p.add_argument("--mock", action="store_true",
                   help="Use in-process fake WS/HTTP "
                        "(runnable without a deployed stack)")
    p.add_argument("--api-base",
                   default=os.environ.get("API_BASE", "http://localhost:8081"))
    p.add_argument("--ws-url",
                   default=os.environ.get("WS_URL",
                                          "ws://localhost:8081/api/ws/ai"))
    p.add_argument("--token", default=os.environ.get("TOKEN"),
                   help="JWT bearer token for real-mode authentication")
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    results = Results()

    mode_banner = "MOCK" if args.mock else "REAL"
    print(f"{C.BOLD}Running scenario={args.scenario} mode={mode_banner}{C.END}")
    if not args.mock:
        print(f"  api_base: {args.api_base}")
        print(f"  ws_url:   {args.ws_url}")

    try:
        if args.scenario in ("batch", "all"):
            run_batch(results, args.mock, args.ws_url, args.token)
        if args.scenario in ("daily", "all"):
            run_daily(results, args.mock, args.api_base, args.ws_url, args.token)
        if args.scenario in ("cheat", "all"):
            run_cheat(results, args.mock, args.ws_url, args.token)
    except KeyboardInterrupt:
        print("\nInterrupted")
        return 130

    return results.summary()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
