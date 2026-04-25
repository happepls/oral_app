import os
import json
import base64
import asyncio
import logging
import httpx
import time
import re
import traceback
import os
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dashscope.audio.qwen_omni import (
    OmniRealtimeCallback,
    OmniRealtimeConversation,
    MultiModality,
    AudioFormat
)
import dashscope

# --- Configuration & Logging ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.main")

# Workflow Service URL
WORKFLOW_SERVICE_URL = os.getenv("WORKFLOW_SERVICE_URL", "http://workflow-service:3006")

# DashScope API Key
api_key = os.getenv("QWEN3_OMNI_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
if not api_key:
    logger.error("QWEN3_OMNI_API_KEY not found in environment")
    raise ValueError("QWEN3_OMNI_API_KEY environment variable is required")
dashscope.api_key = api_key
logger.info("Using real DashScope API with provided API key")

# 双阶段会话状态，key=f"{user_id}:{scenario}" — 每个场景独立维护状态
# TTL-aware wrapper: 条目超过 72h 自动清理，最多保留 2000 个活跃 key（LRU）
import time as _time
from collections import OrderedDict as _OrderedDict

_SESSION_PHASES_TTL = 72 * 3600   # 72 小时（秒）
_SESSION_PHASES_MAX = 2000         # 最大条目数

class _TTLDict:
    """线程不安全的简单 TTL + LRU 字典，适合单进程 asyncio 服务。"""
    def __init__(self, ttl: int, maxsize: int):
        self._ttl = ttl
        self._maxsize = maxsize
        self._store: _OrderedDict = _OrderedDict()   # key → (value, last_access_ts)

    def _now(self) -> float:
        return _time.monotonic()

    def _is_expired(self, ts: float) -> bool:
        return (self._now() - ts) > self._ttl

    def _evict_expired(self):
        expired = [k for k, (_, ts) in list(self._store.items()) if self._is_expired(ts)]
        for k in expired:
            del self._store[k]

    def get(self, key, default=None):
        if key not in self._store:
            return default
        value, ts = self._store[key]
        if self._is_expired(ts):
            del self._store[key]
            return default
        # 更新访问时间（LRU）
        self._store.move_to_end(key)
        self._store[key] = (value, self._now())
        return value

    def __contains__(self, key):
        return self.get(key) is not None

    def __getitem__(self, key):
        result = self.get(key)
        if result is None and key not in self._store:
            raise KeyError(key)
        return result

    def __setitem__(self, key, value):
        self._store[key] = (value, self._now())
        self._store.move_to_end(key)
        # LRU 淘汰
        if len(self._store) > self._maxsize:
            self._store.popitem(last=False)

    def __delitem__(self, key):
        del self._store[key]

    def setdefault(self, key, default=None):
        existing = self.get(key)
        if existing is not None:
            return existing
        self[key] = default
        return default

    def copy_value(self, key):
        """返回 value 的浅拷贝（用于日志记录）。"""
        v = self.get(key)
        return v.copy() if isinstance(v, dict) else v

    def purge_expired(self):
        """显式触发过期清理（可在低流量时调用）。"""
        self._evict_expired()

session_phases: _TTLDict = _TTLDict(ttl=_SESSION_PHASES_TTL, maxsize=_SESSION_PHASES_MAX)

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Service Utilities ---

async def get_user_context(token: str, scenario: str = None):
    """Fetches user profile and goal context from user-service.
    
    Args:
        token: JWT token
        scenario: Optional scenario name to find the correct current task
    """
    user_service_url = os.getenv("USER_SERVICE_URL", "http://localhost:3000")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{user_service_url}/api/users/profile",
                headers={"Authorization": f"Bearer {token}"},
                timeout=5.0
            )
            if resp.status_code == 200:
                response_data = resp.json().get('data', {})
                # Handle both {data: user} and {data: {user: user}} formats
                data = response_data.get('user', response_data) if isinstance(response_data, dict) else response_data
                logger.info(f"User profile fetched: id={data.get('id')}, nickname={data.get('nickname')}")
                goal_resp = await client.get(
                    f"{user_service_url}/api/users/goals/active",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=5.0
                )
                if goal_resp.status_code == 200:
                    goal_data = goal_resp.json().get('data', {})
                    # Handle {data: {goal: goal}} format
                    active_goal = goal_data.get('goal', goal_data)

                    # Fetch current task info based on scenario
                    if scenario and active_goal.get('scenarios'):
                        # Find matching scenario
                        scenarios = active_goal.get('scenarios', [])
                        matched_scenario = None
                        for s in scenarios:
                            if s.get('title', '').lower() == scenario.lower() or \
                               scenario.lower() in s.get('title', '').lower() or \
                               s.get('title', '').lower() in scenario.lower():
                                matched_scenario = s
                                break
                        
                        if matched_scenario:
                            # Find first incomplete task in this scenario
                            tasks = matched_scenario.get('tasks', [])
                            current_task = None
                            for task in tasks:
                                if isinstance(task, dict) and task.get('status') != 'completed':
                                    current_task = task
                                    break
                            
                            # If all tasks completed, use the last one
                            if not current_task:
                                completed_tasks = [t for t in tasks if isinstance(t, dict) and t.get('status') == 'completed']
                                if completed_tasks:
                                    current_task = completed_tasks[-1]
                            
                            if current_task:
                                active_goal['current_task'] = {
                                    'id': current_task.get('id'),
                                    'task_description': current_task.get('text'),
                                    'scenario_title': matched_scenario.get('title', '')
                                }
                                logger.info(f"Found scenario-matched current task: {current_task.get('text')} in {matched_scenario.get('title')}")
                    else:
                        # Fallback to global current-task endpoint
                        task_resp = await client.get(
                            f"{user_service_url}/api/users/goals/current-task",
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=5.0
                        )
                        if task_resp.status_code == 200:
                            task_data = task_resp.json().get('data', {})
                            current_task = task_data.get('task', {})
                            current_scenario = task_data.get('scenario', {})
                            if current_task:
                                active_goal['current_task'] = {
                                    'id': current_task.get('id'),
                                    'task_description': current_task.get('text'),
                                    'scenario_title': current_scenario.get('title', '')
                                }

                    data['active_goal'] = active_goal
                return data
            else:
                logger.error(f"Failed to fetch user context: {resp.status_code} {resp.text}")
                return None
    except Exception as e:
        logger.error(f"Error fetching user context: {e}")
        return None

async def save_single_message(session_id: str, user_id: str, role: str, content: str, audio_url: str = None):
    """Saves a single message to conversation-service."""
    conv_service_url = os.getenv("CONVERSATION_SERVICE_URL", "http://localhost:8083")
    payload = {
        "role": role,
        "content": content,
        "userId": user_id,  # Keep as string since user IDs are UUIDs
        "audioUrl": audio_url
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{conv_service_url}/history/{session_id}",
                json=payload,
                timeout=5.0
            )
            if resp.status_code not in [200, 201]:
                logger.error(f"Failed to save message: {resp.status_code} {resp.text}")
            else:
                logger.info(f"Saved {role} message to session {session_id}")
    except Exception as e:
        logger.error(f"Error saving message: {e}")

async def execute_action_with_response(action_name: str, params: dict, token: str, user_id: str, session_id: str, context: dict = None):
    """Executes a system action (like updating goals) by calling the appropriate microservice."""
    user_service_url = os.getenv("USER_SERVICE_URL", "http://user-service:3000")

    if action_name == "update_profile":
        try:
            async with httpx.AsyncClient() as client:
                await client.put(
                    f"{user_service_url}/api/users/profile",
                    json=params,
                    headers={"Authorization": f"Bearer {token}"}
                )
                logger.info(f"Profile updated for user {user_id}: {params}")
        except Exception as e:
            logger.error(f"Failed to update profile: {e}")

    elif action_name == "update_task_score":
        try:
            goal_id = (context or {}).get('active_goal', {}).get('id')
            if not goal_id:
                profile = await get_user_context(token)
                goal_id = profile.get('active_goal', {}).get('id')

            if goal_id:
                scenario_title = context.get('custom_topic', 'General Practice')
                if " (Tasks:" in scenario_title:
                    scenario_title = scenario_title.split(" (Tasks:")[0].strip()

                # Use correct parameter names: 'scenario' not 'scenarioTitle'
                payload = {
                    "scenario": scenario_title,
                    "task": params.get('task', 'NEXT_PENDING_TASK'),
                    "scoreDelta": params.get('scoreDelta', 10),
                    "feedback": params.get('feedback', '')
                }

                # Use correct internal API path: /api/users/internal/users/:id/tasks/complete
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        f"{user_service_url}/api/users/internal/users/{user_id}/tasks/complete",
                        json=payload,
                        headers={"Authorization": f"Bearer {token}"}
                    )
                    if resp.status_code == 200:
                        logger.info(f"Task scored for user {user_id}: {payload}")
                        return resp.json().get('data', {})
                    else:
                        logger.error(f"Failed to score task: {resp.status_code} {resp.text}")
        except Exception as e:
            logger.error(f"Failed to update task score: {e}")

    return None
_TARGET_LANGUAGE_CODES = {
    'English': ['en'],
    'Chinese': ['zh'],
    'Japanese': ['ja'],
    'Spanish': ['es'],
    'French': ['fr'],
    'Korean': ['ko'],
    'German': ['de'],
    'Portuguese': ['pt'],
    'Russian': ['ru'],
    'Italian': ['it'],
    'Arabic': ['ar'],
    'Hindi': ['hi'],
    'Thai': ['th'],
    'Vietnamese': ['vi'],
    'Indonesian': ['id'],
}

# ---------------------------------------------------------------------------
# Batch Evaluation Helpers (Feature 1 — 批量评估 Agent)
# ---------------------------------------------------------------------------

_INLINE_TIP_RE = re.compile(
    r'[「『"\u201c\u2018]([^」』"\u201d\u2019]{2,30})[」』"\u201d\u2019]'
)

def _extract_inline_tips(ai_response: str) -> list:
    """Extract quoted phrases from AI response as inline tips (no LLM call).

    Matches CJK quotes「」『』, straight double/single quotes, and curly quotes.
    Dedupe + take first 2.
    """
    if not ai_response:
        return []
    matches = _INLINE_TIP_RE.findall(ai_response)
    seen = set()
    result = []
    for m in matches:
        s = m.strip()
        if len(s) >= 2 and s not in seen:
            seen.add(s)
            result.append(s)
        if len(result) >= 2:
            break
    return result


def _format_teaching_directive(result: dict, target_language: str, native_language: str) -> str:
    """Format a one-time teaching directive to append to the session prompt.

    Consumed by DashScope on the NEXT response only — the caller MUST restore
    base prompt on the turn after (see WebSocketCallback.pending_directive).
    """
    mode = (result or {}).get("teaching_mode", "guide")

    if mode == "correct":
        guidance = (result or {}).get("correction_guidance") or {}
        native_expl = guidance.get("native_explanation", "") or ""
        correct_ex = guidance.get("correct_example", "") or ""
        retry_inst = guidance.get("retry_instruction", "") or ""
        # Bug D.3: if both example and retry_instruction are empty, the CORRECT
        # directive would produce an empty/broken response. Gracefully degrade
        # to GUIDE mode with native_explanation as hint.
        if not correct_ex.strip() and not retry_inst.strip():
            hint = native_expl or (result or {}).get("next_topic_hint") or ""
            return (
                "[TEACHING DIRECTIVE — ONE-TIME USE, DO NOT MENTION TO STUDENT]\n"
                "Mode: GUIDE (degraded from CORRECT — no example available)\n"
                "In your NEXT response, naturally steer the conversation toward:\n"
                f"\"{hint}\"\n"
                "Continue the current task. Weave this direction into your response naturally."
            )
        return (
            "[TEACHING DIRECTIVE — ONE-TIME USE, DO NOT MENTION TO STUDENT]\n"
            "Mode: CORRECT\n"
            "In your NEXT response ONLY (3-4 sentences max):\n"
            f"1. Briefly acknowledge the student's attempt (1 sentence, in {target_language}).\n"
            f"2. [NATIVE: {native_expl}]\n"
            f"   → You MAY briefly use {native_language} to deliver this explanation.\n"
            f"3. Provide model example: \"{correct_ex}\"\n"
            f"4. End with: \"{retry_inst}\"\n"
            "IMPORTANT: After this ONE correction response, the "
            f"\"YOU MUST RESPOND ENTIRELY IN {target_language}\" rule resumes from the NEXT response onward.\n"
        )

    # default: guide
    hint = (result or {}).get("next_topic_hint") or ""
    return (
        "[TEACHING DIRECTIVE — ONE-TIME USE, DO NOT MENTION TO STUDENT]\n"
        "Mode: GUIDE\n"
        "In your NEXT response, naturally steer the conversation toward:\n"
        f"\"{hint}\"\n"
        "Continue the current task. Weave this direction into your response naturally."
    )


async def _handle_turn_with_accumulator(
    callback,
    conversation,
    websocket,
    user_id: str,
    goal_id: int,
    task_id: int,
    user_content: str,
    ai_response: str,
    current_task: dict,
    native_language: str,
    token: str,
):
    """Accumulate turns; dynamically trigger batch evaluation via workflow-service.

    Window size: 3 turns for the first 2 evals (faster initial feedback),
    then 4 turns for subsequent evals (deeper practice).

    Returns None when still accumulating; returns a dict shaped like the old
    `call_proficiency_workflow` result when a batch evaluation was performed,
    so the caller can reuse the existing task_completed side-effects.
    """
    # Task-switch reset
    if callback.current_eval_task_id != task_id:
        callback.turn_accumulator = []
        callback.current_eval_task_id = task_id
        callback.batch_eval_count = 0

    # Append current turn
    callback.turn_accumulator.append({
        "turn_index": len(callback.turn_accumulator) + 1,
        "user_content": user_content or "",
        "ai_response": ai_response or "",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })

    # Dynamic window: 3 turns for first 2 evals, then 4
    window_threshold = 3 if callback.batch_eval_count < 2 else 4

    # Below threshold → inline tips only, no batch eval
    if len(callback.turn_accumulator) < window_threshold:
        tips = _extract_inline_tips(ai_response)
        # Populate `total` from cache (last batch eval) or initial proficiency
        # from user_context. Avoids a DB query on every inline turn.
        if callback.last_total_proficiency is None:
            try:
                active_goal = (callback.user_context or {}).get('active_goal') or {}
                callback.last_total_proficiency = int(active_goal.get('current_proficiency') or 0)
            except (TypeError, ValueError):
                callback.last_total_proficiency = 0
        total_proficiency = callback.last_total_proficiency
        await callback._safe_send({
            "type": "proficiency_update",
            "payload": {
                "delta": 0,
                "total": total_proficiency,
                "task_id": task_id,
                "task_score": 0,
                "message": "",
                "improvement_tips": tips,
                "tips": tips,
                "tip_source": "inline",
            },
        })
        logger.info(f"[BATCH_EVAL] accumulating turn {len(callback.turn_accumulator)}/{window_threshold}, inline tips={len(tips)}, total={total_proficiency}")
        return None

    # ≥threshold turns — trigger batch eval
    logger.info(f"[BATCH_EVAL] triggering eval #{callback.batch_eval_count + 1} with {len(callback.turn_accumulator)} turns (threshold={window_threshold})")
    payload = {
        "user_id": user_id,
        "goal_id": goal_id,
        "task_id": task_id,
        "current_task": current_task,
        "native_language": native_language,
        "turn_window": callback.turn_accumulator,
        "window_size": len(callback.turn_accumulator),
    }
    # Reset accumulator and increment eval counter
    callback.turn_accumulator = []
    callback.batch_eval_count += 1

    result = None
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{WORKFLOW_SERVICE_URL}/api/workflows/proficiency-scoring/batch-evaluate",
                json=payload,
                headers={"Authorization": f"Bearer {token}"} if token else None,
            )
            if resp.status_code == 200:
                result = resp.json().get("data", {}) or {}
                logger.info(
                    f"[BATCH_EVAL] batch_evaluate called → delta={result.get('delta')} "
                    f"mode={result.get('teaching_mode')} "
                    f"task_completed={result.get('task_completed')}"
                )
            else:
                logger.error(f"[BATCH_EVAL] workflow returned {resp.status_code}: {resp.text[:300]}")
                return None
    except Exception as e:
        logger.error(f"[BATCH_EVAL] HTTP error: {e}")
        return None

    delta = int(result.get("delta", 0) or 0)
    task_completed = bool(result.get("task_completed", False))
    improvement_tips = result.get("improvement_tips", []) or []
    target_language = current_task.get("target_language") or callback.user_context.get("target_language", "English")

    # Refresh cached total so subsequent inline turns reflect latest DB value
    try:
        callback.last_total_proficiency = int(result.get("total_proficiency", 0) or 0)
    except (TypeError, ValueError):
        pass

    # Send proficiency_update (backward-compatible shape + new fields)
    await callback._safe_send({
        "type": "proficiency_update",
        "payload": {
            "delta": delta,
            "total": result.get("total_proficiency", 0),
            "task_id": result.get("task_id", task_id),
            "task_score": result.get("task_score", 0),
            "message": "",
            "improvement_tips": improvement_tips,
            "tips": improvement_tips,
            "tip_source": "batch_eval",
            "scores": result.get("scores"),
            "teaching_mode": result.get("teaching_mode"),
            "task_completed": task_completed,
        },
    })

    # Inject teaching directive (only if task NOT completed — on completion we'll
    # refresh the whole prompt anyway)
    if not task_completed:
        try:
            directive = _format_teaching_directive(result, target_language, native_language)
            if directive:
                callback.pending_directive = directive
                # Refresh session prompt WITH directive appended
                callback._update_session_prompt(extra_directive=directive)
                logger.info(f"[BATCH_EVAL] directive injected (mode={result.get('teaching_mode')})")
        except Exception as e:
            logger.warning(f"[BATCH_EVAL] directive injection failed: {e}")

    # Return in the shape expected by the existing call-site (so task_completed
    # side-effects — next-task fetch, prompt refresh — work unchanged).
    return {
        "proficiency_delta": delta,
        "total_proficiency": result.get("total_proficiency", 0),
        "task_completed": task_completed,
        "task_ready_to_complete": bool(result.get("task_ready_to_complete", False)),
        "task_score": result.get("task_score", 0),
        "improvement_tips": improvement_tips,
        "task_id": result.get("task_id", task_id),
        "task_title": result.get("task_title", current_task.get("task_description", "Task")),
        "scenario_title": result.get("scenario_title", current_task.get("scenario_title", "")),
        "message": "",
    }


# ---------------------------------------------------------------------------
# Daily Q&A Helpers (Feature 2 — 今日问答)
# ---------------------------------------------------------------------------

_DAILY_QA_PASSED_MARKER = "[DAILY_QA_PASSED]"
_DAILY_QA_PASSED_RE = re.compile(r"\[DAILY_QA_PASSED\]", re.IGNORECASE)
_DAILY_QA_TTL_SECONDS = 48 * 3600  # 48h matches test expectation
_DAILY_QA_POOL_TTL_SECONDS = 30 * 24 * 3600  # 30d per design
_DAILY_QA_POOL_CAP = 10

