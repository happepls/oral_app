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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
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
session_phases: dict = {}

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
                                        "conversation_history": conversation_history[-50:]  # 最近 50 轮对话
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

    async def _safe_send(self, message: dict):
        """Safely send a WebSocket message, ignoring errors if client is disconnected."""
        if not self.is_connected:
            return
        try:
            await self.websocket.send_json(message)
        except (WebSocketDisconnect, Exception):
            pass  # Ignore errors if WebSocket is already closed

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

    def _update_session_prompt(self):
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
                        full_ctx['active_goal']['current_task'] = {
                            'scenario_title': self.scenario,
                            'task_description': task_text
                        }

                        logger.info(f"Selected Scenario: {self.scenario}, Current Task: {task_text}")
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
                tasks_list = []
                if active_goal.get('scenarios'):
                    matched = next((s for s in active_goal.get('scenarios', []) if s.get('title') == self.scenario), None)
                    if matched:
                        tasks_list = [t.get('text', '') if isinstance(t, dict) else str(t) for t in matched.get('tasks', [])]
                system_prompt = prompt_manager.generate_scene_theater_prompt(
                    image_url=phase_info.get("scene_image_url", ""),
                    tasks=tasks_list, target_language=target_lang, native_language=native_lang
                )
                logger.info(f"[Phase] scene_theater prompt, image={phase_info.get('scene_image_url', '')[:60]}")
            else:
                system_prompt = prompt_manager.generate_system_prompt(full_ctx, role=self.role)

            selected_voice = self.user_context.get('voice') or os.getenv("QWEN3_OMNI_VOICE", "Cherry")

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
                            url = await self.upload_audio_to_cos(d, 'ai_audio')
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
                                # Check the latest AI message for phase markers
                                latest_ai_text = ""
                                for msg_item in reversed(self.messages):
                                    if msg_item.get("role") == "assistant":
                                        latest_ai_text = msg_item.get("content", "")
                                        break

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

                                # 调用工作流 2（熟练度打分）- 只在用户有输入后才调用
                                # Skip workflow call if this is the welcome message (no user input yet)
                                user_message_count = sum(1 for m in self.messages if m.get("role") == "user")
                                _magic_phase_info = session_phases.get(self.phase_key, {})
                                if goal_id and user_message_count > 0 and _magic_phase_info.get("phase") != "magic_repetition":
                                    workflow_result = await call_proficiency_workflow(
                                        self.user_id,
                                        goal_id,
                                        task_id or 0,
                                        self.messages,
                                        self.user_context,
                                        self.token,
                                        self.scenario,
                                        self.websocket,
                                        detected_language=self.last_detected_language
                                    )
                                    
                                    if workflow_result:
                                        delta = workflow_result.get('proficiency_delta', 0)
                                        total = workflow_result.get('total_proficiency', 0)
                                        task_completed = workflow_result.get('task_completed', False)
                                        task_score = workflow_result.get('task_score', 0)
                                        improvement_tips = workflow_result.get('improvement_tips', [])
                                        
                                        # 计算进度条百分比
                                        progress = min(100, round((task_score / 9) * 100)) if task_score else 0
                                        
                                        # 发送proficiency_update到前端
                                        if delta > 0 or improvement_tips:
                                            await self._safe_send({
                                                "type": "proficiency_update",
                                                "payload": {
                                                    "delta": delta,
                                                    "total": total,
                                                    "task_id": workflow_result.get('task_id', 0),
                                                    "task_score": task_score,
                                                    "message": workflow_result.get('message', ''),
                                                    "improvement_tips": workflow_result.get('improvement_tips', [])
                                                }
                                            })
                                            logger.info(f"Sent proficiency_update: delta={delta}, total={total}, task_id={workflow_result.get('task_id')}, task_score={task_score}")
                                        
                                        # 发送task_completed到前端
                                        if task_completed:
                                            # 获取下一个任务信息
                                            next_task_text = self.user_context.get('next_task_text')
                                            
                                            await self._safe_send({
                                                "type": "task_completed",
                                                "payload": {
                                                    "task_title": workflow_result.get('task_title', 'Task'),
                                                    "scenario_title": self.user_context.get('custom_topic', 'General Practice').split(" (Tasks:")[0].strip(),
                                                    "score": task_score,
                                                    "message": workflow_result.get('message', 'Task completed!'),
                                                    "next_task": next_task_text  # 添加下一个任务信息
                                                }
                                            })
                                            logger.info(f"Task completed: {workflow_result.get('task_title')}, Next: {next_task_text}")

                                            # 刷新 AI 的 session prompt 以更新任务上下文
                                            logger.info("Refreshing AI session prompt with new task context...")

                                            # 先从数据库获取最新的任务状态
                                            try:
                                                user_service_url = os.getenv("USER_SERVICE_URL", "http://user-service:3000")
                                                async with httpx.AsyncClient() as client:
                                                    # Fetch updated goal and tasks from backend
                                                    goal_resp = await client.get(
                                                        f"{user_service_url}/api/users/goals/active",
                                                        headers={"Authorization": f"Bearer {self.token}"},
                                                        timeout=5.0
                                                    )
                                                    if goal_resp.status_code == 200:
                                                        goal_data = goal_resp.json().get('data', {})
                                                        active_goal = goal_data.get('goal', goal_data)

                                                        # Update user_context with fresh task data
                                                        if active_goal and active_goal.get('scenarios'):
                                                            scenarios = active_goal.get('scenarios', [])
                                                            matched_scenario = next((s for s in scenarios if s.get('title') == self.scenario), None)
                                                            if matched_scenario:
                                                                # Update the scenario tasks in user_context
                                                                self.user_context['active_goal']['scenarios'] = scenarios
                                                                logger.info(f"Updated task data from backend: {len(matched_scenario.get('tasks', []))} tasks")
                                            except Exception as e:
                                                logger.error(f"Failed to fetch updated task data: {e}")

                                            # Clear ALL conversation history on task switch to prevent
                                            # the AI from referencing the completed task's context.
                                            self.messages = []
                                            self.task_history_cutoff = 0
                                            self.just_switched_task = True
                                            logger.info("Cleared ALL conversation history on task switch")

                                            # Now refresh AI session prompt with updated task data
                                            self._update_session_prompt()
                                        
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
                                                        if review_resp.status_code == 200:
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
                                                        else:
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

