"""Per-turn dynamic proficiency evaluation with idempotent score updates."""

import asyncio
import hashlib
import json
import logging
import re
import secrets
import time
from typing import Any, Dict, Optional

from workflows.batch_evaluation import batch_evaluation_workflow

logger = logging.getLogger(__name__)

QUALITY_DELTAS = {
    "mastered": 3,
    "strong": 3,
    "satisfactory": 2,
    "needs_work": 1,
    "off_topic": 0,
    "repetitive": 0,
    "incorrect": 0,
}
COMPLETION_QUALITIES = {"mastered", "strong", "satisfactory"}
IDEMPOTENCY_TTL_SECONDS = 72 * 3600
READY_GATE_TTL_SECONDS = 72 * 3600


class TurnEvaluationWorkflow:
    def __init__(self):
        self._model_client = batch_evaluation_workflow
        self._memory_cache: Dict[str, tuple[float, Dict[str, Any]]] = {}

    async def evaluate_turn(
        self,
        *,
        user_id: str,
        goal_id: int,
        task_id: int,
        user_content: str,
        ai_response: str,
        current_task: Dict[str, Any],
        native_language: str,
        turn_id: str,
        turn_order: int,
        db_connection: Any,
        redis_client: Any = None,
    ) -> Dict[str, Any]:
        # Kept only so older clients receive a safe response while migrating to
        # /batch-evaluate. It deliberately performs no model call, score write,
        # cache write, or readiness mutation.
        task = await db_connection.fetchrow(
            """SELECT score, interaction_count, status FROM user_tasks
               WHERE id = $1 AND user_id = $2""",
            task_id,
            user_id,
        )
        if not task:
            raise ValueError("task not found for user")
        return {
            "evaluation_status": "deprecated",
            "deprecated": True,
            "quality": None,
            "delta": 0,
            "score": int(task.get("score") or 0),
            "interaction_count": int(task.get("interaction_count") or 0),
            "task_completed": task.get("status") == "completed",
            "task_ready_to_complete": False,
            "ready_token": None,
            "reason": "Per-turn scoring is disabled; use a 3–4 turn batch window.",
            "model_id": self._model_client._model,
            "fallback_used": False,
            "task_id": task_id,
            "turn_id": turn_id,
        }

    async def _evaluate_quality(
        self,
        *,
        user_content: str,
        ai_response: str,
        current_task: Dict[str, Any],
        native_language: str,
    ) -> Dict[str, str]:
        prompt = f"""You are grading exactly one language-practice turn.

Task: {current_task.get('task_description') or current_task.get('text') or ''}
Scenario: {current_task.get('scenario_title') or ''}
Target language: {current_task.get('target_language') or 'English'}
Student answer: {user_content}
Tutor response: {ai_response}

Choose exactly one quality:
- mastered: fully correct, natural, detailed, and directly completes the task
- strong: correct, relevant, and clear with only minor limitations
- satisfactory: meaningful, relevant, understandable task progress
- needs_work: relevant attempt but incomplete or substantially flawed
- off_topic: unrelated to the task
- repetitive: repeats prior/template wording without meaningful new task content
- incorrect: meaning is wrong or fails the requested communicative action

Return strict JSON with keys "quality" and "reason". The reason must be one short sentence in {native_language}.
"""
        content = await self._model_client._post_chat_completion(
            messages=[{"role": "user", "content": prompt}]
        )
        content = re.sub(r"^```(?:json)?\s*", "", (content or "").strip())
        content = re.sub(r"\s*```$", "", content)
        parsed = json.loads(content)
        quality = str(parsed.get("quality") or "").strip().lower()
        if quality not in QUALITY_DELTAS:
            raise ValueError("unsupported quality returned by model")
        reason = str(parsed.get("reason") or "").strip()
        if not reason:
            raise ValueError("model returned no reason")
        return {"quality": quality, "reason": reason[:240]}

    async def _apply_score(
        self,
        *,
        db_connection: Any,
        user_id: str,
        goal_id: int,
        task_id: int,
        delta: int,
        quality: str,
    ) -> Dict[str, Any]:
        transaction = db_connection.transaction()
        async with transaction:
            task = await db_connection.fetchrow(
                """
                SELECT score, status, interaction_count
                FROM user_tasks
                WHERE id = $1 AND user_id = $2
                FOR UPDATE
                """,
                task_id,
                user_id,
            )
            if not task:
                raise ValueError("task not found for user")

            current_score = int(task.get("score") or 0)
            current_count = int(task.get("interaction_count") or 0)
            if task.get("status") == "completed":
                return {
                    "score": current_score,
                    "interaction_count": current_count,
                    "task_completed": True,
                    "task_ready_to_complete": False,
                }

            score = min(9, current_score + max(0, min(3, int(delta))))
            interaction_count = current_count + 1
            task_ready_to_complete = (
                score >= 9
                and interaction_count >= 3
                and quality in COMPLETION_QUALITIES
            )
            await db_connection.execute(
                """
                UPDATE user_tasks
                SET score = $1,
                    interaction_count = $2,
                    updated_at = NOW()
                WHERE id = $3 AND user_id = $4
                """,
                score,
                interaction_count,
                task_id,
                user_id,
            )
            if delta:
                await db_connection.execute(
                    """
                    UPDATE user_goals
                    SET current_proficiency = current_proficiency + $1,
                        updated_at = NOW()
                    WHERE id = $2 AND user_id = $3
                    """,
                    delta,
                    goal_id,
                    user_id,
                )
            return {
                "score": score,
                "interaction_count": interaction_count,
                "task_completed": False,
                "task_ready_to_complete": task_ready_to_complete,
            }

    @staticmethod
    def _cache_key(user_id: str, goal_id: int, task_id: int, turn_id: str) -> str:
        digest = hashlib.sha256(
            f"{user_id}\0{goal_id}\0{task_id}\0{turn_id}".encode("utf-8")
        ).hexdigest()
        return f"turn_eval:v1:{digest}"

    @staticmethod
    def _ready_key(user_id: str, task_id: int) -> str:
        digest = hashlib.sha256(f"{user_id}\0{task_id}".encode("utf-8")).hexdigest()
        return f"task_ready:v1:{digest}"

    def _update_ready_gate(
        self, *, redis_client: Any, user_id: str, task_id: int,
        should_be_ready: bool, turn_order: int
    ) -> Optional[str]:
        """Update readiness only when this is the newest user turn seen."""
        if redis_client is None:
            return None
        key = self._ready_key(user_id, task_id)
        try:
            token = secrets.token_urlsafe(24) if should_be_ready else ""
            order = max(0, int(turn_order or 0))
            value = f"{order}:{token}"
            redis_client.eval(
                """
                local current = redis.call('GET', KEYS[1])
                if current then
                  local separator = string.find(current, ':')
                  local current_order = tonumber(separator and string.sub(current, 1, separator - 1) or '0') or 0
                  if current_order > tonumber(ARGV[1]) then return 0 end
                end
                redis.call('SETEX', KEYS[1], ARGV[2], ARGV[3])
                return 1
                """,
                1,
                key,
                order,
                READY_GATE_TTL_SECONDS,
                value,
            )
            current = str(redis_client.get(key) or "")
            current_token = current.split(":", 1)[1] if ":" in current else ""
            return current_token or None
        except Exception as exc:
            logger.warning("[TURN_EVAL] Redis ready gate failed: %s", type(exc).__name__)
            return None

    def _read_ready_gate(
        self, redis_client: Any, user_id: str, task_id: int
    ) -> Optional[str]:
        if redis_client is None:
            return None
        try:
            current = str(redis_client.get(self._ready_key(user_id, task_id)) or "")
            token = current.split(":", 1)[1] if ":" in current else current
            return token or None
        except Exception as exc:
            logger.warning("[TURN_EVAL] Redis ready read failed: %s", type(exc).__name__)
            return None

    def _get_cached(self, key: str, redis_client: Any) -> Any:
        if redis_client is not None:
            try:
                raw = redis_client.get(key)
                if raw:
                    return json.loads(raw)
            except Exception as exc:
                logger.warning("[TURN_EVAL] Redis read failed: %s", type(exc).__name__)
        cached = self._memory_cache.get(key)
        if cached and cached[0] > time.time():
            return dict(cached[1])
        if cached:
            self._memory_cache.pop(key, None)
        return None

    def _set_cached(self, key: str, result: Dict[str, Any], redis_client: Any) -> None:
        encoded = json.dumps(result, ensure_ascii=False)
        if redis_client is not None:
            try:
                redis_client.setex(key, IDEMPOTENCY_TTL_SECONDS, encoded)
            except Exception as exc:
                logger.warning("[TURN_EVAL] Redis write failed: %s", type(exc).__name__)
        self._memory_cache[key] = (time.time() + IDEMPOTENCY_TTL_SECONDS, dict(result))

    @staticmethod
    def _acquire_lock(key: str, redis_client: Any) -> bool:
        if redis_client is None:
            return True
        try:
            return bool(redis_client.set(key, "1", nx=True, ex=30))
        except Exception:
            return True

    @staticmethod
    def _release_lock(key: str, redis_client: Any) -> None:
        if redis_client is None:
            return
        try:
            redis_client.delete(key)
        except Exception:
            pass


turn_evaluation_workflow = TurnEvaluationWorkflow()