_DAILY_QA_FALLBACK = {
    "English": [
        {"question_text": "Hi, could you help me find the nearest subway station?",
         "reference_answer": "当然可以！最近的地铁站就在前面那条街，往前走两个路口左转就能看到入口。如果你愿意，我可以陪你走过去。"},
        {"question_text": "Excuse me, do you know a good local restaurant around here?",
         "reference_answer": "我推荐街角那家小餐馆，他们的招牌菜很地道，价格也实惠。我自己周末经常去，每次都吃得很满足。"},
        {"question_text": "Hello! I'm visiting for the first time. What's a must-see place?",
         "reference_answer": "你一定要去市中心的老城区逛一逛！那里的建筑很有历史感，街边还有不少特色小店和咖啡馆，非常适合慢慢散步。"},
    ],
    "Japanese": [
        {"question_text": "すみません、この近くで美味しいレストランを知っていますか？",
         "reference_answer": "附近这家拉面店真的很不错，汤头很浓郁，配料也很丰富。我经常带朋友去，他们都说比想象中还要好吃。"},
        {"question_text": "こんにちは！初めて来たんですが、おすすめの場所はありますか？",
         "reference_answer": "我建议你去附近的神社看看，环境很安静，走在那边会让人心情放松。如果天气好，傍晚的景色也特别漂亮。"},
        {"question_text": "ちょっと道に迷ったんですが、駅はどちらですか？",
         "reference_answer": "车站就在前面，沿着这条路一直走，过了第二个红绿灯往右拐就能看到。大概步行五分钟左右就到了。"},
    ],
    "Chinese": [
        {"question_text": "你好，请问附近有什么好吃的餐厅吗？",
         "reference_answer": "Yes! There's a really nice noodle place just around the corner. The portions are generous and the prices are pretty reasonable, so I go there pretty often."},
        {"question_text": "不好意思，最近的地铁站在哪里？",
         "reference_answer": "The nearest subway station is about a five-minute walk from here. Just head straight down this street and turn left at the second traffic light."},
        {"question_text": "你好！我第一次来这里，有什么推荐的地方吗？",
         "reference_answer": "I'd suggest checking out the riverside park in the late afternoon. The view is really nice, and there are plenty of small cafes nearby if you want to take a break."},
    ],
}

_DAILY_QA_LANG_CODE = {"English": "en", "Japanese": "ja", "Chinese": "zh"}


def _fallback_by_language(target_language: str) -> list:
    """Return a list of fallback question dicts keyed by target language.

    Unknown languages fall back to English so behaviour is predictable for the
    other 26 supported languages.
    """
    key = target_language if target_language in _DAILY_QA_FALLBACK else "English"
    lang_code = _DAILY_QA_LANG_CODE.get(key, "en")
    return [
        {
            "question_text": item["question_text"],
            "lang": lang_code,
            "reference_answer": item.get("reference_answer", ""),
        }
        for item in _DAILY_QA_FALLBACK[key]
    ]


# Back-compat shim: some callers still reference the old constant shape.
_DAILY_QA_FALLBACK_POOL = _fallback_by_language("English")


def _today_utc_str() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _strip_daily_qa_marker(text: str) -> str:
    """Remove [DAILY_QA_PASSED] marker from a string (used before TTS)."""
    if not text:
        return text or ""
    return _DAILY_QA_PASSED_RE.sub("", text).strip()


def _parse_daily_qa_pool_text(text: str) -> list:
    """Parse a qwen-turbo reply (possibly markdown-wrapped) into a list of question dicts."""
    if not text:
        return []
    stripped = text.strip()
    # Strip ```json fences if present
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", stripped, flags=re.DOTALL | re.IGNORECASE)
    if fence:
        stripped = fence.group(1).strip()
    try:
        parsed = json.loads(stripped)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    out = []
    for item in parsed:
        if isinstance(item, dict) and item.get("question_text"):
            out.append({
                "question_text": str(item.get("question_text")),
                "lang": str(item.get("lang") or ""),
                "reference_answer": str(item.get("reference_answer") or ""),
            })
        elif isinstance(item, str) and item.strip():
            out.append({"question_text": item.strip(), "lang": "", "reference_answer": ""})
    return out


async def _generate_daily_question_pool(target_language: str, native_language: str, count: int = 10) -> list:
    """Call qwen-turbo to generate a pool of daily practice questions.

    Two-step generation: 1) questions in target_language, 2) reference answers in native_language.
    On any error falls back to _DAILY_QA_FALLBACK_POOL.
    """
    count = max(1, min(int(count or 10), _DAILY_QA_POOL_CAP))
    prompt = (
        f"Generate exactly {count} short, friendly daily speaking-practice questions "
        f"for a learner practising {target_language}. Each question must be answerable "
        f"in 2-4 sentences and touch everyday life (food, hobbies, goals, feelings). "
        f"Return ONLY valid JSON: [{{\"question_text\": \"...\", \"lang\": \"<ISO 639-1>\"}}]. "
        f"Do NOT wrap in markdown. Questions must be in {target_language}."
    )
    loop = asyncio.get_running_loop()

    def _call():
        return dashscope.Generation.call(
            model=os.getenv("DAILY_QA_MODEL", "qwen-turbo"),
            messages=[{"role": "user", "content": prompt}],
            result_format="message",
        )

    try:
        resp = await loop.run_in_executor(None, _call)
    except Exception as e:
        logger.warning(f"[DAILY_QA] pool generation LLM call failed: {e} — using {target_language} fallback")
        return _fallback_by_language(target_language)

    # Extract text payload (DashScope result_format='message' vs 'text')
    text = None
    try:
        text = getattr(getattr(resp, "output", None), "text", None)
        if not text:
            choices = getattr(getattr(resp, "output", None), "choices", None) or []
            if choices:
                msg = getattr(choices[0], "message", None)
                text = getattr(msg, "content", None) if msg is not None else None
    except Exception as e:
        logger.warning(f"[DAILY_QA] unable to read response text: {e}")

    parsed = _parse_daily_qa_pool_text(text or "")
    if not parsed:
        logger.warning(f"[DAILY_QA] malformed/empty LLM output — using {target_language} fallback. raw={str(text)[:200]}")
        return _fallback_by_language(target_language)
    pool = parsed[:_DAILY_QA_POOL_CAP]

    # Step 2: Generate reference answers in native_language via a separate LLM call
    questions_for_ref = [q["question_text"] for q in pool]
    ref_prompt = (
        f"I have these {target_language} questions:\n"
        + "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions_for_ref))
        + f"\n\nFor each question, write a short sample answer (2-3 sentences) "
        f"in {native_language} ONLY. The answers must be entirely in {native_language}. "
        f"Return ONLY a JSON array of strings, one answer per question, in the same order. "
        f"Example: [\"answer1 in {native_language}\", \"answer2 in {native_language}\"]"
    )
    try:
        def _call_ref():
            return dashscope.Generation.call(
                model=os.getenv("DAILY_QA_MODEL", "qwen-turbo"),
                messages=[{"role": "user", "content": ref_prompt}],
                result_format="message",
            )
        ref_resp = await loop.run_in_executor(None, _call_ref)
        ref_text = None
        try:
            ref_text = getattr(getattr(ref_resp, "output", None), "text", None)
            if not ref_text:
                choices = getattr(getattr(ref_resp, "output", None), "choices", None) or []
                if choices:
                    msg = getattr(choices[0], "message", None)
                    ref_text = getattr(msg, "content", None) if msg is not None else None
        except Exception:
            pass
        if ref_text:
            ref_text = ref_text.strip()
            fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", ref_text, flags=re.DOTALL | re.IGNORECASE)
            if fence:
                ref_text = fence.group(1).strip()
            ref_answers = json.loads(ref_text)
            if isinstance(ref_answers, list):
                for i, ans in enumerate(ref_answers):
                    if i < len(pool) and isinstance(ans, str):
                        pool[i]["reference_answer"] = ans
                logger.info(f"[DAILY_QA] reference answers generated in {native_language} for {len(ref_answers)} questions")
    except Exception as e:
        logger.warning(f"[DAILY_QA] reference answer generation failed: {e}")

    return pool


async def handle_daily_question(redis, user_id: str, target_language: str = "English",
                                native_language: str = "Chinese") -> dict:
    """Return today's daily question for the user, hitting Redis cache first.

    Redis keys:
      daily_qa_pool:{user_id}:{YYYY-MM-DD}  — today's chosen question (48h TTL)
      daily_qa_passed:{user_id}:{YYYY-MM-DD} — set when student passes
    Returns: {"question_text": ..., "qa_date": ..., "passed": bool, "lang": ...}
    """
    if not user_id:
        raise ValueError("user_id required")
    date_str = _today_utc_str()
    cache_key = f"daily_qa_pool:{user_id}:{date_str}"
    passed_key = f"daily_qa_passed:{user_id}:{date_str}"

    cached_raw = await redis.get(cache_key)
    passed_raw = await redis.get(passed_key)
    passed = bool(passed_raw)

    if cached_raw is not None:
        try:
            data = json.loads(cached_raw if isinstance(cached_raw, str) else cached_raw.decode("utf-8"))
        except Exception:
            data = None
        # New shape: {"pool": [...], "index": n, "picked": {...}}
        if isinstance(data, dict) and isinstance(data.get("picked"), dict) and data["picked"].get("question_text"):
            picked = data["picked"]
            return {
                "question_text": picked.get("question_text", ""),
                "lang": picked.get("lang", ""),
                "reference_answer": picked.get("reference_answer", ""),
                "qa_date": date_str,
                "passed": passed,
            }
        # Legacy shape: {"question_text": ..., "lang": ...}
        if isinstance(data, dict) and data.get("question_text"):
            return {
                "question_text": data["question_text"],
                "lang": data.get("lang", ""),
                "reference_answer": data.get("reference_answer", ""),
                "qa_date": date_str,
                "passed": passed,
            }
        if isinstance(data, list) and data:
            first = data[0] if isinstance(data[0], dict) else {"question_text": str(data[0])}
            return {
                "question_text": first.get("question_text", ""),
                "lang": first.get("lang", ""),
                "reference_answer": first.get("reference_answer", ""),
                "qa_date": date_str,
                "passed": passed,
            }

    # Miss — generate a pool, take the first question, cache pool+index+picked (new shape)
    pool = await _generate_daily_question_pool(target_language, native_language, count=_DAILY_QA_POOL_CAP)
    if not pool:
        pool = _fallback_by_language(target_language)
    picked = pool[0]
    payload = {"pool": pool, "index": 0, "picked": picked}
    try:
        await redis.setex(cache_key, _DAILY_QA_TTL_SECONDS, json.dumps(payload, ensure_ascii=False))
    except Exception as e:
        logger.warning(f"[DAILY_QA] failed to cache question: {e}")

    return {
        "question_text": picked.get("question_text", ""),
        "lang": picked.get("lang", ""),
        "reference_answer": picked.get("reference_answer", ""),
        "qa_date": date_str,
        "passed": passed,
    }


async def get_daily_question_pool(redis, user_id: str, target_language: str = "English",
                                  native_language: str = "Chinese", count: int = 3) -> list:
    """Return up to `count` questions from today's pool for Pro user selection."""
    if not user_id:
        raise ValueError("user_id required")
    date_str = _today_utc_str()
    cache_key = f"daily_qa_pool:{user_id}:{date_str}"

    cached_raw = await redis.get(cache_key)
    pool = None

    if cached_raw is not None:
        try:
            data = json.loads(cached_raw if isinstance(cached_raw, str) else cached_raw.decode("utf-8"))
        except Exception:
            data = None
        if isinstance(data, dict) and isinstance(data.get("pool"), list):
            pool = data["pool"]
        elif isinstance(data, list):
            pool = data

    if not pool:
        pool = await _generate_daily_question_pool(target_language, native_language, count=_DAILY_QA_POOL_CAP)
        if not pool:
            pool = _fallback_by_language(target_language)
        picked = pool[0]
        payload = {"pool": pool, "index": 0, "picked": picked}
        try:
            await redis.setex(cache_key, _DAILY_QA_TTL_SECONDS, json.dumps(payload, ensure_ascii=False))
        except Exception as e:
            logger.warning(f"[DAILY_QA] failed to cache pool: {e}")

    result = []
    for i, q in enumerate(pool[:count]):
        if isinstance(q, dict):
            result.append({
                "question_text": q.get("question_text", ""),
                "reference_answer": q.get("reference_answer", ""),
                "lang": q.get("lang", ""),
                "index": i,
            })
        else:
            result.append({
                "question_text": str(q),
                "reference_answer": "",
                "lang": "",
                "index": i,
            })
    return result


async def _handle_daily_qa_marker(redis, user_id: str, websocket, ai_text: str) -> bool:
    """Detect [DAILY_QA_PASSED] in AI text → write Redis passed key + push WS frame.

    Returns True iff the marker was detected. No-op when marker absent.
    """
    if not ai_text or not _DAILY_QA_PASSED_RE.search(ai_text):
        return False
    date_str = _today_utc_str()
    passed_key = f"daily_qa_passed:{user_id}:{date_str}"
    try:
        await redis.setex(passed_key, _DAILY_QA_TTL_SECONDS, "1")
    except Exception as e:
        logger.warning(f"[DAILY_QA] failed to write passed key: {e}")

    # Persist pass to DB (fire-and-forget)
    try:
        _user_svc = os.getenv("USER_SERVICE_URL", "http://user-service:3000")
        async with httpx.AsyncClient() as _cli:
            await _cli.post(
                f"{_user_svc}/api/users/internal/users/{user_id}/daily-qa-pass",
                json={"question_text": (ai_text or "")[:500]},
                timeout=3.0,
            )
    except Exception as _e:
        logger.warning(f"[DAILY_QA] failed to persist pass to DB: {_e}")

    try:
        await websocket.send_json({
            "type": "daily_qa_completed",
            "payload": {"qa_date": date_str, "passed": True},
        })
    except Exception as e:
        logger.warning(f"[DAILY_QA] failed to push daily_qa_completed: {e}")
    logger.info(f"[DAILY_QA] marker detected → {passed_key} set + WS push")
    return True


async def _advance_daily_qa_pool(redis, user_id: str, date_str: str, *,
                                 target_language: str, native_language: str) -> dict:
    """Advance the user's daily-QA pool index and return the new picked question.

    Handles both new-shape (`{pool, index, picked}`) and legacy-shape cache values.
    If the pool has only one item, regenerates a fresh pool before advancing.
    Returns the new picked dict `{"question_text": ..., "lang": ...}`.
    """
    cache_key = f"daily_qa_pool:{user_id}:{date_str}"

    # Read + parse existing cache
    data = None
    try:
        cached_raw = await redis.get(cache_key)
        if cached_raw is not None:
            data = json.loads(cached_raw if isinstance(cached_raw, str) else cached_raw.decode("utf-8"))
    except Exception as e:
        logger.warning(f"[DAILY_QA] advance: read cache failed: {e}")
        data = None

    # Normalize into {pool, index, picked}
    pool: list = []
    index = 0
    if isinstance(data, dict) and isinstance(data.get("pool"), list) and data["pool"]:
        pool = data["pool"]
        try:
            index = int(data.get("index", 0))
        except Exception:
            index = 0
    elif isinstance(data, dict) and data.get("question_text"):
        # Legacy single-question shape → wrap, treat as index 0
        pool = [{"question_text": data["question_text"], "lang": data.get("lang", "")}]
        index = 0
    elif isinstance(data, list) and data:
        # Legacy list shape
        pool = [item if isinstance(item, dict) else {"question_text": str(item), "lang": ""} for item in data]
        index = 0

    # Regenerate if pool is empty or has <=1 item (no real alternative to rotate to)
    if len(pool) <= 1:
        try:
            fresh = await _generate_daily_question_pool(target_language, native_language, count=_DAILY_QA_POOL_CAP)
        except Exception as e:
            logger.warning(f"[DAILY_QA] advance: pool regeneration failed: {e}")
            fresh = []
        if not fresh:
            fresh = _fallback_by_language(target_language)
        # Append any new questions not already present, keep current first if any
        existing_texts = {p.get("question_text") for p in pool}
        for q in fresh:
            if q.get("question_text") not in existing_texts:
                pool.append(q)
        if not pool:
            pool = fresh

    new_index = (index + 1) % max(len(pool), 1)
    picked = pool[new_index] if pool else {"question_text": "", "lang": ""}
    payload = {"pool": pool, "index": new_index, "picked": picked}
    try:
        await redis.setex(cache_key, _DAILY_QA_TTL_SECONDS, json.dumps(payload, ensure_ascii=False))
    except Exception as e:
        logger.warning(f"[DAILY_QA] advance: write cache failed: {e}")

    logger.info(f"[DAILY_QA] advanced pool for user={user_id}: index {index} → {new_index} (pool_size={len(pool)})")
    return picked


def _assert_pro(user_ctx: dict) -> None:
    """Raise 403 if user is not a Pro subscriber.

    Pro source of truth: `subscription_status == 'active'` on the users table
    (set by Stripe webhook handlers in user-service).
    """
    status = (user_ctx or {}).get("subscription_status")
    if status != "active":
        raise HTTPException(status_code=403, detail="pro_required")


def _get_redis_client():
    """Lazy accessor for a module-level redis.asyncio client.

    Returns None if redis library is unavailable (e.g. in test environments
    without the dep installed) so callers can degrade gracefully.
    """
    global _redis_client_singleton
    if _redis_client_singleton is not None:
        return _redis_client_singleton
    try:
        import redis.asyncio as _redis_async
    except Exception as e:
        logger.warning(f"[DAILY_QA] redis.asyncio not available: {e}")
        return None
    host = os.getenv("REDIS_HOST", "redis")
    port = int(os.getenv("REDIS_PORT", "6379"))
    db = int(os.getenv("REDIS_DB", "0"))
    try:
        _redis_client_singleton = _redis_async.Redis(host=host, port=port, db=db, decode_responses=True)
    except Exception as e:
        logger.error(f"[DAILY_QA] failed to init redis client: {e}")
        _redis_client_singleton = None
    return _redis_client_singleton


_redis_client_singleton = None