@app.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None), sessionId: str = Query(None), scenario: str = Query(None), voice: str = Query(None)):
    await websocket.accept()
    logger.info(f"New connection attempt for session {sessionId}")
    if not token or not sessionId:
        await websocket.send_json({"type": "error", "payload": {"message": "Unauthorized"}})
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

    # ── 初始化双阶段会话状态 ──
    if phase_key not in session_phases:
        session_phases[phase_key] = {
            "phase": "magic_repetition",
            "task_index": 0,
            "magic_positive_streak": 0,
        }
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
# POST /reset-phase - 重置用户会话阶段状态
# ---------------------------------------------------------------------------
from fastapi import HTTPException, Body

@app.post("/reset-phase")
async def reset_phase(user_id: str = Body(..., description="用户 ID"), scenario: str = Body(default="", description="场景名称")):
    """
    重置用户的会话阶段状态（session_phases）。
    当用户点击重置按钮时调用，清理魔法重复阶段的所有状态。
    """
    try:
        phase_key = f"{user_id}:{scenario or ''}"
        if phase_key in session_phases:
            old_phase = session_phases[phase_key].copy()
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
            import urllib.request
            with urllib.request.urlopen(audio_url, timeout=15) as f:
                return f.read()

        loop = asyncio.get_event_loop()
        audio_bytes = await loop.run_in_executor(None, _synth)
        return FastAPIResponse(content=audio_bytes, media_type="audio/wav")
    except Exception as e:
        logger.error(f"[tts] synthesis failed: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="语音合成失败")


if __name__ == "__main__":
    import uvicorn

    # Get port configuration
    main_port = int(os.getenv("AI_SERVICE_PORT", "8082"))

    print(f"Starting AI service on port {main_port}")
    print("WebSocket endpoint available at /stream")
    print("Health check endpoint available at /health")

    # Run single server that handles both WebSocket and health check endpoints
    uvicorn.run(app, host="0.0.0.0", port=main_port)