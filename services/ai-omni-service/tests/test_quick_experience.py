import asyncio
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, patch

spec = importlib.util.spec_from_file_location("quick_experience", Path(__file__).parents[1] / "app" / "quick_experience.py")
quick = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quick)


class Redis:
    def __init__(self):
        self.values = {}

    async def get(self, key):
        return self.values.get(key)

    async def set(self, key, value, nx=False, **kwargs):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    async def eval(self, script, count, *args):
        lock, *rest = args
        if script == quick.RESERVE:
            counter, owner, limit = rest
            if self.values.get(lock) != owner:
                return -2
            used = int(self.values.get(counter, 0))
            if used >= limit:
                return -1
            self.values[counter] = used + 1
            return used + 1
        owner = rest[0]
        if self.values.get(lock) != owner:
            return 0
        if script == quick.RELEASE:
            del self.values[lock]
        return 1


class Socket:
    def __init__(self, events):
        self.events = list(events) + [{"type": "closed"}]
        self.sent = []

    async def receive_text(self):
        if self.events:
            return json.dumps(self.events.pop(0))
        await asyncio.Future()

    async def send_json(self, message):
        self.sent.append(json.loads(json.dumps(message)))

    async def close(self, **kwargs):
        pass


def answer(stage, text="I enjoy helping customers"):
    return {"type": "quick_answer", "payload": {"stage": stage, "text": text}}


class QuickExperienceTests(unittest.IsolatedAsyncioTestCase):
    async def run_flow(self, redis, events, user_id="one"):
        ws = Socket(events)
        await quick.run_quick_experience(ws, {"id": user_id}, redis, None, "model", "realtime", f"daily:{user_id}", 15)
        return ws

    async def test_three_answers_report_and_duplicate_does_not_advance(self):
        redis = Redis()
        report = {"strengths": "Clear motivation", "improvements": "Add an example", "example": "I helped a customer resolve a problem."}
        with patch.object(quick, "generate_report", AsyncMock(return_value=report)) as generate:
            ws = await self.run_flow(redis, [answer(0), answer(0), answer(1), answer(2), answer(3)])
        state = json.loads(redis.values["quick_experience:v1:one"])
        self.assertEqual(len(state["answers"]), 3)
        self.assertEqual(redis.values["daily:one"], 3)
        self.assertEqual(state["report"], report)
        generate.assert_awaited_once()
        self.assertTrue(any(m["payload"].get("report") == report for m in ws.sent))

    async def test_short_answer_and_quota_block_do_not_advance(self):
        redis = Redis()
        redis.values["daily:one"] = 15
        ws = await self.run_flow(redis, [answer(0, "hi"), answer(0)])
        codes = [m["payload"].get("code") for m in ws.sent]
        self.assertIn("answer_short", codes)
        self.assertIn("daily_limit", codes)
        self.assertNotIn("quick_experience:v1:one", redis.values)

    async def test_reconnect_restores_and_accounts_are_isolated(self):
        redis = Redis()
        await self.run_flow(redis, [answer(0)])
        ws = await self.run_flow(redis, [answer(0), answer(1)])
        self.assertEqual(ws.sent[1]["payload"]["answers"], ["I enjoy helping customers"])
        self.assertEqual(redis.values["daily:one"], 2)
        other = await self.run_flow(redis, [], user_id="two")
        self.assertEqual(other.sent[1]["payload"]["answers"], [])

    async def test_feedback_failure_does_not_fabricate_report_and_retries_are_bounded(self):
        redis = Redis()
        events = [answer(0), answer(1), answer(2)] + [{"type": "quick_report_retry"}] * 5
        with patch.object(quick, "generate_report", AsyncMock(side_effect=ValueError())) as generate:
            ws = await self.run_flow(redis, events)
        self.assertEqual(generate.await_count, 3)
        self.assertIsNone(json.loads(redis.values["quick_experience:v1:one"])["report"])
        self.assertIn("report_limit", [m["payload"].get("code") for m in ws.sent])

    async def test_missing_redis_and_competing_connection_fail_closed(self):
        ws = await self.run_flow(None, [])
        self.assertEqual(ws.sent[0]["payload"]["code"], "unavailable")
        redis = Redis()
        redis.values["quick_experience:lock:one"] = "other-owner"
        ws = await self.run_flow(redis, [answer(0)])
        self.assertEqual(ws.sent[0]["payload"]["code"], "busy")
        self.assertEqual(redis.values["quick_experience:lock:one"], "other-owner")

    def test_report_requires_evidence_fields(self):
        for value in ({}, {"strengths": "Good", "improvements": "", "example": "Text"}, "not json"):
            with self.assertRaises(ValueError):
                quick.validate_report(value)


if __name__ == "__main__":
    unittest.main()
