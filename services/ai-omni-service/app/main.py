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
async def call_proficiency_workflow(user_id: str, goal_id: int, task_id: int, conversation_history: list, user_context: dict, token: str, scenario: str = None):
    """
    调用工作流 2（熟练度打分）来分析对话并更新分数
    
    改进：
    - 任务完成后自动获取下一个待完成任务
    - 更新 user_context 以便 AI 切换到新任务
    """
    try:
        # 如果没有 task_id，需要从 user-service 获取当前任务 ID
        task_description = user_context.get('custom_topic', 'General Practice')
        scenario_title = user_context.get('custom_topic', 'General Practice').split(" (Tasks:")[0].strip()
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
                        goal_data = goal_resp.json().get('data', {})
                        active_goal = goal_data.get('goal', {})
                        scenarios = active_goal.get('scenarios', [])

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
                            tasks = matched_scenario.get('tasks', [])
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

                return result_data
            else:
                logger.error(f"Failed to call proficiency workflow: {resp.status_code} {resp.text}")
                return None
    except Exception as e:
        logger.error(f"Error calling proficiency workflow: {e}")
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
        self.conversation = None
        self.full_response_text = ""
        # If scenario is provided, always use OralTutor role for practice
        self.role = "OralTutor" if scenario else self._determine_role(user_context)
        self.is_connected = False
        self.interrupted_turn = False
        self.current_response_id = None
        self.ignored_response_ids = set()
        self.messages = history_messages
        self.user_audio_buffer = bytearray()
        self.ai_audio_buffer = bytearray()
        self.last_user_audio_url = None
        self.last_ai_audio_url = None
        self.welcome_sent = False
        self.welcome_muted = False  # Flag to suppress welcome message after retry
        self.session_ready = False
        self.pending_user_transcript = None  # Buffer user transcript until AI response completes
        self.ai_responding = False  # Track if AI is currently responding
        self.connection_established_sent = False  # Track if we've sent connection_established

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
                    # Get current task (first incomplete) or last task if all completed
                    tasks = matched_scenario.get('tasks', [])
                    current_task = next((t for t in tasks if isinstance(t, dict) and t.get('status') != 'completed'), None)
                    
                    if current_task:
                        # Highlight current task explicitly
                        task_text = current_task.get('text', 'Practice conversation')
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

            system_prompt = prompt_manager.generate_system_prompt(full_ctx, role=self.role)
            selected_voice = self.user_context.get('voice') or os.getenv("QWEN3_OMNI_VOICE", "Cherry")

            if self.messages:
                history_text = "\n\n# Previous Conversation Context (READ-ONLY):\n"
                history_text += "**CRITICAL**: This is HISTORY only. Do NOT auto-complete tasks. Wait for user to speak first.\n"
                history_text += "**Do NOT say 'Perfect!' or 'Excellent!' until user attempts a NEW task in THIS session.**\n"
                history_text += f"**CURRENT TASK**: {full_ctx.get('task_description', 'Practice conversation')} in scenario: {self.scenario}\n"
                history_text += "**If user asks about the topic, tell them the current task clearly.**\n\n"
                recent_msgs = self.messages[-10:]
                for msg in recent_msgs:
                    role_label = "User" if msg['role'] == 'user' else "AI"
                    history_text += f"{role_label}: {msg.get('content', '')}\n"
                history_text += "\n**NOW**: Wait silently for user to speak. Greet briefly if needed, then listen.\n"
                system_prompt += history_text

            logger.info(f"Sending System Prompt ({self.role}): {system_prompt[:100]}...")
            try:
                self.conversation.update_session(
                    instructions=system_prompt,
                    voice=selected_voice,
                    output_modalities=[MultiModality.TEXT, MultiModality.AUDIO],
                    input_audio_format=AudioFormat.PCM_16000HZ_MONO_16BIT,  # Explicitly set input audio format
                    input_audio_transcription={"model": os.getenv("QWEN3_OMNI_MODEL", "qwen3-omni-flash-realtime"), "enabled": True},
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
            logger.info(f"Detailed Event Data: {json.dumps(response)[:500]}")

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
                                
                                # 调用工作流 2（熟练度打分）- 只在用户有输入后才调用
                                # Skip workflow call if this is the welcome message (no user input yet)
                                user_message_count = sum(1 for m in self.messages if m.get("role") == "user")
                                if goal_id and user_message_count > 0:
                                    workflow_result = await call_proficiency_workflow(
                                        self.user_id,
                                        goal_id,
                                        task_id or 0,
                                        self.messages,
                                        self.user_context,
                                        self.token,
                                        self.scenario
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
                                            await self._safe_send({
                                                "type": "task_completed",
                                                "payload": {
                                                    "task_title": workflow_result.get('task_title', 'Task'),
                                                    "scenario_title": self.user_context.get('custom_topic', 'General Practice').split(" (Tasks:")[0].strip(),
                                                    "score": task_score,
                                                    "message": workflow_result.get('message', 'Task completed!')
                                                }
                                            })
                                            logger.info(f"Task completed: {workflow_result.get('task_title')}")

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

                                            # Clear conversation history to prevent context confusion when switching tasks
                                            # Keep only the last 2 messages for context continuity
                                            if len(self.messages) > 2:
                                                old_messages = self.messages[-2:]  # Keep last 2 messages
                                                self.messages = old_messages
                                                logger.info(f"Cleared conversation history, kept last {len(old_messages)} messages")

                                            # Now refresh AI session prompt with updated task data
                                            self._update_session_prompt()
                                        
                        asyncio.create_task(upload_ai_task(data, self.current_response_id))
                elif event_name == 'conversation.item.input_audio_transcription.completed':
                    # Handle user audio transcription - send immediately to ensure correct UI order
                    user_transcript = response.get('transcript', '')
                    if user_transcript:
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
        logger.error(f"DashScope Error: {error}")
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

                # Handle ping from client - respond with pong
                if msg_type == 'ping':
                    logger.debug(f"Ping received from client (ts={payload.get('timestamp')}), sending pong")
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": payload.get("timestamp", int(time.time() * 1000)),
                        "sequence": payload.get("sequence", 0)
                    })
                    continue

                if (not conversation or not callback.is_connected) and msg_type in ['audio_stream', 'text_message', 'input_text', 'user_audio_ended']:
                    logger.warning("Attempting to reconnect DashScope due to inactive connection")
                    if conversation:
                        try: conversation.close()
                        except: pass
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

@app.get("/health")
async def health_check(): 
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn

    # Get port configuration
    main_port = int(os.getenv("AI_SERVICE_PORT", "8082"))

    print(f"Starting AI service on port {main_port}")
    print("WebSocket endpoint available at /stream")
    print("Health check endpoint available at /health")

    # Run single server that handles both WebSocket and health check endpoints
    uvicorn.run(app, host="0.0.0.0", port=main_port)