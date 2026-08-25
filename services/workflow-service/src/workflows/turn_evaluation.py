"""Per-turn dynamic proficiency evaluation with idempotent score updates."""

import asyncio
import hashlib
import json
import logging
import re
import time
from typing import Any, Dict

from workflows.batch_evaluation import batch_evaluation_workflow

logger = logging.getLogger(__name__)

QUALITY_DELTAS = {
    "mastered": 5,
    "strong": 4,
    "satisfactory": 3,
    "needs_work": 1,
    "off_topic": 0,
    "repetitive": 0,
    "incorrect": 0,
}
COMPLETION_QUALITIES = {"mastered", "strong", "satisfactory"}
IDEMPOTENCY_TTL_SECONDS = 72 * 3600


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
        db_connection: Any,
        redis_client: Any = None,
    ) -> Dict[str, Any]:
        cache_key = self._cache_key(user_id, goal_id, task_id, turn_id)
        cached = self._get_cached(cache_key, redis_client)
        if cached is not None:
            return cached

        lock_key = f"{cache_key}:lock"
        owns_lock = self._acquire_lock(lock_key, redis_client)
        if not owns_lock:
            for _ in range(40):
                await asyncio.sleep(0.05)
                cached = self._get_cached(cache_key, redis_client)
                if cached is not None:
                    return cached
            raise RuntimeError("turn evaluation is already in progress")

        try:
            try:
                assessment = await self._evaluate_quality(
                    user_content=user_content,
                    ai_response=ai_response,
                    current_task=current_task,
                    native_language=native_language,
                )
                fallback_used = False
            except Exception as exc:
                logger.warning(
                    "[TURN_EVAL] model=%s failed; using fallback (%s)",
                    self._model_client._model,
                    type(exc).__name__,
                )
                assessment = self._rule_based_fallback(
                    user_content=user_content,
                    current_task=current_task,
                    native_language=native_language,
                )
                fallback_used = True

            quality = assessment["quality"]
            delta = QUALITY_DELTAS[quality]
            persisted = await self._apply_score(
                db_connection=db_connection,
                user_id=user_id,
                goal_id=goal_id,
                task_id=task_id,
                delta=delta,
                quality=quality,
            )
            result = {
                "quality": quality,
                "delta": delta,
                "score": persisted["score"],
                "interaction_count": persisted["interaction_count"],
                "task_completed": persisted["task_completed"],
                "reason": assessment["reason"],
                "model_id": self._model_client._model,
                "fallback_used": fallback_used,
                "task_id": task_id,
                "turn_id": turn_id,
            }
            self._set_cached(cache_key, result, redis_client)
            return result
        finally:
            self._release_lock(lock_key, redis_client)

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
                }

            score = min(10, current_score + delta)
            interaction_count = current_count + 1
            task_completed = (
                score >= 9
                and interaction_count >= 3
                and quality in COMPLETION_QUALITIES
            )
            await db_connection.execute(
                """
                UPDATE user_tasks
                SET score = $1,
                    interaction_count = $2,
                    status = CASE WHEN $3 THEN 'completed' ELSE status END,
                    completed_at = CASE WHEN $3 THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
                    updated_at = NOW()
                WHERE id = $4 AND user_id = $5
                """,
                score,
                interaction_count,
                task_completed,
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
                "task_completed": task_completed,
            }

    @staticmethod
    def _rule_based_fallback(
        *, user_content: str, current_task: Dict[str, Any], native_language: str
    ) -> Dict[str, str]:
        answer = " ".join((user_content or "").lower().split())
        task_text = " ".join(
            str(current_task.get(key) or "")
            for key in ("task_description", "text", "scenario_title")
        ).lower()
        keywords = [
            str(value).lower()
            for value in (current_task.get("keywords") or [])
            if str(value).strip()
        ]
        if not answer:
            quality = "incorrect"
        elif len(set(answer.split())) <= 2 and len(answer.split()) >= 4:
            quality = "repetitive"
        elif keywords and not any(keyword in answer for keyword in keywords):
            quality = "off_topic"
        elif len(answer) < 8:
            quality = "needs_work"
        elif any(word in answer for word in keywords) or any(
            word in answer for word in re.findall(r"[a-zA-Z]{4,}", task_text)
        ):
            quality = "satisfactory"
        else:
            quality = "needs_work"
        reasons = {
            "mastered": "本轮表达自然、准确，并完整完成了任务。",
            "strong": "本轮表达准确且紧扣任务。",
            "satisfactory": "本轮回答与任务相关，并形成了有效推进。",
            "needs_work": "本轮有相关尝试，但还需要更完整地表达。",
            "off_topic": "本轮回答偏离了当前任务。",
            "repetitive": "本轮内容重复，未提供新的有效信息。",
            "incorrect": "本轮没有形成可评分的正确回答。",
        }
        return {"quality": quality, "reason": reasons[quality]}

    @staticmethod
    def _cache_key(user_id: str, goal_id: int, task_id: int, turn_id: str) -> str:
        digest = hashlib.sha256(
            f"{user_id}\0{goal_id}\0{task_id}\0{turn_id}".encode("utf-8")
        ).hexdigest()
        return f"turn_eval:v1:{digest}"

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
