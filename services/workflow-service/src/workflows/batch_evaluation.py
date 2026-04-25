"""
Workflow: Batch Evaluation Agent (批量评估 Agent)

Accumulates 4 conversation turns, then calls qwen-turbo LLM to perform
a holistic evaluation. Outputs:
- delta: proficiency score delta (0 | 1 | 2)
- teaching_mode: "guide" | "correct"
- scores: keyword_coverage / grammar_quality / topic_relevance / fluency
- improvement_tips: tips in native language
- next_topic_hint / correction_guidance

Falls back to pure rule-based scoring on LLM failure.

Reuses ProficiencyScoringWorkflow._update_user_proficiency for DB writes
(only when delta > 0).

Design: docs/batch-evaluation-agent-design.md
"""
import os
import re
import json
import logging
from typing import Dict, List, Any, Optional

try:
    import dashscope
    from dashscope import Generation
    _DASHSCOPE_AVAILABLE = True
except ImportError:
    dashscope = None
    Generation = None
    _DASHSCOPE_AVAILABLE = False

from workflows.proficiency_scoring import ProficiencyScoringWorkflow

logger = logging.getLogger(__name__)


# Hard-correction markers (partial match across common target languages)
_HARD_CORRECTION_MARKERS = [
    "说错了", "不对", "错误", "incorrect", "wrong",
    "間違", "間違い", "全然違う", "틀렸",
]
# Soft-correction markers
_SOFT_CORRECTION_MARKERS = [
    "曖昧", "不够具体", "vague", "try again", "もう少し具体的",
    "can be clearer", "不太清楚",
]