async def call_proficiency_workflow(user_id: str, goal_id: int, task_id: int, conversation_history: list, user_context: dict, token: str, scenario: str = None, websocket = None, detected_language: str = None):
    """
    调用工作流 2（熟练度打分）来分析对话并更新分数

    改进：
    - 任务完成后自动获取下一个待完成任务
    - 更新 user_context 以便 AI 切换到新任务
    - 语言校验：非目标练习语言输入不计入熟练度
    """
    try:
        # Language guard: skip scoring if user spoke in a non-target language
        if detected_language:
            target_language = user_context.get('active_goal', {}).get('target_language', 'English')
            expected_codes = _TARGET_LANGUAGE_CODES.get(target_language, [])
            if expected_codes and detected_language.lower() not in expected_codes:
                logger.warning(
                    f"[LANG_GUARD] User spoke {detected_language}, target is {target_language} ({expected_codes}). "
                    f"Skipping proficiency scoring."
                )
                return None
        # 如果没有 task_id，需要从 user-service 获取当前任务 ID
        custom_topic = user_context.get('custom_topic') or 'General Practice'
        task_description = custom_topic
        scenario_title = custom_topic.split(" (Tasks:")[0].strip()
        user_service_url = os.getenv("USER_SERVICE_URL", "http://localhost:3000")

        if not task_id or task_id == 0:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 如果提供了 scenario 参数，使用场景特定的任务查找
                if scenario:
                    # 先获取 active goal 来找到当前场景下的任务
                    goal_resp = await client.get(
                        f"{user_service_url}/api/users/goals/active",
                        headers={"Authorization": f"Bearer {token}"}
                    )
                    if goal_resp.status_code == 200:
                        goal_data = goal_resp.json().get('data') or {}
                        active_goal = goal_data.get('goal') or goal_data or {}
                        scenarios = active_goal.get('scenarios') or []

                        # 查找匹配的场景
                        matched_scenario = None
                        for s in scenarios:
                            if s.get('title', '').lower() == scenario.lower() or \
                               scenario.lower() in s.get('title', '').lower() or \
                               s.get('title', '').lower() in scenario.lower():
                                matched_scenario = s
                                break

                        if matched_scenario:
                            scenario_title = matched_scenario.get('title', scenario_title)
                            # 查找该场景下第一个未完成的任务
                            tasks = matched_scenario.get('tasks') or []
                            for task in tasks:
                                if isinstance(task, dict) and task.get('status') != 'completed':
                                    task_id = task.get('id', 0)
                                    task_description = task.get('text', task_description)
                                    logger.info(f"Found scenario-matched task: id={task_id}, task={task_description}, scenario={scenario_title}")
                                    break

                            # 如果所有任务都完成了，使用场景的最后一个任务
                            if not task_id or task_id == 0:
                                completed_tasks = [t for t in tasks if isinstance(t, dict) and t.get('status') == 'completed']
                                if completed_tasks:
                                    last_task = completed_tasks[-1]
                                    task_id = last_task.get('id', 0)
                                    task_description = last_task.get('text', task_description)
                                    logger.info(f"All tasks completed, using last task: id={task_id}, task={task_description}")

                # 如果没有 scenario 参数或仍然没有找到 task_id，使用原来的 fallback 逻辑
                if not task_id or task_id == 0:
                    resp = await client.get(
                        f"{user_service_url}/api/users/goals/current-task",
                        headers={"Authorization": f"Bearer {token}"}
                    )
                    if resp.status_code == 200:
                        data = resp.json().get('data', {})
                        task = data.get('task', {})
                        scenario_data = data.get('scenario', {})
                        if task:
                            task_id = task.get('id', 0)
                            task_description = task.get('text', task_description)
                            scenario_title = scenario_data.get('title', scenario_title)
                            logger.warning(f"Using fallback current-task (not scenario-matched): id={task_id}, task={task_description}, scenario={scenario_title}")

        # 如果仍然没有 task_id，跳过评分
        if not task_id or task_id == 0:
            logger.warning("No task_id available, skipping proficiency workflow")
            return None

        # 获取当前任务信息
        current_task = {
            "id": task_id,
            "task_description": task_description,
            "scenario_title": scenario_title,
            "target_language": user_context.get('active_goal', {}).get('target_language', 'English')
        }

        payload = {
            "user_id": user_id,
            "goal_id": goal_id,
            "task_id": task_id,
            "conversation_history": conversation_history[-10:],  # 最近 10 轮对话
            "current_task": current_task
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{WORKFLOW_SERVICE_URL}/api/workflows/proficiency-scoring/update",
                json=payload
            )
            if resp.status_code == 200:
                result = resp.json()
                logger.info(f"Proficiency workflow result: {result}")
                result_data = result.get('data', {})
                
                # 如果任务完成，获取下一个待完成任务并更新 user_context
                if result_data.get('task_completed'):
                    logger.info(f"Task {task_id} completed, fetching next pending task...")

                    # 获取下一个待完成任务
                    next_task_resp = await client.get(
                        f"{user_service_url}/api/users/goals/next-task?scenario_title={scenario_title}",
                        headers={"Authorization": f"Bearer {token}"}
                    )

                    if next_task_resp.status_code == 200:
                        next_task_data = next_task_resp.json().get('data', {})
                        next_task = next_task_data.get('task')

                        if next_task:
                            # 更新 user_context 中的任务信息
                            user_context['current_task'] = next_task
                            user_context['custom_topic'] = f"{scenario_title} (Next task: {next_task.get('text', 'N/A')})"
                            user_context['next_task_text'] = next_task.get('text', '')
                            logger.info(f"Next task loaded: {next_task.get('text')}, updated user_context")
                        else:
                            logger.info(f"All tasks completed in scenario: {scenario_title}")
                            user_context['custom_topic'] = f"{scenario_title} (All tasks completed!)"
                            user_context['next_task_text'] = None

                            # Guard: require at least 3 real user turns before deep evaluation
                            recent_history = conversation_history[-50:]
                            user_msg_count = sum(1 for m in recent_history if (m.get('role') == 'user') and (m.get('content') or '').strip())
                            if user_msg_count < 3:
                                logger.warning(
                                    f"[SCENARIO_REVIEW] Skipping deep evaluation: only {user_msg_count} user turns (<3) in scenario '{scenario_title}'."
                                )
                                if websocket:
                                    await websocket.send_json({
                                        "type": "scenario_completed",
                                        "payload": {
                                            "scenario_title": scenario_title,
                                            "reason": "insufficient_practice",
                                            "user_turn_count": user_msg_count,
                                            "message": "本场景练习数据不足，建议完整完成 3 个子任务后再查看报告。"
                                        }
                                    })
                                return result_data

                            # 场景完成，调用 scenario review 工作流生成个性化点评
                            logger.info("Scenario completed, calling scenario review workflow...")
                            try:
                                review_resp = await client.post(
                                    f"{WORKFLOW_SERVICE_URL}/api/workflows/scenario-review/generate",
                                    json={
                                        "user_id": user_id,
                                        "goal_id": goal_id,
                                        "scenario_title": scenario_title,
                                        "completed_tasks": [],  # 由 workflow 从数据库获取
                                        "conversation_history": recent_history  # 最近 50 轮对话
                                    },
                                    headers={"Authorization": f"Bearer {token}"}
                                )
                                if review_resp.status_code == 200:
                                    review_data = review_resp.json()
                                    # API returns {"success": True, "data": {...}}
                                    data = review_data.get('data', {})
                                    logger.info(f"Scenario review generated: recommendations={data.get('recommendations', [])}")
                                    logger.info(f"Scenario review analysis: {data.get('analysis', {})}")
                                    # 将点评信息存储在 user_context 中供前端使用
                                    # workflow 返回结构：{workflow, scenario_title, review_report, recommendations, analysis}
                                    review_payload = {
                                        "review_report": data.get('review_report', ''),
                                        "recommendations": data.get('recommendations', []),
                                        "analysis": data.get('analysis', {})
                                    }
                                    user_context['scenario_review'] = review_payload

                                    # 发送 scenario_review 消息到前端
                                    if websocket:
                                        await websocket.send_json({
                                            "type": "scenario_review",
                                            "payload": review_payload
                                        })
                                        logger.info(f"Sent scenario_review to frontend: payload={review_payload}")
                                    else:
                                        logger.warning("WebSocket not available, scenario_review not sent to frontend")
                                else:
                                    logger.error(f"Failed to generate scenario review: {review_resp.status_code}")
                            except Exception as e:
                                logger.error(f"Error calling scenario review: {e}")

                return result_data
            else:
                logger.error(f"Failed to call proficiency workflow: {resp.status_code} {resp.text}")
                return None
    except Exception as e:
        logger.error(f"Error calling proficiency workflow: {e}")
        logger.error(traceback.format_exc())
        return None

# --- Prompt Management ---
# Import the full prompt manager from prompt_manager.py
# Use absolute import since main.py runs as a script
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prompt_manager import prompt_manager