class BatchEvaluationWorkflow:
    """
    批量评估工作流
    - 窗口大小默认 4 轮
    - 调用 qwen-turbo 做综合打分 + 教学策略决策
    - LLM 失败时降级到规则打分
    - delta > 0 时复用 ProficiencyScoringWorkflow._update_user_proficiency 写库
    """

    def __init__(self):
        self.proficiency_workflow = ProficiencyScoringWorkflow()
        self._api_key = os.getenv("DASHSCOPE_API_KEY") or os.getenv("QWEN3_OMNI_API_KEY")
        if _DASHSCOPE_AVAILABLE and self._api_key:
            dashscope.api_key = self._api_key
        self._model = os.getenv("BATCH_EVAL_MODEL", "qwen-turbo")

    async def evaluate_window(
        self,
        *,
        user_id: str,
        goal_id: int,
        turn_window: List[Dict[str, Any]],
        current_task: Dict[str, Any],
        native_language: str,
        db_connection: Any,
    ) -> Dict[str, Any]:
        """
        Evaluate a window of conversation turns.

        Args:
            user_id: 用户 ID
            goal_id: 目标 ID
            turn_window: 轮次列表 [{turn_index, user_content, ai_response, timestamp}, ...]
            current_task: 任务信息 {id, task_description, keywords, scenario_title, target_language}
            native_language: 母语 (用于 improvement_tips / correction_guidance)
            db_connection: asyncpg connection

        Returns:
            完整评估结果 dict，详见 docs/batch-evaluation-agent-design.md Section V
        """
        target_language = current_task.get("target_language") or "English"

        # 1. LLM 评估（失败则走 fallback）
        try:
            result = await self._call_llm(
                turn_window=turn_window,
                current_task=current_task,
                native_language=native_language,
                target_language=target_language,
            )
        except Exception as e:
            logger.warning(f"[BATCH_EVAL] LLM failed, using rule-based fallback: {e}")
            result = self._rule_based_fallback(turn_window, current_task)

        # 2. 保底字段
        result.setdefault("delta", 0)
        result.setdefault("teaching_mode", "guide")
        result.setdefault("scores", {})
        result.setdefault("improvement_tips", [])
        result.setdefault("keyword_coverage_detail", {})
        result.setdefault("next_topic_hint", None)
        result.setdefault("correction_guidance", None)

        # 3. delta > 0 则调用 proficiency workflow 写 DB
        delta = int(result.get("delta", 0) or 0)
        task_id = current_task.get("id")

        result["task_id"] = task_id
        result["task_completed"] = False
        result["task_ready_to_complete"] = False
        result["total_proficiency"] = 0
        result["task_score"] = 0

        if delta > 0 and task_id is not None:
            try:
                feedback_text = ""
                tips = result.get("improvement_tips") or []
                if tips:
                    feedback_text = tips[0] if isinstance(tips[0], str) else ""

                db_result = await self._update_user_proficiency(
                    user_id=user_id,
                    goal_id=goal_id,
                    task_id=task_id,
                    proficiency_delta=delta,
                    scores=result.get("scores", {}),
                    feedback=feedback_text,
                    db_connection=db_connection,
                    current_task=current_task,
                    conversation_history=self._turn_window_to_history(turn_window),
                    native_language=native_language,
                )
                result["task_completed"] = bool(db_result.get("task_completed", False))
                result["task_ready_to_complete"] = bool(db_result.get("task_ready_to_complete", False))
                result["total_proficiency"] = db_result.get("total_proficiency", 0)
                result["task_score"] = db_result.get("task_score", 0)
                if db_result.get("completion_feedback"):
                    result["completion_feedback"] = db_result["completion_feedback"]
                # 保留 DB 返回的 task_title / scenario_title
                if db_result.get("task_title"):
                    result["task_title"] = db_result["task_title"]
                if db_result.get("scenario_title"):
                    result["scenario_title"] = db_result["scenario_title"]
            except Exception as e:
                logger.error(f"[BATCH_EVAL] DB update failed: {e}")

        return result

    async def _update_user_proficiency(self, **kwargs) -> Dict[str, Any]:
        """Thin delegator to ProficiencyScoringWorkflow — kept on this class so
        unit tests can patch it directly on BatchEvaluationWorkflow instances."""
        return await self.proficiency_workflow._update_user_proficiency(**kwargs)

    # ---------- LLM 调用 ----------

    async def _call_llm(
        self,
        turn_window: List[Dict[str, Any]],
        current_task: Dict[str, Any],
        native_language: str,
        target_language: str,
    ) -> Dict[str, Any]:
        """Call dashscope qwen-turbo with batch-evaluation prompt."""
        if not _DASHSCOPE_AVAILABLE:
            raise RuntimeError("dashscope SDK not available")
        if not self._api_key:
            raise RuntimeError("DASHSCOPE_API_KEY not configured")

        prompt = self._build_prompt(
            turn_window=turn_window,
            current_task=current_task,
            native_language=native_language,
            target_language=target_language,
        )

        # dashscope Generation.call is sync — wrap in executor to not block loop
        import asyncio
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: Generation.call(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                result_format="message",
                api_key=self._api_key,
            ),
        )

        if not response or not getattr(response, "output", None):
            raise RuntimeError(f"Empty dashscope response: {response}")

        # Parse message content
        try:
            content = response.output.choices[0].message.content
        except (AttributeError, IndexError, KeyError) as e:
            raise RuntimeError(f"Unexpected dashscope response shape: {e}") from e

        if isinstance(content, list):
            # Some qwen variants return list[{'text': ...}]
            content = " ".join(
                seg.get("text", "") if isinstance(seg, dict) else str(seg)
                for seg in content
            )
        content = (content or "").strip()

        # Strip possible markdown fences
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)

        parsed = json.loads(content)
        return self._validate_llm_result(parsed)

    def _build_prompt(
        self,
        turn_window: List[Dict[str, Any]],
        current_task: Dict[str, Any],
        native_language: str,
        target_language: str,
    ) -> str:
        """Build prompt per docs/batch-evaluation-agent-design.md Section VI."""
        window_size = len(turn_window)
        keywords = current_task.get("keywords") or []
        task_description = current_task.get("task_description") or ""

        formatted_turns = "\n".join(
            f"Turn {t.get('turn_index', i + 1)} — "
            f"Student: {t.get('user_content', '')} | "
            f"Tutor: {t.get('ai_response', '')}"
            for i, t in enumerate(turn_window)
        )

        return f"""You are an expert language teaching evaluator. Analyze {window_size} conversation turns.

## CRITICAL OUTPUT CONSTRAINT
The "delta" field MUST use the PACED mapping defined below (0 / 1 / 2 / 2 / 3 scale, clamped to 0-10).
A single strong window does NOT complete a task — the student should practice for 3-4 windows (12-16 turns) to accumulate task_score >= 9.
Do NOT output delta >= 5 in normal cases; that would advance the user too fast and feel unnatural.

## Student Profile
- Target Language: {target_language}
- Native Language: {native_language}
- Task: {task_description}
- Required Keywords: {keywords}

## Conversation Window
{formatted_turns}
(Format: "Turn N — Student: ... | Tutor: ...")

## Scoring Criteria (0-10 each)
- keyword_coverage: unique keywords used across ALL turns / total keywords × 10
  (CRITICAL: same keyword repeated across turns = ONE hit only, prevents cheating)
- grammar_quality: aggregate grammar accuracy across {window_size} turns
- topic_relevance: consistency of staying on task
- fluency: avg response length, use of connectors, sentence completeness

## Teaching Mode Decision — STRICT RULES
- "correct" REQUIRED if ANY holds:
  * keyword_coverage < 4 (student barely used task keywords)
  * topic_relevance < 5 (student drifted off task)
  * Student used abstract filler, numbers-as-words, or irrelevant chunks (e.g. "七七六六零", "积极努力") instead of real task content
- "guide" ONLY if keyword_coverage >= 4 AND topic_relevance >= 5 AND grammar_quality >= 4

## guide — STRICT SCOPE RULE
- guide MUST stay within the CURRENT task: "{task_description}"
- next_topic_hint MUST be a DEEPENING or VARIATION of the current task, NEVER a different/next task.
- Examples for current task "greet customer in Japanese":
  * "ask about customer's needs" ✓ (still greeting/onboarding context)
  * "recommend products" ✗ (this belongs to a LATER task)
  * "say goodbye" ✗ (this belongs to a LATER task)
- If the current task is fully mastered, repeat/vary it — do NOT advance the topic.

## Delta Rules — PACED (3-4 strong windows to complete a task)
- delta is 0-10, representing how much THIS window advances the subtask toward completion.
- Task completes at cumulative task_score >= 9. With this paced scale, a student needs 3-4 strong windows (12-16 turns) to accumulate task_score >= 9 — this feels natural and ensures real practice.
- Mapping by unique_keyword_hits AND topic_relevance AND grammar_quality:
  * hits >= 3 AND topic_relevance >= 7 AND grammar_quality >= 6 → delta = 3 (strong window)
  * hits >= 3 AND topic_relevance >= 5 → delta = 2
  * hits == 2 → delta = 2
  * hits == 1 AND meaningful attempt in {target_language} → delta = 1 (participation)
  * hits == 0 OR topic_relevance < 4 → delta = 0
- Do NOT output delta >= 5 in normal cases — that would complete the task in a single window and break pacing.
- Correction penalties (applied AFTER mapping above):
  * hard correction in tutor responses → delta × 0.5 (round down, floor at 0)
  * soft correction → delta × 0.7 (round down, floor at 0)
- Final delta is an integer in [0, 10].

## Participation Reward
If the student made a meaningful attempt in {target_language} (avg content length >= 10 chars, uses target-language characters, not just numbers/abstract filler), give at least delta = 1 even if hits are low. This rewards effort and prevents discouragement.

## Output (strict JSON, no markdown wrapper)
{{
  "delta": <integer 0-10 — see Delta Rules above (PACED scale). Typical: 3 for strong, 2 for solid, 1 for participation, 0 for none. Do NOT output >=5 in normal cases.>,
  "teaching_mode": "guide" | "correct",
  "scores": {{ "keyword_coverage": 0-10, "grammar_quality": 0-10, "topic_relevance": 0-10, "fluency": 0-10 }},
  "next_topic_hint": "<in {target_language}, null if mode=correct>",
  "correction_guidance": {{
    "error_type": "keyword_coverage | topic_mismatch | grammar | vocabulary",
    "native_explanation": "<in {native_language}>",
    "correct_example": "<in {target_language}>",
    "retry_instruction": "<in {target_language}>"
  }},
  "improvement_tips": ["<1-2 tips in {native_language}>"],
  "keyword_coverage_detail": {{ "matched": [], "missed": [], "coverage_ratio": 0.0 }}
}}"""

    def _validate_llm_result(self, parsed: Any) -> Dict[str, Any]:
        """Normalize LLM output — clamp delta, ensure keys exist."""
        if not isinstance(parsed, dict):
            raise ValueError(f"LLM output not a dict: {type(parsed)}")

        delta = parsed.get("delta", 0)
        try:
            delta = int(delta)
        except (TypeError, ValueError):
            delta = 0
        delta = max(0, min(10, delta))
        parsed["delta"] = delta

        # Sanity-check (PACED scale): warn if LLM produces delta >= 5 — that would
        # complete the task in a single window and break pacing. Also warn on
        # high coverage + delta == 0 (likely LLM ignoring participation reward).
        try:
            _kc = float((parsed.get("scores") or {}).get("keyword_coverage", 0))
        except (TypeError, ValueError):
            _kc = 0.0
        if delta >= 5:
            logger.warning(
                f"[BATCH_EVAL] LLM returned delta={delta} (>=5) — expected PACED scale 0/1/2/3. "
                f"Prompt drift? keyword_coverage={_kc}"
            )
        elif _kc >= 7 and delta == 0:
            logger.warning(
                f"[BATCH_EVAL] LLM returned delta=0 despite keyword_coverage={_kc} "
                f"(expected delta>=2). Prompt drift or schema regression?"
            )

        mode = parsed.get("teaching_mode", "guide")
        if mode not in ("guide", "correct"):
            mode = "guide"
        parsed["teaching_mode"] = mode

        scores = parsed.get("scores", {}) or {}
        for key in ("keyword_coverage", "grammar_quality", "topic_relevance", "fluency"):
            try:
                scores[key] = float(scores.get(key, 0))
            except (TypeError, ValueError):
                scores[key] = 0.0
        parsed["scores"] = scores

        tips = parsed.get("improvement_tips", [])
        if not isinstance(tips, list):
            tips = []
        parsed["improvement_tips"] = [str(t) for t in tips][:3]

        return parsed

    # ---------- 规则降级 ----------

    def _rule_based_fallback(
        self,
        turn_window: List[Dict[str, Any]],
        current_task: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        纯规则评分（LLM 不可用时）— PACED scale (0/1/2/2/3):
        - 统计跨轮 unique keyword 命中数，直接映射 delta
        - 检测 tutor 回复中的 hard/soft correction 乘惩罚
        - 参与奖励：avg content >= 10 chars → 保底 delta=1
        - 3-4 次 batch_eval (12-16 轮) 累积到 task_score >= 9 才完成任务
        """
        keywords = [k for k in (current_task.get("keywords") or []) if k]
        target_language = current_task.get("target_language") or "English"
        combined_user = " ".join((t.get("user_content") or "") for t in turn_window).lower()
        combined_ai = " ".join((t.get("ai_response") or "") for t in turn_window).lower()

        matched = []
        missed = []
        for kw in keywords:
            if kw and kw.lower() in combined_user:
                matched.append(kw)
            else:
                missed.append(kw)

        unique_hits = len(matched)
        # PACED delta scale — hits 0→0, 1→1, 2→2, ≥3→3.
        if unique_hits == 0:
            delta = 0
        elif unique_hits == 1:
            delta = 1
        elif unique_hits == 2:
            delta = 2
        else:
            delta = 3

        # Participation reward: if the student produced meaningful content
        # in the target language beyond just parroting keywords, give delta>=1.
        # Strip matched keywords per-turn; compute avg remaining chars.
        import re as _re
        stripped_lens = []
        for t in turn_window:
            content = (t.get("user_content") or "").lower()
            for kw in matched:
                if kw:
                    content = content.replace(kw.lower(), "")
            content = content.strip()
            stripped_lens.append(len(content))
        avg_chars_per_turn = (sum(stripped_lens) / len(stripped_lens)) if stripped_lens else 0.0
        has_target_lang_chars = any(
            _re.search(r"[A-Za-z\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]", (t.get("user_content") or ""))
            for t in turn_window
        )
        # Anti-cheat: hits=1 with parrot-style short turns → drop to 0
        # (preserves the repeated-keyword cheat test: "check-in check-in ...")
        if unique_hits == 1 and avg_chars_per_turn < 10:
            delta = 0
        # Participation reward: meaningful attempt → at least delta=1
        if avg_chars_per_turn >= 10 and has_target_lang_chars and delta < 1:
            delta = 1

        # Correction detection
        correction_penalty = 1.0
        for marker in _HARD_CORRECTION_MARKERS:
            if marker.lower() in combined_ai:
                correction_penalty = 0.5
                break
        else:
            for marker in _SOFT_CORRECTION_MARKERS:
                if marker.lower() in combined_ai:
                    correction_penalty = 0.7
                    break

        # Apply correction penalty to delta (floor at 0, ceil at 10).
        delta = max(0, min(10, int(delta * correction_penalty)))

        # For downstream scoring compatibility — map delta back to a nominal
        # final_score for teaching_mode / scores fields.
        final_score = max(0, min(10, unique_hits * 3 + 1))

        coverage_ratio = (unique_hits / len(keywords)) if keywords else 0.0

        # Teaching mode: force correct when coverage is very low (student off-task).
        if coverage_ratio < 0.3:
            teaching_mode = "correct"
        elif coverage_ratio >= 0.5 and final_score >= 5:
            teaching_mode = "guide"
        else:
            teaching_mode = "correct"

        scores = {
            "keyword_coverage": round(coverage_ratio * 10, 1),
            "grammar_quality": 5.0,  # unknown without LLM — neutral
            "topic_relevance": 5.0 if unique_hits >= 1 else 3.0,
            "fluency": 5.0,
        }

        improvement_tips: List[str] = []
        if missed:
            sample = missed[:2]
            improvement_tips.append(
                f"尝试在下次对话中使用 {', '.join(repr(k) for k in sample)}"
            )

        correction_guidance = None
        next_topic_hint = None
        if teaching_mode == "correct":
            target_kw = missed[0] if missed else (keywords[0] if keywords else "the target word")
            example_templates = {
                "English": f"I would like to {target_kw}.",
                "Japanese": f"{target_kw}をお願いします。",
                "Chinese": f"请问{target_kw}。",
            }
            retry_templates = {
                "English": f"Let's try again — please use the word '{target_kw}'.",
                "Japanese": f"もう一度やってみましょう — 「{target_kw}」を使ってください。",
                "Chinese": f"我们再来一次 — 请使用词语'{target_kw}'。",
            }
            correct_example = example_templates.get(target_language, example_templates["English"])
            retry_instruction = retry_templates.get(target_language, retry_templates["English"])
            correction_guidance = {
                "error_type": "keyword_coverage",
                "native_explanation": (
                    f"在 {len(turn_window)} 轮对话中你只用到了 {unique_hits} 个关键词，"
                    f"可以尝试使用 {', '.join(missed[:3]) or '更多任务相关关键词'}"
                ) if missed else "请继续围绕任务关键词展开练习",
                "correct_example": correct_example,
                "retry_instruction": retry_instruction,
            }
        else:
            if missed:
                next_topic_hint = f"Try to use: {', '.join(missed[:2])}"

        return {
            "delta": delta,
            "teaching_mode": teaching_mode,
            "scores": scores,
            "next_topic_hint": next_topic_hint,
            "correction_guidance": correction_guidance,
            "improvement_tips": improvement_tips,
            "keyword_coverage_detail": {
                "matched": matched,
                "missed": missed,
                "coverage_ratio": round(coverage_ratio, 3),
            },
        }

    # ---------- helpers ----------

    @staticmethod
    def _turn_window_to_history(turn_window: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Flatten turn window into [{role, content}, ...] so downstream helpers
        (e.g. _generate_improvement_tips) can consume it like a normal history."""
        history: List[Dict[str, Any]] = []
        for t in turn_window:
            uc = t.get("user_content")
            ar = t.get("ai_response")
            if uc:
                history.append({"role": "user", "content": uc})
            if ar:
                history.append({"role": "assistant", "content": ar})
        return history


batch_evaluation_workflow = BatchEvaluationWorkflow()