class WebSocketCallback(OmniRealtimeCallback):
    def __init__(self, websocket: WebSocket, loop: asyncio.AbstractEventLoop, user_context: dict, token: str, user_id: str, session_id: str, history_messages: list = [], scenario: str = None):
        self.websocket = websocket
        self.loop = loop
        self.user_context = user_context
        self.token = token
        self.user_id = user_id
        self.session_id = session_id
        self.scenario = scenario
        self.phase_key = f"{user_id}:{scenario or ''}"  # 每个场景独立的 phase key
        self.conversation = None
        self.full_response_text = ""
        # If scenario is provided, always use OralTutor role for practice
        self.role = "OralTutor" if scenario else self._determine_role(user_context)
        self.is_connected = False
        self.interrupted_turn = False
        self.current_response_id = None
        self.ignored_response_ids = set()
        self.messages = history_messages
        # Mark the boundary of pre-loaded history so we never inject old task context into prompts.
        # Only messages appended AFTER this index (new turns in current session) go into system prompt.
        self.task_history_cutoff = len(history_messages)
        self.user_audio_buffer = bytearray()
        self.ai_audio_buffer = bytearray()
        self.last_user_audio_url = None
        self._skip_next_magic_pass = False  # Set True after task-switch trigger to avoid false detection
        self.last_ai_audio_url = None
        self.welcome_sent = False
        self.welcome_muted = False  # Flag to suppress welcome message after retry
        self.session_ready = False
        self.pending_user_transcript = None  # Buffer user transcript until AI response completes
        self.ai_responding = False  # Track if AI is currently responding
        self.connection_established_sent = False  # Track if we've sent connection_established
        self.last_detected_language = None  # Language detected by DashScope for last user utterance
        self.just_switched_task = False  # True immediately after a task completes; cleared after prompt update
        self._reconnect_failures = 0   # Count of "opened then closed quickly" events
        self._last_open_time = 0       # Timestamp of last on_open
        self.auth_denied = False        # Set True after too many quick-close failures (rate-limit / access-denied)
        # Batch evaluation state (Feature 1 — 批量评估 Agent)
        self.turn_accumulator = []          # [{turn_index, user_content, ai_response, timestamp}, ...]
        self.current_eval_task_id = None    # Reset accumulator on task switch
        self.batch_eval_count = 0           # How many batch evals done for current task (dynamic window: 3 for first 2, then 4)
        self.pending_directive = None       # One-turn teaching directive (consumed at upload_ai_task head)
        self.last_total_proficiency = None  # Cache of last known total; inline turns reuse to avoid DB query
        # Daily Q&A state (Feature 2)
        self.is_daily_qa_mode = False
        self.daily_qa_question = ""
        self.daily_qa_completed = False   # Set True after [DAILY_QA_PASSED] detected, suppresses retriggers
        self.daily_qa_ai_response_count = 0  # Counts AI responses; auto-pass fallback after 2nd
        self.daily_qa_suppress_modal = False  # True when user already passed today; skip WS event
        # Track DashScope server-side conversation items so we can delete them
        # on task switch (otherwise the AI keeps hearing prior-task transcripts).
        self.item_ids = []

    async def _safe_send(self, message: dict):
        """Safely send a WebSocket message, ignoring errors if client is disconnected."""
        if not self.is_connected:
            return
        try:
            await self.websocket.send_json(message)
        except (WebSocketDisconnect, Exception):
            pass  # Ignore errors if WebSocket is already closed

    def _clear_dashscope_items(self, reason: str = "task_switch"):
        """Delete all tracked server-side DashScope conversation.items.

        DashScope Realtime keeps an internal conversation buffer of items
        (user transcripts + AI responses). Clearing `self.messages` only
        removes OUR view; the AI keeps hearing prior-task context until we
        explicitly delete the items. Call this on any task/phase switch.
        """
        if not self.conversation:
            self.item_ids = []
            return
        _count = len(self.item_ids)
        for _iid in list(self.item_ids):
            try:
                self.conversation.send_raw(json.dumps({
                    "type": "conversation.item.delete",
                    "item_id": _iid
                }))
            except Exception as _e:
                logger.warning(f"[{reason}] delete DashScope item {_iid} failed: {_e}")
        self.item_ids = []
        logger.info(f"[{reason}] Deleted {_count} server-side DashScope items")

    def _determine_role(self, context):
        if not context or isinstance(context, str): return "InfoCollector"
        if not context.get('native_language'): return "InfoCollector"
        goal = context.get('active_goal', {})
        if not goal or not goal.get('type'): return "GoalPlanner"
        if goal.get('current_proficiency', 0) >= 90: return "SummaryExpert"
        return "OralTutor"

    def on_open(self) -> None:
        logger.info("DashScope Connection Open")
        self.is_connected = True
        self._last_open_time = time.time()
        logger.info(f"on_open called, connection_established_sent={self.connection_established_sent}")
        # Only send connection_established once per WebSocket session
        if not self.connection_established_sent:
            self.connection_established_sent = True
            logger.info("Sending connection_established message to frontend")

            def log_callback(task):
                try:
                    task.result()
                    logger.info("Connection established message sent to frontend")
                except Exception as e:
                    logger.error(f"Failed to send connection established message: {e}")

            # CRITICAL FIX: Add a small delay to ensure frontend WebSocket is fully ready
            # This prevents the "WebSocket was closed before the connection was established" error
            async def send_connection_established():
                # Wait 100ms to ensure the WebSocket bridge (comms-service) is fully established
                await asyncio.sleep(0.1)
                
                # Double-check if WebSocket is still connected before sending
                if self.websocket.client_state.name == 'CONNECTED':
                    try:
                        await self.websocket.send_json({
                            "type": "connection_established",
                            "payload": {
                                "connectionId": "python-session", 
                                "message": f"Connected to Qwen3-Omni (Role: {self.role})", 
                                "role": self.role
                            }
                        })
                        logger.info("connection_established sent successfully after delay")
                    except Exception as e:
                        logger.error(f"Failed to send connection established after delay: {e}")
                else:
                    logger.warning(f"WebSocket disconnected during delay, skipping. State: {self.websocket.client_state.name}")

            # Schedule the delayed send
            asyncio.run_coroutine_threadsafe(send_connection_established(), self.loop)
        else:
            logger.warning("connection_established already sent, skipping")
        self._update_session_prompt()

    def _update_session_prompt(self, extra_directive: str = None):
        if self.conversation:
            full_ctx = {**self.user_context}
            active_goal = self.user_context.get('active_goal') or {}
            if active_goal: full_ctx.update(active_goal)

            if self.scenario and active_goal.get('scenarios'):
                scenarios = active_goal.get('scenarios', [])
                matched_scenario = next((s for s in scenarios if s.get('title') == self.scenario), None)
                if matched_scenario:
                    # ── CRITICAL: Use phase_info task_index for magic_repetition phase ──
                    # Do NOT rely on task.status which may be stale (async workflow update)
                    phase_info = session_phases.get(self.phase_key, {})
                    tasks = matched_scenario.get('tasks', [])

                    if phase_info.get("phase") == "magic_repetition":
                        task_idx = phase_info.get("task_index", 0)
                        current_task = tasks[task_idx] if task_idx < len(tasks) and isinstance(tasks[task_idx], dict) else None
                        if current_task:
                            task_text = current_task.get('text', 'Practice conversation')
                        else:
                            task_text = "日常对话"
                    else:
                        # Fallback: use first incomplete task for non-magic phases
                        current_task = next((t for t in tasks if isinstance(t, dict) and t.get('status') != 'completed'), None)
                        task_text = current_task.get('text', 'Practice conversation') if current_task else "日常对话"

                    if current_task:
                        # Highlight current task explicitly
                        self.user_context['current_task_text'] = task_text
                        self.user_context['custom_topic'] = f"{self.scenario} (Current task: {task_text})"
                        full_ctx['custom_topic'] = self.user_context['custom_topic']
                        full_ctx['task_description'] = task_text  # Explicitly set for prompt template

                        # Also update active_goal.current_task for prompt_manager
                        # CRITICAL: preserve 'id' so proficiency/batch_evaluate can resolve the task row.
                        full_ctx['active_goal']['current_task'] = {
                            'id': current_task.get('id'),
                            'scenario_title': self.scenario,
                            'task_description': task_text
                        }

                        logger.info(f"Selected Scenario: {self.scenario}, Current Task: {task_text} (id={current_task.get('id')})")
                    else:
                        # All tasks completed
                        self.user_context['custom_topic'] = f"{self.scenario} (All tasks completed!)"
                        full_ctx['custom_topic'] = self.user_context['custom_topic']
                        full_ctx['task_description'] = 'Review and practice all tasks'
                        logger.info(f"All tasks completed in scenario: {self.scenario}")
                else:
                    self.user_context['custom_topic'] = self.scenario
                    full_ctx['custom_topic'] = self.scenario
            elif self.scenario:
                self.user_context['custom_topic'] = self.scenario
                full_ctx['custom_topic'] = self.scenario

            # ── Phase-aware system prompt selection ──
            phase_info = session_phases.get(self.phase_key, {"phase": "magic_repetition", "task_index": 0})
            target_lang = full_ctx.get('target_language', 'English')
            native_lang = full_ctx.get('native_language', '中文')

            # Daily Q&A mode short-circuits normal phase selection (Feature 2)
            if self.is_daily_qa_mode and self.daily_qa_question:
                target_level = (
                    full_ctx.get('target_level')
                    or self.user_context.get('target_level')
                    or (full_ctx.get('active_goal') or {}).get('target_level')
                    or 'B1'
                )
                system_prompt = prompt_manager.generate_daily_qa_prompt(
                    question=self.daily_qa_question,
                    target_language=target_lang,
                    native_language=native_lang,
                    target_level=target_level,
                )
                # Daily QA prompt must NOT be polluted by teaching directives
                if extra_directive:
                    logger.info(f"[BATCH_EVAL] Skipping teaching directive in daily_qa mode ({len(extra_directive)} chars)")
                selected_voice = self.user_context.get('voice') or os.getenv("QWEN3_OMNI_VOICE", "Tina")
                logger.info(f"[DAILY_QA] Sending daily_qa system prompt (question={self.daily_qa_question[:80]!r})")
                try:
                    self.conversation.update_session(
                        instructions=system_prompt,
                        voice=selected_voice,
                        output_modalities=[MultiModality.TEXT, MultiModality.AUDIO],
                        enable_input_audio_transcription=True,
                        input_audio_transcription_model="qwen3-asr-flash-realtime",
                        enable_turn_detection=False,
                    )
                except Exception as e:
                    logger.error(f"[DAILY_QA] Failed to update session prompt: {e}")
                    logger.error(traceback.format_exc())
                return

            if self.scenario and phase_info.get("phase") == "magic_repetition":
                tasks_list = []
                if active_goal.get('scenarios'):
                    matched = next((s for s in active_goal.get('scenarios', []) if s.get('title') == self.scenario), None)
                    if matched:
                        tasks_list = [t.get('text', '') if isinstance(t, dict) else str(t) for t in matched.get('tasks', [])]
                task_idx = phase_info.get("task_index", 0)
                task_text = tasks_list[task_idx] if task_idx < len(tasks_list) else "日常对话"
                next_task_text = tasks_list[task_idx + 1] if task_idx + 1 < len(tasks_list) else None
                memory_mode = phase_info.get("memory_mode", False)
                # Cache task texts in phase_info so magic pass handler can read them reliably
                phase_info["_current_task_text"] = task_text
                phase_info["_next_task_text"] = next_task_text
                system_prompt = prompt_manager.generate_magic_repetition_prompt(
                    task_text=task_text, target_language=target_lang, native_language=native_lang,
                    next_task_text=next_task_text, memory_mode=memory_mode
                )
                logger.info(f"[Phase] magic_repetition task[{task_idx}]: {task_text[:50]}, memory_mode={memory_mode}, next: {next_task_text[:50] if next_task_text else 'None'}")
            elif self.scenario and phase_info.get("phase") == "scene_theater":
                # A.2: only expose the CURRENT sub-task to the AI, never the full list.
                all_task_objs = []
                all_task_texts = []
                if active_goal.get('scenarios'):
                    matched = next((s for s in active_goal.get('scenarios', []) if s.get('title') == self.scenario), None)
                    if matched:
                        all_task_objs = matched.get('tasks', []) or []
                        all_task_texts = [t.get('text', '') if isinstance(t, dict) else str(t) for t in all_task_objs]

                # Pick current pending task: first non-completed in original order.
                current_idx = 0
                for i, t in enumerate(all_task_objs):
                    if isinstance(t, dict) and t.get('status') != 'completed':
                        current_idx = i
                        break
                else:
                    # All completed: show the last one for graceful final state
                    current_idx = max(0, len(all_task_texts) - 1)

                current_task_text = all_task_texts[current_idx] if current_idx < len(all_task_texts) else "日常对话"
                total_tasks = len(all_task_texts) if all_task_texts else 3

                system_prompt = prompt_manager.generate_scene_theater_prompt(
                    image_url=phase_info.get("scene_image_url", ""),
                    tasks=[current_task_text],
                    target_language=target_lang,
                    native_language=native_lang,
                    current_task_number=current_idx + 1,
                    total_tasks=total_tasks,
                )
                logger.info(
                    f"[Phase] scene_theater prompt (single-task view): task #{current_idx + 1}/{total_tasks} = {current_task_text[:60]}"
                )
            else:
                system_prompt = prompt_manager.generate_system_prompt(full_ctx, role=self.role)

            selected_voice = self.user_context.get('voice') or os.getenv("QWEN3_OMNI_VOICE", "Tina")

            if getattr(self, 'just_switched_task', False):
                # Use next_task_text set by call_proficiency_workflow — it's already the correct next task.
                # Do NOT use full_ctx.get('task_description') here as it may still reflect the old task
                # due to user_context update race conditions.
                new_task = (
                    self.user_context.get('next_task_text')
                    or self.user_context.get('current_task', {}).get('text')
                    or full_ctx.get('next_task_text')
                    or 'the next task'
                )
                target_lang_for_switch = self.user_context.get('target_language') or full_ctx.get('target_language', 'the target language')
                system_prompt += (
                    f"\n\n## TASK SWITCH — OVERRIDE ALL PREVIOUS CONTEXT\n"
                    f"The previous task is FULLY COMPLETED. Do NOT mention it again under any circumstances.\n"
                    f"You are now starting a completely fresh conversation for the NEW task: \"{new_task}\".\n"
                    f"Greet the student briefly and invite them to start this new task immediately.\n"
                    f"NEVER say 'Let's finish this task first' — it is already done.\n"
                    f"REMINDER: Conduct this transition and ALL subsequent responses entirely in {target_lang_for_switch}.\n"
                )
                self.just_switched_task = False
                logger.info(f"[TASK_SWITCH] Injected override directive for new task: {new_task}")
            else:
                # Only inject messages from the current task period (after the cutoff)
                cutoff = getattr(self, 'task_history_cutoff', 0)
                current_task_msgs = self.messages[cutoff:][-10:]  # max 10 from current task
                if current_task_msgs:
                    import re as _re
                    _URL_RE = _re.compile(r'https?://\S+|www\.\S+', _re.IGNORECASE)
                    history_text = "\n\n# Current Session Context (READ-ONLY):\n"
                    history_text += "**CRITICAL**: This is HISTORY only. Do NOT auto-complete tasks. Wait for user to speak first.\n"
                    history_text += f"**CURRENT TASK**: {full_ctx.get('task_description', 'Practice conversation')} in scenario: {self.scenario}\n\n"
                    for msg in current_task_msgs:
                        role_label = "User" if msg['role'] == 'user' else "AI"
                        content = _URL_RE.sub('[link]', msg.get('content', ''))
                        history_text += f"{role_label}: {content}\n"
                    history_text += "\n**NOW**: Wait silently for user to speak. Greet briefly if needed, then listen.\n"
                    system_prompt += history_text

            # Append one-time teaching directive if provided (Feature 1)
            if extra_directive:
                system_prompt = system_prompt + "\n\n" + extra_directive
                logger.info(f"[BATCH_EVAL] Appending teaching directive to session prompt ({len(extra_directive)} chars)")

            logger.info(f"Sending System Prompt ({self.role}) full:\n{system_prompt}")
            try:
                self.conversation.update_session(
                    instructions=system_prompt,
                    voice=selected_voice,
                    output_modalities=[MultiModality.TEXT, MultiModality.AUDIO],
                    enable_input_audio_transcription=True,
                    input_audio_transcription_model="qwen3-asr-flash-realtime",
                    enable_turn_detection=False,
                )
            except Exception as e:
                logger.error(f"Failed to update session prompt: {e}")
                logger.error(traceback.format_exc())

    async def upload_audio_to_cos(self, audio_data: bytes, audio_type: str) -> str:
        if not audio_data: return None
        url = os.getenv("MEDIA_SERVICE_URL", "http://localhost:3005") + "/api/media/upload"
        filename = f"{self.session_id}_{int(time.time())}.pcm"
        files = {audio_type: (filename, audio_data, 'application/octet-stream')}
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, files=files, timeout=10.0)
                if resp.status_code == 200:
                    return resp.json().get('data', {}).get(f'{audio_type}Url')
                logger.error(f"Failed to upload audio: {resp.status_code} {resp.text}")
            except Exception as e:
                logger.error(f"Error uploading audio: {e}")
        return None

    def _trigger_welcome_message(self):
        if self.welcome_sent or not self.conversation or not self.is_connected or not self.session_ready: return
        self.welcome_sent = True
        target_lang = self.user_context.get('target_language', 'English')
        starter_text = "Hello, I'm ready to start." if self.role == "InfoCollector" else "Hi, I want to set up my learning goals." if self.role == "GoalPlanner" else f"Hello, I'm ready to practice {target_lang}."
        logger.info(f"Sending welcome trigger: {starter_text}")
        try:
            self.conversation.send_raw(json.dumps({"type": "conversation.item.create", "item": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": starter_text}]}}))
            self.conversation.send_raw(json.dumps({"type": "response.create", "response": {"modalities": ["text", "audio"]}}))
        except Exception as e: logger.error(f"Failed to send welcome message: {e}")

    def on_event(self, response: dict) -> None:
        event_name = response.get('type')
        # Try multiple locations for response_id to ensure we capture it from all event types
        rid = (
            response.get('header', {}).get('response_id') or 
            response.get('response_id') or 
            response.get('request_id') or
            response.get('item', {}).get('response_id') or
            self.current_response_id  # Fallback to existing if not found
        )

        # Log all events for debugging
        if event_name not in ['response.audio.delta', 'response.audio_transcript.delta', 'response.audio.done', 'response.audio_transcript.done']:
            logger.info(f"DashScope Event: {event_name}, RID: {rid}")
            logger.info(f"Detailed Event Data: {json.dumps(response)[:3000]}")

        if event_name == 'session.created':
            self.session_ready = True
            if not self.messages and not self.welcome_sent and not getattr(self, "welcome_muted", False):
                def delayed_trigger():
                    time.sleep(0.5)
                    self._trigger_welcome_message()
                import threading
                threading.Thread(target=delayed_trigger, daemon=True).start()
        # Always update current_response_id if we have a new one
        if rid and rid not in self.ignored_response_ids:
            self.current_response_id = rid

        async def process_event():
            try:
                if self.interrupted_turn and event_name in ['response.audio.delta', 'response.audio_transcript.delta', 'response.text.done', 'response.audio_transcript.done']: return
                elif event_name == 'response.audio.delta':
                    audio_data = response.get('delta')
                    if audio_data:
                        try: self.ai_audio_buffer.extend(base64.b64decode(audio_data))
                        except: pass
                        await self._safe_send({"type": "audio_response", "payload": audio_data, "role": self.role, "responseId": self.current_response_id})
                elif event_name == 'response.audio_transcript.delta':
                    text = response.get('delta')
                    if text:
                        # Accumulate text internally, don't send chunks to frontend
                        self.ai_responding = True  # Mark AI as actively responding
                        self.full_response_text += text
                        if not hasattr(self, '_sent_role_for_turn'):
                            # Send role switch signal once
                            await self._safe_send({"type": "role_switch", "payload": {"role": self.role}})
                            self._sent_role_for_turn = True
                        # Don't send text chunks - wait for complete message
                elif event_name == 'response.audio.done':
                    if self.ai_audio_buffer:
                        data = bytes(self.ai_audio_buffer)
                        self.ai_audio_buffer = bytearray()
                        
                        # 获取goal_id和task_id用于工作流调用
                        goal_id = self.user_context.get('active_goal', {}).get('id')
                        task_id = self.user_context.get('active_goal', {}).get('current_task', {}).get('id')
                        
                        async def upload_ai_task(d, r):
                            # Yield so any pending audio_transcript.done event can populate self.messages
                            await asyncio.sleep(0)

                            # ── Consume one-time teaching directive (Feature 1) ──
                            # The directive was injected on the PREVIOUS turn and consumed by DashScope
                            # on THIS response. Restore base prompt so the next turn is clean.
                            if self.pending_directive:
                                logger.info("[BATCH_EVAL] Directive consumed — restoring base session prompt")
                                self.pending_directive = None
                                try:
                                    self._update_session_prompt()
                                except Exception as _de:
                                    logger.warning(f"[BATCH_EVAL] Failed to restore base prompt: {_de}")

                            # ── Daily Q&A: detect [DAILY_QA_PASSED] (Feature 2) ──
                            if self.is_daily_qa_mode and not self.daily_qa_completed:
                                self.daily_qa_ai_response_count += 1
                                _latest_ai_for_marker = ""
                                for _m in reversed(self.messages):
                                    if _m.get("role") == "assistant":
                                        _latest_ai_for_marker = _m.get("content", "") or ""
                                        break
                                _marker_found = _DAILY_QA_PASSED_RE.search(_latest_ai_for_marker)
                                # Auto-pass fallback: if AI responded >= 2 times (1st=question, 2nd=evaluation),
                                # marker not found, but AI response is positive (no retry/correction indicators)
                                _auto_pass = False
                                if not _marker_found and self.daily_qa_ai_response_count >= 3:
                                    _ai_lower = _latest_ai_for_marker.lower()
                                    _negative_indicators = [
                                        # Retry / correction
                                        "try again", "もう一度", "再试", "再说", "重新",
                                        "let's try", "could you", "can you try",
                                        "もう少し", "やり直", "言い直",
                                        "not quite", "not correct", "incorrect",
                                        # Off-topic / wrong language
                                        "off-topic", "off topic", "関係ない", "关系不大",
                                        "话题", "質問に", "question", "about the question",
                                        "答えてみ", "回答一下", "answer the",
                                        "今日の質問", "今天的问题", "today's question",
                                        # Wrong language
                                        "日本語で", "in japanese", "in english", "用日语", "用英语",
                                        "please use", "please answer",
                                    ]
                                    _has_negative = any(ind in _ai_lower for ind in _negative_indicators)
                                    if not _has_negative:
                                        _auto_pass = True
                                        logger.info(f"[DAILY_QA] Auto-pass fallback: positive AI response (count={self.daily_qa_ai_response_count})")
                                _should_pass = _marker_found or _auto_pass
                                if _should_pass:
                                    if not _marker_found:
                                        logger.info(f"[DAILY_QA] Auto-pass fallback triggered (ai_response_count={self.daily_qa_ai_response_count})")
                                    self.daily_qa_completed = True
                                    _is_bonus = self.daily_qa_suppress_modal
                                    try:
                                        _rc = _get_redis_client()
                                        if _rc is not None and not _is_bonus:
                                            await _handle_daily_qa_marker(
                                                _rc, self.user_id, self.websocket, _latest_ai_for_marker
                                            )
                                        else:
                                            await self._safe_send({
                                                "type": "daily_qa_completed",
                                                "payload": {"qa_date": _today_utc_str(), "passed": True, "is_bonus": _is_bonus},
                                            })
                                    except Exception as _qae:
                                        logger.warning(f"[DAILY_QA] marker handler error: {_qae}")

                            # ── Pre-upload: strip spoken markers, re-synthesize clean TTS if needed ──
                            latest_ai_text = ""
                            for _m in reversed(self.messages):
                                if _m.get("role") == "assistant":
                                    latest_ai_text = _m.get("content", "")
                                    break

                            _MARKER_RE = re.compile(
                                r'\[TASK_\d+_COMPLETE\]'
                                r'|[\[<]MAGIC_SENTENCE:[^\]>]*[\]>]?'
                                r'|\[MAGIC_PASS[^\]]*\]'
                                r'|\[DAILY_QA_PASSED\]'
                                r'|\[\s*NATIVE:\s*[^\]]*\]',
                                re.IGNORECASE
                            )
                            audio_data = d
                            if latest_ai_text and _MARKER_RE.search(latest_ai_text):
                                _clean = _MARKER_RE.sub('', latest_ai_text)
                                _clean = re.sub(r'```json.*?```', '', _clean, flags=re.DOTALL | re.IGNORECASE).strip()
                                if _clean:
                                    try:
                                        _voice = self.user_context.get('voice') or os.getenv("QWEN3_OMNI_VOICE", "Tina")
                                        _key = os.getenv("QWEN3_OMNI_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
                                        def _synth_clean():
                                            dashscope.api_key = _key
                                            resp = dashscope.MultiModalConversation.call(
                                                model="qwen3-tts-flash", text=_clean[:500], voice=_voice,
                                            )
                                            if not resp or resp.status_code != 200:
                                                raise RuntimeError(f"TTS status {getattr(resp, 'status_code', '?')}")
                                            _tts_url = resp.output.get("audio", {}).get("url")
                                            if not _tts_url:
                                                raise RuntimeError("No TTS audio URL")
                                            return _validated_urlopen(_tts_url, timeout=15)
                                        audio_data = await asyncio.get_event_loop().run_in_executor(None, _synth_clean)
                                        audio_data = _wav_extract_pcm(audio_data)  # 剥掉 WAV header，避免 ffmpeg 将其误读为 PCM 产生 ping 声
                                        logger.info(f"[TTS-clean] Re-synthesized {len(audio_data)} bytes without markers for response {r}")
                                    except Exception as _e:
                                        logger.warning(f"[TTS-clean] Re-synthesis failed: {_e}. Using original audio.")
                                        audio_data = d

                            url = await self.upload_audio_to_cos(audio_data, 'ai_audio')
                            if url:
                                await self._safe_send({"type": "audio_url", "payload": {"url": url, "role": "assistant"}, "responseId": r})
                                # Store audio URL by response ID to ensure correct pairing
                                if not hasattr(self, 'audio_urls_by_response'):
                                    self.audio_urls_by_response = {}
                                self.audio_urls_by_response[r] = url
                                logger.info(f"Stored audio URL for response {r}")

                                # Now save the complete message with audio URL to history
                                # Find the message in self.messages by response ID and update it
                                for msg in reversed(self.messages):
                                    if msg.get('role') == 'assistant' and not msg.get('audioUrl'):
                                        msg['audioUrl'] = url
                                        await save_single_message(self.session_id, self.user_id, "assistant", msg.get('content', ''), url)
                                        logger.info(f"Saved AI message with audio URL to history: {msg.get('content', '')[:50]}...")
                                        break
                                
                                # ── Phase marker detection ──
                                # latest_ai_text already computed at start of upload_ai_task

                                # Guard: skip magic pass check for navigation words / too-short input
                                _last_user_text = ""
                                for _msg in reversed(self.messages):
                                    if _msg.get("role") == "user":
                                        _last_user_text = (_msg.get("content") or "").strip()
                                        break
                                _NAV_PHRASES = {"next", "skip", "continue", "move on", "pass", "next.", "skip.", "pass.", "continue."}
                                # Only treat as nav if we actually have a transcript (empty = ASR not ready, not a nav command)
                                _is_nav = bool(_last_user_text) and (
                                    len(_last_user_text) < 8 or
                                    _last_user_text.lower() in _NAV_PHRASES or
                                    _last_user_text.lower().rstrip(".!?,") in _NAV_PHRASES
                                )
                                if _is_nav:
                                    logger.info(f"[Phase] Skipping magic pass — navigation input: '{_last_user_text}'")

                                # Magic pass: multi-language positive keyword detection
                                # Requires 2 consecutive AI replies containing positive keywords
                                _MAGIC_PASS_KEYWORDS = [
                                    "[MAGIC_PASS]", "PASS", "correct", "perfect", "excellent",
                                    "that's right", "well done", "great job",
                                    "正确", "很好", "非常好", "太棒了", "完美",
                                    "よくできました", "正解", "素晴らしい",
                                    "정확해", "잘했어", "완벽해",
                                    "✓",
                                ]
                                lower_ai = latest_ai_text.lower()
                                has_positive = any(kw.lower() in lower_ai for kw in _MAGIC_PASS_KEYWORDS)

                                _skip_magic = getattr(self, '_skip_next_magic_pass', False)
                                if _skip_magic:
                                    self._skip_next_magic_pass = False
                                    logger.info("[Phase] Skipping magic pass — task-switch presentation response")
                                _current_phase = session_phases.get(self.phase_key, {}).get("phase", "magic_repetition")
                                if not _skip_magic and not _is_nav and has_positive and _current_phase == "magic_repetition":
                                    phase_info = session_phases.setdefault(self.phase_key, {
                                        "phase": "magic_repetition", "task_index": 0,
                                        "magic_positive_streak": 0, "memory_mode": False
                                    })
                                    # Dedup: same response_id must not trigger magic pass twice
                                    if phase_info.get("_last_magic_response_id") == r:
                                        logger.info(f"[Phase] Skipping duplicate magic pass for response_id={r}")
                                    else:
                                        phase_info["_last_magic_response_id"] = r
                                        current_streak = phase_info.get("magic_positive_streak", 0)
                                        current_index = phase_info.get("task_index", 0)

                                        tasks_for_advance = []
                                        active_goal_data = self.user_context.get('active_goal', {})
                                        if active_goal_data.get('scenarios') and self.scenario:
                                            for sc in active_goal_data.get('scenarios', []):
                                                if sc.get('title') == self.scenario:
                                                    tasks_for_advance = [
                                                        t.get('text', '') if isinstance(t, dict) else str(t)
                                                        for t in sc.get('tasks', [])
                                                    ]
                                                    break

                                        logger.info(f"[Phase] magic pass check: streak={current_streak}, task[{current_index}], tasks_total={len(tasks_for_advance)}, cached_next='{phase_info.get('_next_task_text', 'N/A')}'")
                                        if current_streak == 0:
                                            # 第一次通过（跟读） → 切换背诵模式
                                            phase_info["magic_positive_streak"] = 1
                                            phase_info["memory_mode"] = True
                                            await send_phase_event(self.websocket, "magic_pass_first", {"task_index": current_index})
                                            self._update_session_prompt()
                                            logger.info(f"[Phase] magic_pass_first task[{current_index}] → memory_mode=True")
                                        else:
                                            # 第二次通过（背诵） → 推进任务
                                            logger.info(f"[Phase]背诵通过！streak={current_streak}, next_index={current_index + 1}, tasks_total={len(tasks_for_advance)}")
                                            await send_phase_event(self.websocket, "magic_pass", {"task_index": current_index})
                                            next_index = current_index + 1
                                            phase_info["magic_positive_streak"] = 0
                                            phase_info["memory_mode"] = False

                                            if next_index < len(tasks_for_advance):
                                                phase_info["task_index"] = next_index
                                                # Directly read from tasks list — _update_session_prompt hasn't been called yet
                                                next_task_val = tasks_for_advance[next_index] if next_index < len(tasks_for_advance) else ""
                                                logger.info(f"[Phase] Advancing to task[{next_index}], task_text='{next_task_val[:50]}'")

                                                # ── Merged A+B detection ──────────────────────────────────
                                                # Check if AI already included [MAGIC_SENTENCE: ...] in this
                                                # magic_pass response. If so, no second response.create needed.
                                                # Also match <MAGIC_SENTENCE: ...> (AI sometimes uses wrong brackets)
                                                _ms_match = re.search(r'[\[<]MAGIC_SENTENCE:\s*([^\]>]+?)(?:[\]>]|$)', latest_ai_text)
                                                if _ms_match:
                                                    _embedded_sentence = _ms_match.group(1).strip()
                                                    logger.info(f"[Phase] AI merged A+B — extracted sentence: '{_embedded_sentence[:60]}'")
                                                    # Send phase_transition with embedded sentence and stop_audio=false
                                                    await send_phase_event(self.websocket, "phase_transition", {
                                                        "phase": "magic_repetition", "task_index": next_index,
                                                        "task_text": next_task_val,
                                                        "magic_sentence": _embedded_sentence,
                                                        "stop_audio": False
                                                    })
                                                    self.messages = []
                                                    self.task_history_cutoff = 0
                                                    self._clear_dashscope_items(reason=f"MAGIC_SWITCH[A+B] → task[{next_index}]")
                                                    self._update_session_prompt()
                                                    logger.info(f"[Phase] Merged A+B — skipped response.create, updated session prompt for task[{next_index}]")
                                                else:
                                                    # Fallback: AI did not include [MAGIC_SENTENCE] — send response.create
                                                    logger.info(f"[Phase] AI did NOT include [MAGIC_SENTENCE] — using fallback response.create for task[{next_index}]")
                                                    await send_phase_event(self.websocket, "phase_transition", {
                                                        "phase": "magic_repetition", "task_index": next_index,
                                                        "task_text": next_task_val,
                                                        "stop_audio": False
                                                    })
                                                    self.messages = []
                                                    self.task_history_cutoff = 0
                                                    self._clear_dashscope_items(reason=f"MAGIC_SWITCH[fallback] → task[{next_index}]")
                                                    self._update_session_prompt()
                                                    # 短暂延迟确保 DashScope session 更新生效
                                                    await asyncio.sleep(0.5)
                                                    self._skip_next_magic_pass = True
                                                    try:
                                                        logger.info(f"[Phase] Injecting trigger for task[{next_index}]: '{next_task_val[:50]}'")
                                                        self.conversation.send_raw(json.dumps({
                                                            "type": "conversation.item.create",
                                                            "item": {"type": "message", "role": "user",
                                                                     "content": [{"type": "input_text", "text": f"[TASK_SWITCH] New task: '{next_task_val}'. Sentence card is visible."}]}
                                                        }))
                                                        self.conversation.send_raw(json.dumps({
                                                            "type": "response.create",
                                                            "response": {
                                                                "modalities": ["text", "audio"],
                                                                "instructions": (
                                                                    f"New task started: '{next_task_val}'. The sentence card is now VISIBLE and needs a NEW sentence. "
                                                                    f"1. Generate ONE complex sentence (15-30 words) in the target language related to this topic. "
                                                                    f"2. Your response MUST start with: [MAGIC_SENTENCE: YOUR_NEW_SENTENCE_HERE] "
                                                                    f"   Use SQUARE BRACKETS [ ] ONLY — NOT angle brackets < > or parentheses. "
                                                                    f"3. Then ask the student to read the sentence on the card aloud."
                                                                )
                                                            }
                                                        }))
                                                        logger.info(f"[Phase] Fallback: Task-switch trigger + response.create sent for task[{next_index}]")
                                                    except Exception as _te:
                                                        logger.error(f"[Phase] Task switch trigger failed: {_te}")
                                                logger.info(f"[Phase] Advanced to task[{next_index}]")
                                            else:
                                                # 全部通过 → 切换情景剧场（立即更新 phase，防止图片生成期间用户说话触发 magic_pass）
                                                logger.info(f"[Phase] 所有任务完成！切换到情景剧场。next_index={next_index}, tasks_total={len(tasks_for_advance)}")
                                                phase_info["phase"] = "scene_theater"
                                                phase_info["task_index"] = 0
                                                phase_info["scene_image_url"] = ""  # 图片未就绪时先置空
                                                self.messages = []
                                                self.task_history_cutoff = 0
                                                self._clear_dashscope_items(reason="PHASE_SWITCH → scene_theater")
                                                self._update_session_prompt()  # 提前到 await 之前，防止竞态条件
                                                logger.info(f"[Phase] scene_theater prompt 已提前注入（图片生成中）")
                                                try:
                                                    # Wanx T2I 轮询最多需要 12 秒，设置 25 秒超时确保足够
                                                    async with httpx.AsyncClient(timeout=25) as _client:
                                                        resp = await _client.post(
                                                            "http://localhost:8082/generate-scene-image",
                                                            json={"scenario_title": self.scenario or "", "tasks": tasks_for_advance}
                                                        )
                                                        image_url = resp.json().get("image_url", "")
                                                except Exception as e:
                                                    logger.error(f"[Phase] Scene image generation failed: {e}")
                                                    image_url = ""
                                                # 图片就绪后更新 prompt（带 image_url）并通知前端
                                                phase_info["scene_image_url"] = image_url
                                                self._update_session_prompt()
                                                await send_phase_event(self.websocket, "scene_image", {"image_url": image_url})
                                                await send_phase_event(self.websocket, "phase_transition", {
                                                    "phase": "scene_theater", "task_index": 0
                                                })
                                                # 触发 AI 主动介绍情景剧场
                                                self._skip_next_magic_pass = True
                                                try:
                                                    self.conversation.send_raw(json.dumps({
                                                        "type": "conversation.item.create",
                                                        "item": {
                                                            "type": "message", "role": "user",
                                                            "content": [{"type": "input_text",
                                                                         "text": "[PHASE_START: scene_theater] Magic Repetition is complete. Now start the Scene Theater phase."}]
                                                        }
                                                    }))
                                                    self.conversation.send_raw(json.dumps({
                                                        "type": "response.create",
                                                        "response": {
                                                            "modalities": ["text", "audio"],
                                                            "instructions": (
                                                                "Magic Repetition is now COMPLETE. You are starting the Scene Theater phase. "
                                                                "Describe the scene image shown to the student in 2-3 vivid sentences, "
                                                                "then introduce the 3 sub-tasks they need to complete. "
                                                                "Do NOT ask the student to repeat any sentence. Start fresh."
                                                            )
                                                        }
                                                    }))
                                                    logger.info(f"[Phase] scene_theater intro response.create triggered")
                                                except Exception as _te:
                                                    logger.error(f"[Phase] scene_theater trigger failed: {_te}")
                                                logger.info(f"[Phase] All magic passed → scene_theater")

                                for _n in range(1, 4):
                                    marker = f"[TASK_{_n}_COMPLETE]"
                                    if marker in latest_ai_text:
                                        await send_phase_event(self.websocket, "theater_task_complete", {"task_index": _n})

                                # 调用批量评估 Agent（F1）- 只在用户有输入后才调用
                                # Skip if this is the welcome message (no user input yet)
                                user_message_count = sum(1 for m in self.messages if m.get("role") == "user")
                                _magic_phase_info = session_phases.get(self.phase_key, {})
                                if goal_id and user_message_count > 0 and _magic_phase_info.get("phase") != "magic_repetition":
                                    # Extract last user message content
                                    _last_user_content = ""
                                    for _msg in reversed(self.messages):
                                        if _msg.get("role") == "user":
                                            _last_user_content = _msg.get("content", "") or ""
                                            break

                                    # Build current_task context for the helper
                                    _active_goal = self.user_context.get('active_goal') or {}
                                    _target_language = _active_goal.get('target_language', 'English')
                                    _native_language = self.user_context.get('native_language') or _active_goal.get('native_language') or '中文'
                                    _custom_topic = self.user_context.get('custom_topic') or 'General Practice'
                                    _scenario_title = (_custom_topic.split(" (")[0]).strip()
                                    _task_description = self.user_context.get('current_task_text') or _custom_topic
                                    _current_task_ctx = {
                                        "id": task_id or 0,
                                        "task_description": _task_description,
                                        "scenario_title": _scenario_title,
                                        "target_language": _target_language,
                                    }

                                    workflow_result = await _handle_turn_with_accumulator(
                                        self,
                                        self.conversation,
                                        self.websocket,
                                        self.user_id,
                                        goal_id,
                                        task_id or 0,
                                        _last_user_content,
                                        latest_ai_text,
                                        _current_task_ctx,
                                        _native_language,
                                        self.token,
                                    )

                                    if workflow_result:
                                        delta = workflow_result.get('proficiency_delta', 0)
                                        total = workflow_result.get('total_proficiency', 0)
                                        task_completed = workflow_result.get('task_completed', False)
                                        task_ready_to_complete = workflow_result.get('task_ready_to_complete', False)
                                        task_score = workflow_result.get('task_score', 0)
                                        improvement_tips = workflow_result.get('improvement_tips', [])

                                        # 计算进度条百分比
                                        progress = min(100, round((task_score / 9) * 100)) if task_score else 0

                                        # NOTE: proficiency_update already sent by _handle_turn_with_accumulator.
                                        # Skip duplicate send here.
                                        logger.info(
                                            f"[BATCH_EVAL] workflow_result: delta={delta}, total={total}, "
                                            f"task_id={workflow_result.get('task_id')}, task_score={task_score}, "
                                            f"task_completed={task_completed}, task_ready_to_complete={task_ready_to_complete}"
                                        )

                                        # task_ready_to_complete：询问用户确认，不自动切换
                                        if task_ready_to_complete and not task_completed:
                                            task_title = workflow_result.get('task_title', 'Task')
                                            await self._safe_send({
                                                "type": "task_ready_to_complete",
                                                "payload": {
                                                    "task_id": workflow_result.get('task_id'),
                                                    "task_title": task_title,
                                                    "scenario_title": self.user_context.get('custom_topic', 'General Practice').split(" (Tasks:")[0].strip(),
                                                    "score": task_score,
                                                    "message": workflow_result.get('message', 'You have mastered this task!'),
                                                }
                                            })
                                            logger.info(f"[TASK_READY] Task ready to complete: {task_title} (score={task_score})")

                                            # 注入 AI 一次性指令：用目标语言询问学生是否继续或切换
                                            try:
                                                _target_lang_ask = (
                                                    self.user_context.get('target_language')
                                                    or (self.user_context.get('active_goal') or {}).get('target_language')
                                                    or 'the target language'
                                                )
                                                _native_lang_ask = (
                                                    self.user_context.get('native_language')
                                                    or _native_language
                                                    or 'Chinese'
                                                )
                                                self.conversation.send_raw(json.dumps({
                                                    "type": "response.create",
                                                    "response": {
                                                        "modalities": ["text", "audio"],
                                                        "instructions": (
                                                            f"The student has practiced this sub-task well (score >= 9). "
                                                            f"In {_target_lang_ask}, briefly acknowledge their progress (1 short sentence), "
                                                            f"then ask them: would they like to move on to the next sub-topic, or continue practicing this one more deeply? "
                                                            f"Keep it natural and warm. Do NOT say 'task complete' or '[TASK_N_COMPLETE]'. "
                                                            f"Wait for the student's answer before proceeding."
                                                        )
                                                    }
                                                }))
                                                logger.info("[TASK_READY] Injected confirmation-ask directive to AI")
                                            except Exception as _ask_err:
                                                logger.warning(f"[TASK_READY] Failed to inject confirmation directive: {_ask_err}")
                                        
                        asyncio.create_task(upload_ai_task(data, self.current_response_id))

                    # Send response.audio.done to client so it knows AI finished speaking
                    # This should be sent regardless of whether there's audio in the buffer
                    await self._safe_send({
                        "type": "response.audio.done",
                        "payload": {
                            "responseId": self.current_response_id
                        }
                    })
                    logger.info(f"Sent response.audio.done to client for response {self.current_response_id}")
                elif event_name == 'conversation.item.created':
                    # Track DashScope server-side conversation item IDs so we
                    # can delete them on task switch and stop prior-task
                    # transcripts leaking into the next task's AI context.
                    _item = response.get('item') or {}
                    _item_id = _item.get('id')
                    if _item_id:
                        self.item_ids.append(_item_id)
                elif event_name == 'conversation.item.input_audio_transcription.completed':
                    # Handle user audio transcription - send immediately to ensure correct UI order
                    user_transcript = response.get('transcript', '')
                    # Capture DashScope-detected language (e.g. 'zh', 'en', 'ja')
                    self.last_detected_language = response.get('language', '') or ''
                    if self.last_detected_language:
                        logger.info(f"Detected input language: {self.last_detected_language}")
                    if user_transcript:
                        # Check for magic passcode "急急如律令" (support both Chinese and English punctuation)
                        clean_text = re.sub(r'[,.!?.,!?;:;:。！？；：]', '', user_transcript).strip()
                        if clean_text == '急急如律令':
                            logger.info(f"Magic passcode detected in transcript! (original: '{user_transcript}', cleaned: '{clean_text}') Auto-completing current task...")

                            # Send test scenario review data to frontend
                            test_review = {
                                "workflow": "scenario_review",
                                "scenario_title": self.scenario or "Test Scenario",
                                "review_report": "# Test Review\n\n## 表现\n- 流利度：优秀\n- 词汇量：良好\n- 语法：准确\n\n## 建议\n- 继续练习复杂句型\n- 增加连接词使用",
                                "recommendations": {
                                    "overall": "🎉 表现出色！你的口语表达流畅自然，词汇使用准确。建议继续练习更复杂的句型结构。",
                                    "specific": [
                                        "📚 **词汇扩展**: 尝试学习更多场景相关的高级词汇",
                                        "💬 **表达扩展**: 尝试给出更长、更详细的回答，使用'because'、'for example'等连接词",
                                        "🗣️ **流利度**: 继续保持当前的流利度，尝试使用更多连接词如'however'、'therefore'"
                                    ]
                                },
                                "analysis": {
                                    "summary": "🎉 表现出色！你的口语表达流畅自然，词汇使用准确。",
                                    "total_messages": 15,
                                    "user_messages": 8,
                                    "vocabulary_diversity": 0.85,
                                    "strengths": ["流利度优秀", "词汇丰富", "语法准确"],
                                    "weaknesses": ["可以增加复杂句型"]
                                }
                            }
                            await self._safe_send({
                                "type": "test_scenario_review",
                                "payload": test_review
                            })
                            logger.info("Sent test scenario review to frontend")

                            # Complete current task and fetch next task
                            goal_id = self.user_context.get('active_goal', {}).get('id')
                            if goal_id:
                                try:
                                    user_service_url = os.getenv("USER_SERVICE_URL", "http://user-service:3000")
                                    async with httpx.AsyncClient() as client:
                                        # Complete current task
                                        complete_resp = await client.post(
                                            f"{user_service_url}/api/users/internal/users/{self.user_id}/tasks/complete",
                                            json={"scenario": self.scenario, "task": "NEXT_PENDING_TASK"},
                                            headers={"Authorization": f"Bearer {self.token}"}
                                        )
                                        if complete_resp.status_code == 200:
                                            logger.info("Auto-completed current task via magic passcode")
                                            
                                            # Get completed task info from response
                                            complete_data = complete_resp.json().get('data', {})
                                            completed_task_title = complete_data.get('task_title', 'Task completed')

                                            # Fetch next pending task to update user_context
                                            next_task_resp = await client.get(
                                                f"{user_service_url}/api/users/goals/next-task?scenario_title={self.scenario}",
                                                headers={"Authorization": f"Bearer {self.token}"}
                                            )
                                            if next_task_resp.status_code == 200:
                                                next_task_data = next_task_resp.json().get('data', {})
                                                next_task = next_task_data.get('task')

                                                if next_task:
                                                    # Update user_context with new task
                                                    self.user_context['current_task'] = next_task
                                                    self.user_context['custom_topic'] = f"{self.scenario} (Next task: {next_task.get('text', 'N/A')})"
                                                    self.user_context['next_task_text'] = next_task.get('text', '')
                                                    logger.info(f"Next task loaded via magic passcode: {next_task.get('text')}")
                                                    
                                                    # Send task_completed message to frontend to update UI
                                                    await self._safe_send({
                                                        "type": "task_completed",
                                                        "payload": {
                                                            "task_title": completed_task_title,
                                                            "next_task": next_task.get('text', '')
                                                        }
                                                    })

                                                    # Clear history and refresh prompt for new task
                                                    self.messages = []
                                                    self.task_history_cutoff = 0
                                                    self.just_switched_task = True
                                                    self._clear_dashscope_items(reason="TASK_SWITCH[magic_passcode]")
                                                    self._update_session_prompt()
                                                else:
                                                    logger.info(f"All tasks completed in scenario: {self.scenario}")
                                                    self.user_context['custom_topic'] = f"{self.scenario} (All tasks completed!)"
                                                    self.user_context['next_task_text'] = None
                                                    
                                                    # All tasks completed, call scenario review workflow for personalized feedback
                                                    logger.info("Scenario completed via magic passcode, calling scenario review workflow...")
                                                    try:
                                                        # Get conversation history for review
                                                        conv_history = self.messages[-50:] if len(self.messages) > 50 else self.messages
                                                        logger.info(f"Scenario review: conv_history length={len(conv_history)}, messages={self.messages[:3]}...")

                                                        # Guard: require at least 3 real user turns before deep evaluation
                                                        user_msg_count = sum(1 for m in conv_history if (m.get('role') == 'user') and (m.get('content') or '').strip())
                                                        if user_msg_count < 3:
                                                            logger.warning(
                                                                f"[SCENARIO_REVIEW] Skipping deep evaluation (magic passcode): only {user_msg_count} user turns (<3) in scenario '{self.scenario}'."
                                                            )
                                                            await self._safe_send({
                                                                "type": "scenario_completed",
                                                                "payload": {
                                                                    "scenario_title": self.scenario,
                                                                    "reason": "insufficient_practice",
                                                                    "user_turn_count": user_msg_count,
                                                                    "message": "本场景练习数据不足，建议完整完成 3 个子任务后再查看报告。"
                                                                }
                                                            })
                                                            await self._safe_send({
                                                                "type": "task_completed",
                                                                "payload": {
                                                                    "task_title": completed_task_title,
                                                                    "next_task": None,
                                                                    "scenario_completed": True,
                                                                    "reason": "insufficient_practice"
                                                                }
                                                            })
                                                            review_resp = None
                                                        else:
                                                            review_resp = await client.post(
                                                                f"{os.getenv('WORKFLOW_SERVICE_URL', 'http://workflow-service:3006')}/api/workflows/scenario-review/generate",
                                                                json={
                                                                    "user_id": self.user_id,
                                                                    "goal_id": goal_id,
                                                                    "scenario_title": self.scenario,
                                                                    "completed_tasks": [],
                                                                    "conversation_history": conv_history
                                                                },
                                                                headers={"Authorization": f"Bearer {self.token}"}
                                                            )
                                                        if review_resp is not None and review_resp.status_code == 200:
                                                            review_data = review_resp.json()
                                                            # API returns {"success": True, "data": {...}}
                                                            data = review_data.get('data', {})
                                                            logger.info(f"Scenario review generated: recommendations={data.get('recommendations', [])}")
                                                            logger.info(f"Scenario review analysis: {data.get('analysis', {})}")

                                                            # Build review payload for frontend
                                                            review_payload = {
                                                                "review_report": data.get('review_report', ''),
                                                                "recommendations": data.get('recommendations', []),
                                                                "analysis": data.get('analysis', {})
                                                            }

                                                            # Send scenario_review message to frontend
                                                            await self._safe_send({
                                                                "type": "scenario_review",
                                                                "payload": review_payload
                                                            })
                                                            logger.info(f"Sent scenario_review to frontend (via magic passcode): payload={review_payload}")

                                                            # Also send task_completed for the last task to trigger completion modal
                                                            await self._safe_send({
                                                                "type": "task_completed",
                                                                "payload": {
                                                                    "task_title": completed_task_title,
                                                                    "next_task": None,
                                                                    "scenario_completed": True
                                                                }
                                                            })
                                                            logger.info("Sent task_completed (scenario completed) to frontend")
                                                        elif review_resp is not None:
                                                            logger.error(f"Failed to generate scenario review: {review_resp.status_code}")
                                                    except Exception as e:
                                                        logger.error(f"Error calling scenario review: {e}")
                                            else:
                                                logger.error(f"Failed to fetch next task: {next_task_resp.status_code}")
                                        else:
                                            logger.error(f"Failed to complete task: {complete_resp.status_code}")
                                except Exception as e:
                                    logger.error(f"Failed to auto-complete task: {e}")

                            # Send user transcript to frontend (for display)
                            await self._safe_send({"type": "user_transcript", "payload": {"text": user_transcript}})

                            # Cancel AI response to prevent it from replying to the magic passcode
                            # This must be done AFTER sending user_transcript to frontend
                            if self.conversation and self.is_connected:
                                try:
                                    self.conversation.cancel_response()
                                    logger.info("Cancelled AI response for magic passcode")
                                except Exception as e:
                                    logger.error(f"Failed to cancel response: {e}")

                            # Don't add magic passcode to conversation history
                            logger.info("Magic passcode skipped from conversation history")
                            return  # Exit early
                        else:
                            # Normal input (not magic passcode) - send transcript and add to history
                            await self._safe_send({"type": "user_transcript", "payload": {"text": user_transcript}})
                            msg = {"role": "user", "content": user_transcript, "timestamp": datetime.utcnow().isoformat()}
                            if self.last_user_audio_url: msg['audioUrl'] = self.last_user_audio_url; self.last_user_audio_url = None
                            self.messages.append(msg)
                            await save_single_message(self.session_id, self.user_id, "user", user_transcript, msg.get('audioUrl'))
                elif event_name in ['response.audio_transcript.done', 'response.text.done']:
                    if not self.full_response_text:
                        transcript = response.get('transcript') or response.get('text')
                        if transcript: self.full_response_text = transcript
                    clean_text = re.sub(r'```json.*?```', '', self.full_response_text, flags=re.DOTALL|re.IGNORECASE).strip()
                    clean_text = re.sub(r'\{"action":.*?\}', '', clean_text, flags=re.DOTALL|re.IGNORECASE).strip()
                    self.full_response_text = clean_text
                    
                    # Send complete message to frontend in one go
                    # Note: Don't save to conversation service here - wait for audio.done to save with audioUrl
                    if self.full_response_text:
                        msg = {"role": "assistant", "content": self.full_response_text, "timestamp": datetime.utcnow().isoformat(), "responseId": self.current_response_id or f"ai-{int(time.time() * 1000)}"}
                        if self.last_ai_audio_url: msg['audioUrl'] = self.last_ai_audio_url; self.last_ai_audio_url = None
                        self.messages.append(msg)
                        # Removed: await save_single_message(...) - now saved in response.audio.done after audioUrl is generated

                        # Send complete message to frontend with responseId
                        await self._safe_send({
                            "type": "ai_message",
                            "payload": {
                                "content": self.full_response_text,
                                "responseId": self.current_response_id or f"ai-{int(time.time() * 1000)}",
                                "audioUrl": msg.get('audioUrl')
                            },
                            "timestamp": int(time.time() * 1000)
                        })
                        logger.info(f"Sent complete AI message: {self.full_response_text[:50]}...")

                    # Note: Task scoring is handled by proficiency_scoring workflow after each user interaction
                    # No need to manually update score here based on AI response keywords
                    self.full_response_text = ""
                    self.ai_responding = False  # AI finished responding
                    if hasattr(self, '_sent_role_for_turn'): delattr(self, '_sent_role_for_turn')
                elif event_name == 'error':
                    await self._safe_send({"type": "error", "payload": response})
            except Exception as e:
                logger.error(f"Error processing event: {e}")
        asyncio.run_coroutine_threadsafe(process_event(), self.loop)

    def on_close(self, code: int, message: str) -> None:
        self.is_connected = False
        logger.info(f"DashScope connection closed for session {self.session_id}, code={code}, message={message}")
        # If connection closed within 5 seconds of opening, treat as a failure (rate-limit / access-denied)
        _open_duration = time.time() - getattr(self, '_last_open_time', 0)
        if _open_duration < 5.0:
            self._reconnect_failures = getattr(self, '_reconnect_failures', 0) + 1
            logger.warning(f"[DashScope] Quick-close after {_open_duration:.1f}s, failure #{self._reconnect_failures}")
            if self._reconnect_failures >= 3:
                self.auth_denied = True
                logger.error(f"[DashScope] {self._reconnect_failures} quick-close failures — blocking reconnect for 60s to avoid rate-limit storm.")
                # Auto-clear after 60 seconds (allows retry after backoff period)
                def _clear_auth_denied():
                    self.auth_denied = False
                    self._reconnect_failures = 0
                    logger.info("[DashScope] Reconnect block lifted — retries allowed again.")
                import threading as _t
                _t.Timer(60, _clear_auth_denied).start()
        else:
            # Long-lived connection closed normally — reset failure count
            self._reconnect_failures = 0
        # Don't try to send message if WebSocket is already closed
        if self.websocket.client_state.name == 'CONNECTED':
            try:
                asyncio.run_coroutine_threadsafe(
                    self.websocket.send_json({"type": "connection_closed", "payload": {"code": code, "message": message}}),
                    self.loop
                )
            except Exception:
                pass  # Ignore errors if WebSocket is already closed

    def on_error(self, error: Exception) -> None:
        error_str = str(error)
        logger.error(f"DashScope Error: {error_str}")
        if 'Access denied' in error_str:
            self.auth_denied = True
            logger.error("[DashScope] Access denied — API key lacks permission or unsupported parameter. Reconnect blocked.")
        # Don't try to send message if WebSocket is already closed
        try:
            asyncio.run_coroutine_threadsafe(
                self.websocket.send_json({"type": "error", "payload": {"message": str(error)}}),
                self.loop
            )
        except Exception:
            pass  # Ignore errors if WebSocket is already closed

import re as _re

# 参数白名单：防止特殊字符注入破坏 URL/日志构造
_SESSION_ID_RE = _re.compile(r'^[a-zA-Z0-9_\-]{1,128}$')
_SCENARIO_RE   = _re.compile(r'^[\w\u4e00-\u9fff\s\-()（）]{0,200}$')
_VOICE_RE      = _re.compile(r'^[a-zA-Z0-9_\-]{0,64}$')

@app.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None), sessionId: str = Query(None), scenario: str = Query(None), voice: str = Query(None), mode: str = Query(None)):
    await websocket.accept()
    logger.info(f"New connection attempt for session {sessionId}")
    # token 优先从 query param 取（浏览器直连），其次从 Authorization header 取（comms-service 内部转发）
    if not token:
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token or not sessionId:
        await websocket.send_json({"type": "error", "payload": {"message": "Unauthorized"}})
        await websocket.close(); return

    # 白名单校验：防止注入特殊字符
    if not _SESSION_ID_RE.match(sessionId):
        logger.warning(f"[ws] Rejected invalid sessionId: {repr(sessionId)}")
        await websocket.send_json({"type": "error", "payload": {"message": "Invalid sessionId"}})
        await websocket.close(); return
    if scenario and not _SCENARIO_RE.match(scenario):
        logger.warning(f"[ws] Rejected invalid scenario: {repr(scenario)}")
        await websocket.send_json({"type": "error", "payload": {"message": "Invalid scenario"}})
        await websocket.close(); return
    if voice and not _VOICE_RE.match(voice):
        logger.warning(f"[ws] Rejected invalid voice: {repr(voice)}")
        await websocket.send_json({"type": "error", "payload": {"message": "Invalid voice"}})
        await websocket.close(); return

    user_context = await get_user_context(token, scenario)
    if not user_context:
        await websocket.send_json({"type": "error", "payload": {"message": "Invalid token"}})
        await websocket.close(); return
    user_id_raw = user_context.get('id')
    if not user_id_raw:
        logger.error(f"User context missing 'id': {user_context}")
        await websocket.send_json({"type": "error", "payload": {"message": "Invalid user context"}})
        await websocket.close(); return
    user_id, session_id = str(user_id_raw), sessionId
    if voice: user_context['voice'] = voice
    history_messages = []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{os.getenv('CONVERSATION_SERVICE_URL', 'http://localhost:8000')}/history/{session_id}")
            if resp.status_code == 200: 
                data = resp.json()
                history_messages = data.get('data', {}).get('messages', [])
                logger.info(f"Successfully loaded {len(history_messages)} history messages for session {session_id}")
            else:
                logger.warning(f"Failed to fetch history: status code {resp.status_code}")
    except Exception as e: 
        logger.warning(f"Failed to fetch history: {e}")
        logger.error(f"Error details: {str(e)}")
    loop = asyncio.get_running_loop()
    
    callback = WebSocketCallback(websocket, loop, user_context, token, user_id, session_id, history_messages, scenario)
    phase_key = callback.phase_key  # f"{user_id}:{scenario or ''}" — 每个场景独立

    # ── Daily Q&A mode bootstrap (Feature 2) ──
    # Must run BEFORE connect_dashscope so _update_session_prompt picks the daily_qa prompt.
    if mode == 'daily_qa':
        callback.is_daily_qa_mode = True
        target_language = (user_context.get("active_goal") or {}).get("target_language") or user_context.get("target_language") or "English"
        native_language = user_context.get("native_language") or "Chinese"
        _rc = _get_redis_client()
        _qa_payload = None
        if _rc is not None:
            try:
                _qa_payload = await handle_daily_question(
                    _rc, user_id, target_language=target_language, native_language=native_language,
                )
            except Exception as _qe:
                logger.warning(f"[DAILY_QA] handle_daily_question failed: {_qe}")
        if not _qa_payload:
            _fb = _fallback_by_language(target_language)
            _qa_payload = {
                "question_text": _fb[0]["question_text"],
                "lang": _fb[0].get("lang", ""),
                "reference_answer": _fb[0].get("reference_answer", ""),
                "qa_date": _today_utc_str(),
                "passed": False,
            }
        callback.daily_qa_question = _qa_payload.get("question_text", "")
        callback.daily_qa_completed = False  # Always allow detection for new questions
        callback.daily_qa_suppress_modal = bool(_qa_payload.get("passed"))  # Suppress WS event if already passed today
        try:
            await websocket.send_json({
                "type": "daily_qa_ready",
                "payload": _qa_payload,
            })
        except Exception as _we:
            logger.warning(f"[DAILY_QA] failed to send daily_qa_ready: {_we}")
        logger.info(f"[DAILY_QA] mode=daily_qa activated; question={callback.daily_qa_question[:80]!r}")

    # ── 初始化双阶段会话状态 ──
    is_recall_mode = (mode == 'recall')
    if phase_key not in session_phases:
        initial_phase = "magic_repetition" if is_recall_mode else "scene_theater"
        session_phases[phase_key] = {
            "phase": initial_phase,
            "task_index": 0,
            "magic_positive_streak": 0,
        }
    else:
        # 已有会话重连：非 recall 模式下若 phase 仍在 magic_repetition，强制跳到 scene_theater
        if not is_recall_mode and session_phases[phase_key].get("phase") == "magic_repetition":
            session_phases[phase_key]["phase"] = "scene_theater"
        # recall 模式下无论之前 phase 是什么，都强制重置到 magic_repetition
        elif is_recall_mode:
            session_phases[phase_key]["phase"] = "magic_repetition"
            session_phases[phase_key]["task_index"] = 0
            session_phases[phase_key]["magic_positive_streak"] = 0
    _init_phase_info = session_phases[phase_key]
    _init_task_text = _init_phase_info.get("_current_task_text", "")
    await send_phase_event(websocket, "phase_transition", {
        "phase": _init_phase_info["phase"],
        "task_index": _init_phase_info["task_index"],
        **({"task_text": _init_task_text} if _init_task_text else {}),
    })

    def connect_dashscope():
        try:
            logger.info(f"Connecting to DashScope for session {session_id}")
            conversation = OmniRealtimeConversation(model=os.getenv("QWEN3_OMNI_MODEL", "qwen3-omni-flash-realtime"), callback=callback)
            callback.conversation = conversation
            conversation.connect()
            logger.info(f"DashScope connected call initiated for session {session_id}")
            return conversation
        except Exception as e:
            logger.error(f"Error connecting to DashScope: {e}")
            logger.error(traceback.format_exc())
            raise e



    async def heartbeat():
        while True:
            try:
                await asyncio.sleep(15)
                await websocket.send_json({"type": "ping", "payload": {"timestamp": int(time.time())}})
                if conversation and callback and callback.is_connected:
                    try:
                        conversation.append_audio(base64.b64encode(b'\x00'*320).decode('utf-8'))
                    except Exception as e:
                        logger.error(f"Heartbeat audio append failed: {e}")
            except: break

    heartbeat_task = None
    conversation = None
    try:
        try:
            conversation = connect_dashscope()
        except Exception as e:
            await websocket.send_json({"type": "error", "payload": {"error": str(e)}})
            await websocket.close(); return

        heartbeat_task = asyncio.create_task(heartbeat())

        while True:
            try:
                message = await websocket.receive_text()
                data = json.loads(message)
                msg_type, payload = data.get('type'), data.get('payload', {})

                # Log messages except ping (which is too frequent)
                if msg_type != 'ping':
                    logger.info(f"Received message: {message[:200]}..." if len(message) > 200 else f"Received message: {message}")

                if msg_type == 'session_start':
                    logger.info(f"Received session_start for user {payload.get('userId')}")
                    # Store welcome_muted flag to suppress welcome message after retry
                    if payload.get('welcomeMuted'):
                        callback.welcome_muted = True
                        logger.info('Welcome message muted for this session')
                    continue

                # Handle user transcription - check for magic passcode "急急如律令"
                if msg_type == 'user_transcript':
                    text = payload.get('text', '').strip()
                    # Remove punctuation for matching (supports Chinese and English: 。！？,.!?)
                    clean_text = re.sub(r'[,.!?.,!?;:;:。！？；：]', '', text).strip()

                    if clean_text == '急急如律令':
                        logger.info(f"Magic passcode detected in transcript! (original: '{text}', cleaned: '{clean_text}') Auto-completing current task...")
                        # Send test scenario review data to frontend
                        test_review = {
                            "workflow": "scenario_review",
                            "scenario_title": callback.scenario or "Test Scenario",
                            "review_report": "# Test Review\n\n## 表现\n- 流利度：优秀\n- 词汇量：良好\n- 语法：准确\n\n## 建议\n- 继续练习复杂句型\n- 增加连接词使用",
                            "recommendations": {
                                "overall": "🎉 表现出色！你的口语表达流畅自然，词汇使用准确。建议继续练习更复杂的句型结构。",
                                "specific": [
                                    "📚 **词汇扩展**: 尝试学习更多场景相关的高级词汇",
                                    "💬 **表达扩展**: 尝试给出更长、更详细的回答，使用'because'、'for example'等连接词",
                                    "🗣️ **流利度**: 继续保持当前的流利度，尝试使用更多连接词如'however'、'therefore'"
                                ]
                            },
                            "analysis": {
                                "summary": "🎉 表现出色！你的口语表达流畅自然，词汇使用准确。",
                                "total_messages": 15,
                                "user_messages": 8,
                                "vocabulary_diversity": 0.85,
                                "strengths": ["流利度优秀", "词汇丰富", "语法准确"],
                                "weaknesses": ["可以增加复杂句型"]
                            }
                        }
                        await websocket.send_json({
                            "type": "test_scenario_review",
                            "payload": test_review
                        })
                        logger.info("Sent test scenario review to frontend")
                        
                        # Also complete current task
                        goal_id = callback.user_context.get('active_goal', {}).get('id')
                        if goal_id:
                            try:
                                user_service_url = os.getenv("USER_SERVICE_URL", "http://user-service:3000")
                                async with httpx.AsyncClient() as client:
                                    await client.post(
                                        f"{user_service_url}/api/users/internal/users/{callback.user_id}/tasks/complete",
                                        json={"scenario": callback.scenario, "task": "NEXT_PENDING_TASK"},
                                        headers={"Authorization": f"Bearer {callback.token}"}
                                    )
                                    logger.info("Auto-completed current task via magic passcode")
                            except Exception as e:
                                logger.error(f"Failed to auto-complete task: {e}")
                    # Continue to forward transcript to frontend (don't break the flow)

                # Handle ping from client - respond with pong
                if msg_type == 'ping':
                    logger.debug(f"Ping received from client (ts={payload.get('timestamp')}), sending pong")
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": payload.get("timestamp", int(time.time() * 1000)),
                        "sequence": payload.get("sequence", 0)
                    })
                    continue

                if (not conversation or not callback.is_connected) \
                        and not getattr(callback, 'auth_denied', False) \
                        and msg_type in ['audio_stream', 'text_message', 'input_text', 'user_audio_ended']:
                    # Exponential backoff: 1s, 2s, 4s … cap at 30s to avoid rate-limit storms
                    _failures = getattr(callback, '_reconnect_failures', 0)
                    _backoff = min(2 ** _failures, 30)
                    logger.warning(f"Attempting to reconnect DashScope (failure #{_failures}, backoff={_backoff}s)")
                    if conversation:
                        try: conversation.close()
                        except: pass
                    if _backoff > 1:
                        await asyncio.sleep(_backoff)
                    try:
                        conversation = connect_dashscope()
                        await asyncio.sleep(0.5)
                    except Exception as e:
                        logger.error(f"Reconnection failed: {e}")
                        continue
                        
                if msg_type == 'audio_stream':
                    audio_b64 = payload.get('audio')
                    sample_rate = payload.get('sample_rate', 16000)
                    audio_format = payload.get('format', 'pcm16')

                    if audio_b64:
                        # Log audio format for debugging
                        if not hasattr(connect_dashscope, 'audio_format_logged'):
                            logger.info(f"Receiving audio: sample_rate={sample_rate}, format={audio_format}")
                            connect_dashscope.audio_format_logged = True

                        # Decode audio data for buffering
                        try:
                            audio_data = base64.b64decode(audio_b64)
                            if callback.is_connected:
                                try:
                                    # Append audio to DashScope conversation
                                    # The SDK expects base64-encoded PCM data
                                    conversation.append_audio(audio_b64)
                                except Exception as e:
                                    logger.error(f"Error appending audio to DashScope: {e}")
                                    logger.error(traceback.format_exc())
                            callback.user_audio_buffer.extend(audio_data)
                        except Exception as e:
                            logger.error(f"Error decoding audio data: {e}")
                elif msg_type == 'user_audio_ended':
                    if callback.user_audio_buffer:
                        if callback.is_connected:
                            try:
                                conversation.commit()
                            except Exception as e:
                                logger.error(f"Error committing audio: {e}")
                        audio_data = bytes(callback.user_audio_buffer)
                        callback.user_audio_buffer = bytearray()
                        async def upload_user_task(d):
                            url = await callback.upload_audio_to_cos(d, 'user_audio')
                            if url: callback.last_user_audio_url = url
                        asyncio.create_task(upload_user_task(audio_data))
                    if callback.is_connected:
                        try:
                            conversation.create_response()
                        except Exception as e:
                            logger.error(f"Error creating response for audio: {e}")
                elif msg_type == 'user_audio_cancelled':
                    callback.user_audio_buffer = bytearray()
                    logger.info("User cancelled audio input, buffer cleared")
                elif msg_type in ['text_message', 'input_text']:
                    text = payload.get('text')
                    if text:
                        callback.messages.append({"role": "user", "content": text, "timestamp": datetime.utcnow().isoformat()})
                        if callback.is_connected:
                            try:
                                conversation.send_raw(json.dumps({"type": "conversation.item.create", "item": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": text}]}}))
                                conversation.create_response()
                            except Exception as e:
                                logger.error(f"Error creating response for text: {e}")
                elif msg_type == 'resend_magic_sentence':
                    # 前端刷新重连后请求重发当前任务句子
                    _resend_phase = session_phases.get(phase_key, {})
                    if _resend_phase.get("phase") == "magic_repetition" and callback.is_connected:
                        callback._skip_next_magic_pass = True
                        try:
                            _ri = _resend_phase.get("task_index", 0)
                            _resend_tasks = []
                            _resend_goal = callback.user_context.get('active_goal', {})
                            if _resend_goal.get('scenarios') and callback.scenario:
                                for _rsc in _resend_goal.get('scenarios', []):
                                    if _rsc.get('title') == callback.scenario:
                                        _resend_tasks = [t.get('text', '') if isinstance(t, dict) else str(t) for t in _rsc.get('tasks', [])]
                                        break
                            _resend_task_text = _resend_tasks[_ri] if _ri < len(_resend_tasks) else 'the current task'
                            callback.conversation.send_raw(json.dumps({
                                "type": "response.create",
                                "response": {
                                    "modalities": ["text", "audio"],
                                    "instructions": (
                                        f"You are a language coach presenting a Magic Repetition drill. "
                                        f"Generate ONE complex sentence (15-25 words) for the topic: '{_resend_task_text}'. "
                                        f"Your response MUST start EXACTLY with: [MAGIC_SENTENCE: WRITE_SENTENCE_HERE] (use SQUARE BRACKETS only) "
                                        f"Then ask the student to repeat it aloud."
                                    )
                                }
                            }))
                            logger.info(f"[Phase] resend_magic_sentence → triggering AI for task[{_ri}]: '{_resend_task_text[:40]}'")
                        except Exception as _re:
                            logger.error(f"[Phase] resend_magic_sentence failed: {_re}")
                elif msg_type == 'reset_magic_phase':
                    # Return to magic repetition phase from scene theater
                    session_phases[phase_key] = {
                        "phase": "magic_repetition",
                        "task_index": 0,
                        "magic_positive_streak": 0,
                        "memory_mode": False,
                    }
                    callback.messages = []
                    callback.task_history_cutoff = 0
                    callback._update_session_prompt()
                    _reset_task_text = session_phases[phase_key].get("_current_task_text", "")
                    await send_phase_event(websocket, "phase_transition", {
                        "phase": "magic_repetition", "task_index": 0,
                        **({"task_text": _reset_task_text} if _reset_task_text else {}),
                    })
                    logger.info(f"[Phase] reset_magic_phase → task[0], text='{_reset_task_text[:40]}'")
                elif msg_type == 'force_advance_magic':
                    # Manual skip button: force advance to next magic repetition task
                    phase_info = session_phases.get(phase_key, {})
                    if phase_info.get("phase") == "magic_repetition":
                        current_index = phase_info.get("task_index", 0)
                        # Build tasks list
                        _adv_tasks = []
                        _adv_goal = callback.user_context.get('active_goal', {})
                        if _adv_goal.get('scenarios') and callback.scenario:
                            for _sc in _adv_goal.get('scenarios', []):
                                if _sc.get('title') == callback.scenario:
                                    _adv_tasks = [t.get('text', '') if isinstance(t, dict) else str(t) for t in _sc.get('tasks', [])]
                                    break
                        next_index = current_index + 1
                        phase_info["magic_positive_streak"] = 0
                        phase_info["memory_mode"] = False
                        await send_phase_event(websocket, "magic_pass", {"task_index": current_index})
                        if next_index < len(_adv_tasks):
                            phase_info["task_index"] = next_index
                            # Directly read from tasks list — _update_session_prompt hasn't been called yet
                            next_task_val = _adv_tasks[next_index] if next_index < len(_adv_tasks) else ""
                            await send_phase_event(websocket, "phase_transition", {
                                "phase": "magic_repetition", "task_index": next_index, "task_text": next_task_val
                            })
                            callback.messages = []
                            callback.task_history_cutoff = 0
                            callback._update_session_prompt()
                            logger.info(f"[Phase] force_advance_magic → task[{next_index}], text='{next_task_val[:40]}'")
                        else:
                            phase_info["phase"] = "scene_theater"
                            phase_info["task_index"] = 0
                            await send_phase_event(websocket, "phase_transition", {"phase": "scene_theater", "task_index": 0})
                            callback.messages = []
                            callback.task_history_cutoff = 0
                            callback._update_session_prompt()
                            logger.info("[Phase] force_advance_magic → all done, scene_theater")
                elif msg_type == 'interrupt':
                    callback.interrupted_turn = True
                    if callback.current_response_id: callback.ignored_response_ids.add(callback.current_response_id)
                    if callback.is_connected:
                        try:
                            conversation.cancel_response()
                        except Exception as e:
                            logger.error(f"Error cancelling response: {e}")

                elif msg_type == 'user_confirmed_complete':
                    # 用户确认切换到下一个任务 → 调用 user-service 真正完成 + 加载下一个任务
                    try:
                        confirm_task_id = payload.get('task_id') or callback.user_context.get('current_task', {}).get('id')
                        if not confirm_task_id:
                            logger.warning("[TASK_CONFIRM] Missing task_id in user_confirmed_complete payload")
                            continue

                        user_service_url = os.getenv("USER_SERVICE_URL", "http://user-service:3000")
                        async with httpx.AsyncClient() as client:
                            confirm_resp = await client.post(
                                f"{user_service_url}/api/users/tasks/{confirm_task_id}/confirm-complete",
                                headers={"Authorization": f"Bearer {callback.token}"},
                                json={},
                                timeout=5.0,
                            )
                            if confirm_resp.status_code != 200:
                                logger.error(f"[TASK_CONFIRM] confirm-complete failed: {confirm_resp.status_code} {confirm_resp.text[:200]}")
                                await callback._safe_send({
                                    "type": "task_switch_error",
                                    "payload": {"message": "任务切换失败，请重试", "task_id": confirm_task_id}
                                })
                                continue

                            confirm_data = confirm_resp.json().get('data', {}) or {}
                            next_task_obj = confirm_data.get('next_task')
                            completed_task = confirm_data.get('completed_task') or {}

                            # 刷新 active_goal scenarios
                            goal_resp = await client.get(
                                f"{user_service_url}/api/users/goals/active",
                                headers={"Authorization": f"Bearer {callback.token}"},
                                timeout=5.0,
                            )
                            if goal_resp.status_code == 200:
                                goal_data = goal_resp.json().get('data', {})
                                active_goal = goal_data.get('goal', goal_data)
                                if active_goal and active_goal.get('scenarios'):
                                    callback.user_context['active_goal']['scenarios'] = active_goal.get('scenarios', [])

                        # 通知前端任务切换
                        await callback._safe_send({
                            "type": "task_completed",
                            "payload": {
                                "task_title": completed_task.get('task_description') or completed_task.get('text', 'Task'),
                                "scenario_title": callback.user_context.get('custom_topic', 'General Practice').split(" (Tasks:")[0].strip(),
                                "score": completed_task.get('score', 9),
                                "message": completed_task.get('feedback') or "Task completed!",
                                "next_task": (next_task_obj or {}).get('text') if isinstance(next_task_obj, dict) else None,
                            }
                        })

                        # 更新 user_context 到新任务
                        if isinstance(next_task_obj, dict):
                            callback.user_context['next_task_text'] = next_task_obj.get('text', '')
                            callback.user_context['current_task'] = next_task_obj
                        else:
                            callback.user_context['next_task_text'] = None
                            callback.user_context['current_task'] = None

                        # 清理服务端 history + items，刷新 session prompt
                        callback.messages = []
                        callback.task_history_cutoff = 0
                        callback.just_switched_task = True
                        callback._clear_dashscope_items(reason="TASK_SWITCH[user_confirmed]")
                        callback._update_session_prompt()

                        # Plan D: per-response directive 锁定新任务
                        try:
                            _next_task_for_directive = callback.user_context.get('next_task_text') or ''
                            _target_lang_directive = (
                                callback.user_context.get('target_language')
                                or (callback.user_context.get('active_goal') or {}).get('target_language')
                                or 'the target language'
                            )
                            if _next_task_for_directive:
                                conversation.send_raw(json.dumps({
                                    "type": "response.create",
                                    "response": {
                                        "modalities": ["text", "audio"],
                                        "instructions": (
                                            f"The previous sub-task is COMPLETED. You are now starting the new sub-task: "
                                            f"\"{_next_task_for_directive}\". Greet briefly in {_target_lang_directive} and invite "
                                            f"the student to start this new sub-task immediately. Do NOT reference the previous sub-task. "
                                            f"Do NOT say \"task complete\" or \"let's move on\" — just start the new sub-task naturally."
                                        )
                                    }
                                }))
                                logger.info(f"[TASK_CONFIRM] Switched to next task: {_next_task_for_directive[:60]}")
                            else:
                                logger.info("[TASK_CONFIRM] No more tasks — scenario may be complete")
                        except Exception as _directive_err:
                            logger.warning(f"[TASK_CONFIRM] Failed to inject per-response directive: {_directive_err}")

                    except Exception as confirm_err:
                        logger.error(f"[TASK_CONFIRM] Error handling user_confirmed_complete: {confirm_err}")
                        logger.error(traceback.format_exc())
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected for session {session_id}")
                break
            except Exception as e:
                logger.error(f"WS error: {e}")
                logger.error(traceback.format_exc())
                break
    finally:
        if heartbeat_task: heartbeat_task.cancel()
        if conversation:
            try: conversation.close()
            except: pass

async def send_phase_event(websocket, event_type: str, data: dict):
    """Unified helper to push phase-related WS events to the frontend."""
    try:
        await websocket.send_json({"type": event_type, "payload": data})
        logger.info(f"Sent phase event '{event_type}': {data}")
    except Exception as e:
        logger.error(f"Failed to send phase event '{event_type}': {e}")

@app.get("/health")
async def health_check():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# GET /daily-question - Feature 2: 今日问答
# ---------------------------------------------------------------------------
from fastapi import Request as _FastAPIRequest


@app.get("/daily-question")
async def daily_question_endpoint(request: _FastAPIRequest):
    """Return today's daily practice question for the authenticated user.

    Auth: JWT via httpOnly cookie `accessToken` or Authorization Bearer header.
    """
    token = request.cookies.get("accessToken")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_ctx = await get_user_context(token)
    if not user_ctx or not user_ctx.get("id"):
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = str(user_ctx["id"])
    target_language = (user_ctx.get("active_goal") or {}).get("target_language") or user_ctx.get("target_language") or "English"
    native_language = user_ctx.get("native_language") or "Chinese"

    redis_client = _get_redis_client()
    if redis_client is None:
        # Degrade: return a language-appropriate fallback question without caching
        fallback = _fallback_by_language(target_language)[0]
        return {
            "data": {
                "question_text": fallback["question_text"],
                "lang": fallback.get("lang", ""),
                "reference_answer": fallback.get("reference_answer", ""),
                "qa_date": _today_utc_str(),
                "passed": False,
                "cached": False,
            }
        }

    try:
        payload = await handle_daily_question(
            redis_client, user_id,
            target_language=target_language,
            native_language=native_language,
        )
    except Exception as e:
        logger.error(f"[DAILY_QA] /daily-question handler error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get daily question")

    return {"data": payload}


# ---------------------------------------------------------------------------
# POST /daily-question/re-answer — Pro-only: clear today's passed state so
# the user can answer the SAME question again.
# ---------------------------------------------------------------------------
@app.post("/daily-question/re-answer")
async def daily_question_re_answer(request: _FastAPIRequest):
    token = request.cookies.get("accessToken")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_ctx = await get_user_context(token)
    if not user_ctx or not user_ctx.get("id"):
        raise HTTPException(status_code=401, detail="Invalid token")
    _assert_pro(user_ctx)

    user_id = str(user_ctx["id"])
    target_language = (user_ctx.get("active_goal") or {}).get("target_language") or user_ctx.get("target_language") or "English"
    native_language = user_ctx.get("native_language") or "Chinese"
    date_str = _today_utc_str()

    redis_client = _get_redis_client()
    if redis_client is None:
        raise HTTPException(status_code=503, detail="redis_unavailable")

    # Keep passed key — extra practice should not re-trigger pass ceremony

    try:
        payload = await handle_daily_question(
            redis_client, user_id,
            target_language=target_language,
            native_language=native_language,
        )
    except Exception as e:
        logger.error(f"[DAILY_QA] re-answer: handle_daily_question error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get daily question")

    payload["passed"] = False
    logger.info(f"[DAILY_QA] re-answer: user={user_id} passed key cleared")
    return {"data": payload}


# ---------------------------------------------------------------------------
# POST /daily-question/change-question — Pro-only: advance pool to next
# question AND clear today's passed state.
# ---------------------------------------------------------------------------
@app.post("/daily-question/change-question")
async def daily_question_change_question(request: _FastAPIRequest):
    token = request.cookies.get("accessToken")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_ctx = await get_user_context(token)
    if not user_ctx or not user_ctx.get("id"):
        raise HTTPException(status_code=401, detail="Invalid token")
    _assert_pro(user_ctx)

    user_id = str(user_ctx["id"])
    target_language = (user_ctx.get("active_goal") or {}).get("target_language") or user_ctx.get("target_language") or "English"
    native_language = user_ctx.get("native_language") or "Chinese"
    date_str = _today_utc_str()

    redis_client = _get_redis_client()
    if redis_client is None:
        raise HTTPException(status_code=503, detail="redis_unavailable")

    try:
        await redis_client.delete(f"daily_qa_passed:{user_id}:{date_str}")
    except Exception as e:
        logger.warning(f"[DAILY_QA] change-question: delete passed key failed: {e}")

    try:
        picked = await _advance_daily_qa_pool(
            redis_client, user_id, date_str,
            target_language=target_language,
            native_language=native_language,
        )
    except Exception as e:
        logger.error(f"[DAILY_QA] change-question: advance failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to change daily question")

    payload = {
        "question_text": picked.get("question_text", ""),
        "lang": picked.get("lang", ""),
        "reference_answer": picked.get("reference_answer", ""),
        "qa_date": date_str,
        "passed": False,
    }
    logger.info(f"[DAILY_QA] change-question: user={user_id} new_question={payload['question_text'][:60]!r}")
    return {"data": payload}


# ---------------------------------------------------------------------------
# GET /daily-question/pool — Pro-only: return 3 candidate questions for
# selection from today's pool.
# ---------------------------------------------------------------------------
@app.get("/daily-question/pool")
async def daily_question_pool_endpoint(request: _FastAPIRequest):
    token = request.cookies.get("accessToken")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_ctx = await get_user_context(token)
    if not user_ctx or not user_ctx.get("id"):
        raise HTTPException(status_code=401, detail="Invalid token")
    _assert_pro(user_ctx)

    user_id = str(user_ctx["id"])
    target_language = (user_ctx.get("active_goal") or {}).get("target_language") or user_ctx.get("target_language") or "English"
    native_language = user_ctx.get("native_language") or "Chinese"

    redis_client = _get_redis_client()
    if redis_client is None:
        raise HTTPException(status_code=503, detail="redis_unavailable")

    try:
        questions = await get_daily_question_pool(
            redis_client, user_id,
            target_language=target_language,
            native_language=native_language,
            count=3,
        )
    except Exception as e:
        logger.error(f"[DAILY_QA] /daily-question/pool error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get question pool")

    logger.info(f"[DAILY_QA] pool: user={user_id} returned {len(questions)} candidates")
    return {"data": {"questions": questions}}


# ---------------------------------------------------------------------------
# POST /daily-question/select — Pro-only: select a question from today's pool
# by index, update Redis picked/index, clear passed state.
# ---------------------------------------------------------------------------
@app.post("/daily-question/select")
async def daily_question_select_endpoint(request: _FastAPIRequest):
    token = request.cookies.get("accessToken")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_ctx = await get_user_context(token)
    if not user_ctx or not user_ctx.get("id"):
        raise HTTPException(status_code=401, detail="Invalid token")
    _assert_pro(user_ctx)

    try:
        body = await request.json()
    except Exception:
        body = {}
    try:
        idx = int(body.get("index", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="index must be an integer")

    user_id = str(user_ctx["id"])
    date_str = _today_utc_str()
    cache_key = f"daily_qa_pool:{user_id}:{date_str}"
    passed_key = f"daily_qa_passed:{user_id}:{date_str}"

    redis_client = _get_redis_client()
    if redis_client is None:
        raise HTTPException(status_code=503, detail="redis_unavailable")

    # Keep passed key intact — Pro users doing extra practice should not
    # re-trigger the pass ceremony. The WS bootstrap reads passed=True
    # and skips marker detection / auto-pass entirely.

    cached_raw = await redis_client.get(cache_key)
    if not cached_raw:
        raise HTTPException(status_code=404, detail="No pool cached")

    try:
        data = json.loads(cached_raw if isinstance(cached_raw, str) else cached_raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="Corrupted pool cache")

    if isinstance(data, dict):
        pool = data.get("pool", []) or []
    elif isinstance(data, list):
        pool = data
    else:
        pool = []

    if not pool:
        raise HTTPException(status_code=404, detail="Empty pool")
    if idx < 0 or idx >= len(pool):
        raise HTTPException(status_code=400, detail=f"Invalid index {idx}, pool size {len(pool)}")

    picked = pool[idx] if isinstance(pool[idx], dict) else {"question_text": str(pool[idx]), "lang": "", "reference_answer": ""}
    new_payload = {"pool": pool, "index": idx, "picked": picked}
    try:
        await redis_client.setex(cache_key, _DAILY_QA_TTL_SECONDS, json.dumps(new_payload, ensure_ascii=False))
    except Exception as e:
        logger.warning(f"[DAILY_QA] select: setex failed: {e}")

    logger.info(f"[DAILY_QA] select: user={user_id} index={idx} question={picked.get('question_text', '')[:60]!r}")
    return {
        "data": {
            "question_text": picked.get("question_text", ""),
            "reference_answer": picked.get("reference_answer", ""),
            "lang": picked.get("lang", ""),
            "qa_date": date_str,
            "passed": False,
        }
    }


# ---------------------------------------------------------------------------
# POST /reset-phase - 重置用户会话阶段状态
# ---------------------------------------------------------------------------
from fastapi import HTTPException, Body, Request

@app.post("/reset-phase")
async def reset_phase(
    request: Request,
    user_id: str = Body(..., description="用户 ID"),
    scenario: str = Body(default="", description="场景名称"),
):
    """
    重置用户的会话阶段状态（session_phases）。
    需要通过 JWT cookie 或 Authorization header 验证身份，且请求的 user_id 必须与 token 持有者匹配。
    """
    # --- 身份验证 ---
    token = request.cookies.get("accessToken")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_context = await get_user_context(token)
    if not user_context:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    authenticated_user_id = str(user_context.get("id", ""))
    if authenticated_user_id != str(user_id):
        logger.warning(f"[reset-phase] Forbidden: token owner={authenticated_user_id}, requested user_id={user_id}")
        raise HTTPException(status_code=403, detail="Forbidden: user_id mismatch")

    # --- 重置逻辑 ---
    try:
        phase_key = f"{user_id}:{scenario or ''}"
        if phase_key in session_phases:
            old_phase = session_phases.copy_value(phase_key)
            session_phases[phase_key] = {
                "phase": "magic_repetition",
                "task_index": 0,
                "magic_positive_streak": 0,
                "memory_mode": False,
            }
            logger.info(f"[reset-phase] Cleared session_phases[{phase_key}]: {old_phase} → reset")
        else:
            logger.info(f"[reset-phase] No session_phases found for key {phase_key}")

        return {"success": True, "message": "Phase state reset successfully"}
    except Exception as e:
        logger.error(f"[reset-phase] Error resetting phase for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reset phase: {str(e)}")


# ---------------------------------------------------------------------------
# POST /generate-scene-image  (proxied from /api/ai/generate-scene-image)
# ---------------------------------------------------------------------------
from fastapi import Body
import urllib.parse
import urllib.request as _urllib_req

# DashScope TTS audio URL 域名白名单（防止 SSRF）
_ALLOWED_TTS_HOSTS = {"dashscope.aliyuncs.com", "oss-cn-beijing.aliyuncs.com", "oss-cn-hangzhou.aliyuncs.com", "oss-cn-shanghai.aliyuncs.com"}

def _validated_urlopen(url: str, timeout: int = 15) -> bytes:
    """Fetch URL with domain allowlist to prevent SSRF."""
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or ""
    if not any(host == d or host.endswith("." + d) for d in _ALLOWED_TTS_HOSTS):
        raise RuntimeError(f"TTS URL domain not allowed: {host}")
    if parsed.scheme not in ("http", "https"):
        raise RuntimeError(f"TTS URL scheme not allowed: {parsed.scheme}")
    with _urllib_req.urlopen(url, timeout=timeout) as f:
        return f.read()

# Mapping of common scenario keywords → Unsplash search terms
_SCENE_KEYWORD_MAP = {
    "kitchen": "cooking+food+kitchen",
    "厨房": "cooking+food+kitchen",
    "coffee": "cafe+coffee",
    "咖啡": "cafe+coffee",
    "cafe": "cafe+coffee",
    "restaurant": "restaurant+dining",
    "餐厅": "restaurant+dining",
    "office": "business+office",
    "办公": "business+office",
    "airport": "airport+travel",
    "机场": "airport+travel",
    "hotel": "hotel+room",
    "酒店": "hotel+room",
    "hospital": "hospital+medical",
    "医院": "hospital+medical",
    "market": "market+shopping",
    "超市": "supermarket+shopping",
    "商店": "shopping+store",
    "school": "school+classroom",
    "学校": "school+classroom",
    "park": "park+nature",
    "公园": "park+nature",
    "gym": "gym+fitness",
    "健身": "gym+fitness",
    "library": "library+books",
    "图书馆": "library+books",
    "travel": "travel+adventure",
    "旅行": "travel+adventure",
    "beach": "beach+ocean",
    "海滩": "beach+ocean",
    "station": "train+station",
    "车站": "train+station",
    "bank": "bank+finance",
    "银行": "bank+finance",
}

def _scenario_to_unsplash_keyword(scenario_title: str) -> str:
    """Map a scenario title to Unsplash search keywords."""
    lower = scenario_title.lower()
    for key, value in _SCENE_KEYWORD_MAP.items():
        if key in lower:
            return value
    # Fallback: use the title itself (URL-encoded)
    return urllib.parse.quote(scenario_title)

async def _try_wanx_image(scenario_title: str, prompt_en: str) -> str | None:
    """
    Attempt to generate an image via DashScope Wanx T2I.
    Returns the image URL on success, None on failure/timeout.
    Times out after 15 s to allow fallback to Unsplash.
    """
    import asyncio
    dashscope_key = os.environ.get("DASHSCOPE_API_KEY") or os.environ.get("QWEN3_OMNI_API_KEY")
    if not dashscope_key:
        return None

    async def _call_wanx() -> str | None:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                # DashScope image synthesis — submit task
                submit_resp = await client.post(
                    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
                    headers={
                        "Authorization": f"Bearer {dashscope_key}",
                        "X-DashScope-Async": "enable",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "wanx2.1-t2i-turbo",
                        "input": {"prompt": prompt_en},
                        "parameters": {"size": "768*512", "n": 1},
                    },
                )
                if submit_resp.status_code != 200:
                    logger.warning(f"[Wanx] Submit failed: {submit_resp.status_code} {submit_resp.text[:200]}")
                    return None
                task_id = submit_resp.json().get("output", {}).get("task_id")
                if not task_id:
                    return None

                # Poll for result (up to ~12 s)
                for _ in range(6):
                    await asyncio.sleep(2)
                    poll_resp = await client.get(
                        f"https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}",
                        headers={"Authorization": f"Bearer {dashscope_key}"},
                    )
                    if poll_resp.status_code != 200:
                        continue
                    poll_data = poll_resp.json().get("output", {})
                    status = poll_data.get("task_status")
                    if status == "SUCCEEDED":
                        results = poll_data.get("results", [])
                        if results:
                            return results[0].get("url")
                    elif status in ("FAILED", "CANCELED"):
                        logger.warning(f"[Wanx] Task {task_id} ended with status={status}")
                        return None
                return None  # Timed out polling
        except Exception as e:
            logger.warning(f"[Wanx] Error: {e}")
            return None

    try:
        return await asyncio.wait_for(_call_wanx(), timeout=15)
    except asyncio.TimeoutError:
        logger.warning(f"[Wanx] 15s timeout for scenario='{scenario_title}', falling back to Unsplash")
        return None


# ---------------------------------------------------------------------------
# POST /generate-scene-image  (proxied from /api/ai/generate-scene-image via Nginx)
# ---------------------------------------------------------------------------

@app.post("/generate-scene-image")
async def generate_scene_image(payload: dict = Body(...)):
    """
    Fetch a scene image for the Scene Theater phase.
    Strategy: try Wanx T2I (DashScope) with 15 s timeout → fallback to Unsplash.
    """
    from fastapi import HTTPException

    scenario_title = (payload.get("scenario_title") or "").strip()
    if not scenario_title:
        raise HTTPException(status_code=400, detail="Missing scenario_title")

    # Build English prompt for Wanx from scenario title
    keyword = _scenario_to_unsplash_keyword(scenario_title)
    prompt_en = f"Realistic photo of a {keyword.replace('+', ' ')} scene, natural lighting, no text"

    wanx_url = await _try_wanx_image(scenario_title, prompt_en)
    if wanx_url:
        logger.info(f"[SceneImage] Wanx succeeded for '{scenario_title}'")
        return {"image_url": wanx_url, "source": "wanx"}

    # Unsplash fallback
    unsplash_url = f"https://source.unsplash.com/800x400/?{keyword}"
    logger.info(f"[SceneImage] Using Unsplash fallback for '{scenario_title}'")
    return {"image_url": unsplash_url, "source": "unsplash"}


# ---------------------------------------------------------------------------
# POST /generate-scenarios  (proxied from /api/ai/generate-scenarios via Nginx)
# ---------------------------------------------------------------------------

@app.post("/generate-scenarios")
async def generate_scenarios(payload: dict = Body(...)):
    """Dynamically generate 10 oral-practice scenarios via qwen-turbo LLM."""
    target_language = (payload.get("target_language") or "English").strip()[:50]
    target_level    = (payload.get("target_level")    or "Intermediate").strip()[:30]
    goal_type       = (payload.get("type")            or "daily_conversation").strip()[:50]
    interests       = (payload.get("interests")       or "").strip()[:200]
    native_language = (payload.get("native_language") or "Chinese").strip()[:50]

    if not target_language or not target_level:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Missing required fields")

    ds_api_key = os.getenv("QWEN3_OMNI_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
    if not ds_api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="AI service not configured")

    prompt = (
        f"你是一位专业的口语学习课程设计师。请为一位学习{target_language}的用户生成恰好10个口语练习场景。\n\n"
        f"用户信息：\n"
        f"- 母语：{native_language}\n"
        f"- 学习语言：{target_language}\n"
        f"- 目标等级：{target_level}\n"
        f"- 目标类型：{goal_type}\n"
        f"- 兴趣爱好：{interests or '无特别说明'}\n\n"
        f"要求：\n"
        f"1. 生成10个与目标类型高度相关的实用场景\n"
        f"2. 每个场景包含清晰的标题和恰好3个具体的口语练习子任务\n"
        f"3. 子任务是用户需要用{target_language}完成的对话目标\n"
        f"4. 包含1个关于{target_language}文化小聊的场景\n"
        f"5. 场景从易到难排列\n"
        f"6. **所有场景标题和子任务描述必须用{native_language}书写**，让用户能用母语理解练习内容\n\n"
        f'仅输出如下格式的合法JSON，不要有任何多余内容：\n'
        f'{{"scenarios":[{{"title":"场景标题","tasks":["子任务1","子任务2","子任务3"]}}]}}'
    )

    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {ds_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "qwen-turbo",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 2048,
                    "response_format": {"type": "json_object"}
                }
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            scenarios = parsed.get("scenarios", [])
            if not scenarios:
                raise ValueError("Empty scenarios list")
            return {"code": 200, "message": "Success", "data": {"scenarios": scenarios}}
    except Exception as e:
        logger.error(f"[generate_scenarios] LLM call failed: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="场景生成失败，请重试")

# ---------------------------------------------------------------------------
# WAV → raw PCM extractor  (for media-processing-service which expects s16le PCM)
# ---------------------------------------------------------------------------
def _wav_extract_pcm(wav_bytes: bytes) -> bytes:
    """从 WAV 文件中提取原始 PCM 数据（去掉 RIFF 文件头）。
    media-processing-service 用 ffmpeg -f s16le 解析 ai_audio，
    若接收到 WAV 文件头，头部字节会被当作音频采样产生"ping"噪声。
    此函数定位 'data' chunk 并只返回 PCM 载荷。
    """
    if not wav_bytes or not wav_bytes[:4] == b'RIFF':
        return wav_bytes  # 不是 WAV，原样返回（MP3 等格式）
    try:
        i = 12  # 跳过 RIFF 和 WAVE 标识
        while i + 8 <= len(wav_bytes):
            chunk_id = wav_bytes[i:i+4]
            chunk_size = int.from_bytes(wav_bytes[i+4:i+8], 'little')
            if chunk_id == b'data':
                return wav_bytes[i+8:i+8+chunk_size]
            i += 8 + chunk_size + (chunk_size % 2)  # chunk 按字对齐
    except Exception:
        pass
    # 兜底：跳过标准 44 字节头
    return wav_bytes[44:] if len(wav_bytes) > 44 else wav_bytes


def _trim_wav_onset(wav_bytes: bytes, trim_ms: int = 150) -> bytes:
    """裁剪 WAV 文件开头的 onset artifact（用于直接发给浏览器的 WAV）。
    注意：不用于发送给 media-processing-service 的路径，那里应用 _wav_extract_pcm。
    """
    import struct
    if len(wav_bytes) < 44 or not wav_bytes[:4] == b'RIFF':
        return wav_bytes
    try:
        sample_rate = struct.unpack_from('<I', wav_bytes, 24)[0]
        bits_per_sample = struct.unpack_from('<H', wav_bytes, 34)[0]
        channels = struct.unpack_from('<H', wav_bytes, 22)[0]
        bytes_per_sample = (bits_per_sample // 8) * channels
        trim_bytes = int(sample_rate * bytes_per_sample * trim_ms / 1000)
        trim_bytes = (trim_bytes // bytes_per_sample) * bytes_per_sample
        data_start = 44
        data_len = len(wav_bytes) - data_start
        if trim_bytes <= 0 or trim_bytes >= data_len:
            return wav_bytes
        new_data = wav_bytes[data_start + trim_bytes:]
        new_size = len(new_data)
        header = bytearray(wav_bytes[:44])
        struct.pack_into('<I', header, 4, new_size + 36)
        struct.pack_into('<I', header, 40, new_size)
        return bytes(header) + new_data
    except Exception:
        return wav_bytes

# ---------------------------------------------------------------------------
# POST /tts  (proxied from /api/ai/tts via Nginx)
# ---------------------------------------------------------------------------
from fastapi.responses import Response as FastAPIResponse

@app.post("/tts")
async def text_to_speech(payload: dict = Body(...)):
    """Synthesize speech via Qwen3-TTS — supports 10 languages + mixed text."""
    text = (payload.get("text") or "").strip()[:500]
    voice = (payload.get("voice") or "Serena").strip()

    if not text:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Missing text")

    ds_api_key = os.getenv("QWEN3_OMNI_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
    if not ds_api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="AI service not configured")

    try:
        def _synth():
            dashscope.api_key = ds_api_key
            response = dashscope.MultiModalConversation.call(
                model="qwen3-tts-flash",
                text=text,
                voice=voice,
            )
            if not response or response.status_code != 200:
                raise RuntimeError(f"TTS API error: {getattr(response, 'status_code', 'unknown')}")
            audio_url = response.output.get("audio", {}).get("url")
            if not audio_url:
                raise RuntimeError("No audio URL in response")
            return _validated_urlopen(audio_url, timeout=15)

        loop = asyncio.get_event_loop()
        audio_bytes = await loop.run_in_executor(None, _synth)
        audio_bytes = _trim_wav_onset(audio_bytes)
        return FastAPIResponse(content=audio_bytes, media_type="audio/wav")
    except Exception as e:
        logger.error(f"[tts] synthesis failed: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="语音合成失败")


_LANG_CODE_MAP = {
    "zh": "Chinese", "zh-cn": "Chinese", "zh-tw": "Traditional Chinese",
    "en": "English", "ja": "Japanese", "ko": "Korean",
    "fr": "French", "es": "Spanish", "de": "German",
    "pt": "Portuguese", "ru": "Russian", "ar": "Arabic",
    "中文": "Chinese", "chinese": "Chinese", "japanese": "Japanese",
    "english": "English", "korean": "Korean",
}

class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "Chinese"

@app.post("/translate")
async def translate_text(req: TranslateRequest):
    from dashscope import Generation
    # Normalize language code/name to full English name
    lang = _LANG_CODE_MAP.get(req.target_lang.lower(), req.target_lang)
    prompt = (
        f"Translate the following text into {lang}. "
        f"Output ONLY the translation, no explanation, no extra text:\n\n{req.text}"
    )
    response = Generation.call(
        api_key=os.getenv("DASHSCOPE_API_KEY") or os.getenv("QWEN3_OMNI_API_KEY"),
        model="qwen-turbo",
        messages=[{"role": "user", "content": prompt}],
        result_format="message"
    )
    if response.status_code == 200:
        translation = response.output.choices[0].message.content.strip()
        return {"translation": translation}
    logger.error(f"[translate] DashScope error: {response.status_code} {response.message}")
    raise HTTPException(status_code=500, detail="Translation failed")


if __name__ == "__main__":
    import uvicorn

    # Get port configuration
    main_port = int(os.getenv("AI_SERVICE_PORT", "8082"))

    print(f"Starting AI service on port {main_port}")
    print("WebSocket endpoint available at /stream")
    print("Health check endpoint available at /health")

    # Run single server that handles both WebSocket and health check endpoints
    uvicorn.run(app, host="0.0.0.0", port=main_port)