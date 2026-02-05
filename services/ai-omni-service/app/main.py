import os
import json
import base64
import asyncio
import logging
import httpx
import time
import re
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

# DashScope API Key
api_key = os.getenv("DASHSCOPE_API_KEY")
if not api_key:
    logger.error("DASHSCOPE_API_KEY not found in environment")
dashscope.api_key = api_key

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

async def get_user_context(token: str):
    """Fetches user profile and goal context from user-service."""
    user_service_url = os.getenv("USER_SERVICE_URL", "http://localhost:3001")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{user_service_url}/profile",
                headers={"Authorization": f"Bearer {token}"},
                timeout=5.0
            )
            if resp.status_code == 200:
                data = resp.json().get('data', {})
                goal_resp = await client.get(
                    f"{user_service_url}/goals/active",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=5.0
                )
                if goal_resp.status_code == 200:
                    data['active_goal'] = goal_resp.json().get('data')
                return data
            else:
                logger.error(f"Failed to fetch user context: {resp.status_code} {resp.text}")
                return None
    except Exception as e:
        logger.error(f"Error fetching user context: {e}")
        return None

async def save_conversation_history(session_id: str, user_id: str, messages: list, scenario: str):
    """Persists conversation state to conversation-service."""
    conv_service_url = os.getenv("CONVERSATION_SERVICE_URL", "http://localhost:8000")
    payload = {
        "sessionId": session_id,
        "userId": int(user_id),
        "messages": messages,
        "scenario": scenario
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{conv_service_url}/history/save",
                json=payload,
                timeout=5.0
            )
            if resp.status_code != 200:
                logger.error(f"Failed to save history: {resp.status_code} {resp.text}")
            else:
                logger.info(f"Saved {len(messages)} messages to conversation-service for session {session_id}")
    except Exception as e:
        logger.error(f"Error saving history: {e}")

async def execute_action_with_response(action_name: str, params: dict, token: str, user_id: str, session_id: str, context: dict = None):
    """Executes a system action (like updating goals) by calling the appropriate microservice."""
    user_service_url = os.getenv("USER_SERVICE_URL", "http://localhost:3001")
    
    if action_name == "update_profile":
        try:
            async with httpx.AsyncClient() as client:
                await client.put(
                    f"{user_service_url}/profile",
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

                payload = {
                    "scenarioTitle": scenario_title,
                    "taskTitle": params.get('task'),
                    "scoreDelta": params.get('scoreDelta', 10),
                    "feedback": params.get('feedback', '')
                }
                
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        f"{user_service_url}/goals/{goal_id}/tasks/complete",
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

# --- Prompt Management ---

class PromptManager:
    def __init__(self, prompt_file: str = "app/prompts.py"):
        try:
            from . import prompts
            self.prompts = prompts
        except ImportError:
            self.prompts = None

    def generate_system_prompt(self, context: dict, role: str = "OralTutor") -> str:
        base_prompt = getattr(self.prompts, f"{role}_PROMPT", "") if self.prompts else ""
        try:
            formatted = base_prompt.format(
                nickname=context.get('nickname', 'Explorer'),
                native_language=context.get('native_language', 'Chinese'),
                target_language=context.get('target_language', 'English'),
                interests=", ".join(context.get('interests', [])),
                current_focus=context.get('custom_topic', 'General conversation')
            )
            return formatted
        except Exception as e:
            logger.warning(f"Failed to format prompt: {e}")
            return base_prompt

prompt_manager = PromptManager()

# --- DashScope Integration ---

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
        self.role = self._determine_role(user_context)
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
        self.session_ready = False
        logger.info(f"Assigned Role: {self.role}, Loaded History: {len(self.messages)} msgs")

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
        asyncio.run_coroutine_threadsafe(
            self.websocket.send_json({
                "type": "connection_established",
                "payload": {"connectionId": "python-session", "message": f"Connected to Qwen3-Omni (Role: {self.role})", "role": self.role}
            }),
            self.loop
        )
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
                    tasks = matched_scenario.get('tasks', [])
                    tasks_str = ", ".join([t.get('text', str(t)) if isinstance(t, dict) else str(t) for t in tasks])
                    self.user_context['custom_topic'] = f"{self.scenario} (Tasks: {tasks_str})"
                    full_ctx['custom_topic'] = self.user_context['custom_topic']
                    logger.info(f"Selected Scenario: {self.scenario}, Tasks: {tasks_str}")
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
                history_text += "**Do NOT say 'Perfect!' or 'Excellent!' until user attempts a NEW task in THIS session.**\n\n"
                recent_msgs = self.messages[-10:] 
                for msg in recent_msgs:
                    role_label = "User" if msg['role'] == 'user' else "AI"
                    history_text += f"{role_label}: {msg.get('content', '')}\n"
                history_text += "\n**NOW**: Wait silently for user to speak. Greet briefly if needed, then listen.\n"
                system_prompt += history_text

            logger.info(f"Sending System Prompt ({self.role}): {system_prompt[:100]}...")
            self.conversation.update_session(
                instructions=system_prompt,
                voice=selected_voice,
                output_modalities=[MultiModality.TEXT, MultiModality.AUDIO],
                input_audio_transcription={"model": os.getenv("QWEN3_OMNI_MODEL", "qwen3-omni-flash-realtime"), "enabled": True},
                enable_turn_detection=False,
            )

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
        rid = response.get('header', {}).get('response_id') or response.get('response_id') or response.get('request_id')
        if event_name not in ['response.audio.delta', 'response.audio_transcript.delta']: logger.info(f"Event: {event_name}, RID: {rid}")
        
        if event_name == 'session.created':
            self.session_ready = True
            if not self.messages and not self.welcome_sent:
                def delayed_trigger():
                    time.sleep(0.5)
                    self._trigger_welcome_message()
                import threading
                threading.Thread(target=delayed_trigger, daemon=True).start()
        
        if rid:
            self.current_response_id = rid
            if rid in self.ignored_response_ids: return

        async def process_event():
            try:
                if self.interrupted_turn and event_name in ['response.audio.delta', 'response.audio_transcript.delta', 'response.text.done', 'response.audio_transcript.done']: return
                elif event_name == 'response.audio.delta':
                    audio_data = response.get('delta')
                    if audio_data:
                        try: self.ai_audio_buffer.extend(base64.b64decode(audio_data))
                        except: pass
                        await self.websocket.send_json({"type": "audio_response", "payload": audio_data, "role": self.role, "responseId": self.current_response_id})
                elif event_name == 'response.audio_transcript.delta':
                    text = response.get('delta')
                    if text:
                        self.full_response_text += text
                        if not hasattr(self, '_sent_role_for_turn'):
                            await self.websocket.send_json({"type": "role_switch", "payload": {"role": self.role}})
                            self._sent_role_for_turn = True
                        await self.websocket.send_json({"type": "text_response", "payload": text, "responseId": self.current_response_id})
                elif event_name == 'response.audio.done':
                    if self.ai_audio_buffer:
                        data = bytes(self.ai_audio_buffer)
                        self.ai_audio_buffer = bytearray()
                        async def upload_ai_task(d, r):
                            url = await self.upload_audio_to_cos(d, 'ai_audio')
                            if url:
                                await self.websocket.send_json({"type": "audio_url", "payload": {"url": url, "role": "assistant"}, "responseId": r})
                                if self.messages and self.messages[-1]['role'] == 'assistant':
                                    self.messages[-1]['audioUrl'] = url
                                    await save_conversation_history(self.session_id, self.user_id, self.messages, self.scenario or "General Practice")
                                else: self.last_ai_audio_url = url
                        asyncio.create_task(upload_ai_task(data, self.current_response_id))
                elif event_name in ['response.audio_transcript.done', 'response.text.done']:
                    if not self.full_response_text:
                        transcript = response.get('transcript') or response.get('text')
                        if transcript: self.full_response_text = transcript
                    clean_text = re.sub(r'```json.*?```', '', self.full_response_text, flags=re.DOTALL|re.IGNORECASE).strip()
                    clean_text = re.sub(r'\{"action":.*?\}', '', clean_text, flags=re.DOTALL|re.IGNORECASE).strip()
                    self.full_response_text = clean_text
                    if self.full_response_text:
                        msg = {"role": "assistant", "content": self.full_response_text, "timestamp": datetime.utcnow().isoformat()}
                        if self.last_ai_audio_url: msg['audioUrl'] = self.last_ai_audio_url; self.last_ai_audio_url = None
                        self.messages.append(msg)
                        await save_conversation_history(self.session_id, self.user_id, self.messages, self.scenario or "General Practice")
                    text_lower = self.full_response_text.lower()
                    if any(re.search(p, text_lower) for p in [r"\bperfect\b", r"\bexcellent\b", r"\bmission accomplished\b", r"\byou nailed it\b", r"\bcorrect!\b"]):
                        scenario_title = self.user_context.get('custom_topic', 'Unknown').split(" (Tasks:")[0].strip()
                        result = await execute_action_with_response("update_task_score", {"task": "NEXT_PENDING_TASK", "scoreDelta": 30, "feedback": "Task completed"}, self.token, self.user_id, self.session_id, context=self.user_context)
                        if result and result.get('taskCompleted'): await self.websocket.send_json({"type": "task_completed", "payload": {"task": "Task Completed"}})
                        else: await self.websocket.send_json({"type": "task_progress", "payload": {"score": result.get('newScore', 0) if result else 0}})
                    self.full_response_text = ""
                    if hasattr(self, '_sent_role_for_turn'): delattr(self, '_sent_role_for_turn')
                elif event_name == 'error': await self.websocket.send_json({"type": "error", "payload": response})
            except Exception as e: logger.error(f"Error processing event: {e}")
        asyncio.run_coroutine_threadsafe(process_event(), self.loop)

    def on_close(self, code: int, message: str) -> None:
        self.is_connected = False
        asyncio.run_coroutine_threadsafe(self.websocket.send_json({"type": "connection_closed", "payload": {"code": code, "message": message}}), self.loop)

    def on_error(self, error: Exception) -> None:
        logger.error(f"DashScope Error: {error}")
        asyncio.run_coroutine_threadsafe(self.websocket.send_json({"type": "error", "payload": {"message": str(error)}}), self.loop)

@app.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None), sessionId: str = Query(None), scenario: str = Query(None), voice: str = Query(None)):
    await websocket.accept()
    if not token or not sessionId:
        await websocket.send_json({"type": "error", "payload": {"message": "Unauthorized"}})
        await websocket.close(); return
    user_context = await get_user_context(token)
    if not user_context:
        await websocket.send_json({"type": "error", "payload": {"message": "Invalid token"}})
        await websocket.close(); return
    user_id, session_id = str(user_context.get('id')), sessionId
    if voice: user_context['voice'] = voice
    history_messages = []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{os.getenv('CONVERSATION_SERVICE_URL', 'http://localhost:8000')}/history/{session_id}")
            if resp.status_code == 200: history_messages = resp.json().get('data', {}).get('messages', [])
    except Exception as e: logger.warning(f"Failed to fetch history: {e}")
    loop = asyncio.get_running_current_loop()
    callback = WebSocketCallback(websocket, loop, user_context, token, user_id, session_id, history_messages, scenario)
    def connect_dashscope():
        conversation = OmniRealtimeConversation(model=os.getenv("QWEN3_OMNI_MODEL", "qwen3-omni-flash-realtime"), callback=callback)
        callback.conversation = conversation
        conversation.connect(); return conversation
    async def heartbeat():
        while True:
            try:
                await asyncio.sleep(15)
                await websocket.send_json({"type": "ping", "payload": {"timestamp": int(time.time())}})
                if conversation and callback and callback.is_connected: conversation.append_audio(base64.b64encode(b'\x00'*320).decode('utf-8'))
            except: break
    heartbeat_task = None
    conversation = None
    try:
        try: conversation = connect_dashscope()
        except Exception as e:
            await websocket.send_json({"type": "error", "payload": {"error": str(e)}})
            await websocket.close(); return
        heartbeat_task = asyncio.create_task(heartbeat())
        if not history_messages:
            current_topic = scenario or user_context.get('custom_topic') or "General Practice"
            await save_conversation_history(session_id, user_id, [], current_topic)
        while True:
            try:
                message = await websocket.receive_text()
                data = json.loads(message)
                msg_type, payload = data.get('type'), data.get('payload', {})
                if (not conversation or not callback.is_connected) and msg_type in ['audio_stream', 'text_message', 'input_text', 'user_audio_ended']:
                    if conversation:
                        try: conversation.close()
                        except: pass
                    conversation = connect_dashscope()
                    await asyncio.sleep(0.5)
                if msg_type == 'audio_stream':
                    audio_b64 = payload.get('audioBuffer')
                    if audio_b64:
                        if callback.is_connected:
                            conversation.append_audio(audio_b64)
                        callback.user_audio_buffer.extend(base64.b64decode(audio_b64))
                elif msg_type == 'user_audio_ended':
                    if callback.user_audio_buffer:
                        if callback.is_connected:
                            conversation.commit_audio()
                        audio_data = bytes(callback.user_audio_buffer)
                        callback.user_audio_buffer = bytearray()
                        async def upload_user_task(d):
                            url = await callback.upload_audio_to_cos(d, 'user_audio')
                            if url: callback.last_user_audio_url = url
                        asyncio.create_task(upload_user_task(audio_data))
                    if callback.is_connected:
                        conversation.create_response()
                elif msg_type in ['text_message', 'input_text']:
                    text = payload.get('text')
                    if text:
                        callback.messages.append({"role": "user", "content": text, "timestamp": datetime.utcnow().isoformat()})
                        if callback.is_connected:
                            conversation.send_raw(json.dumps({"type": "conversation.item.create", "item": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": text}]}}))
                            conversation.create_response()
                elif msg_type == 'interrupt':
                    callback.interrupted_turn = True
                    if callback.current_response_id: callback.ignored_response_ids.add(callback.current_response_id)
                    if callback.is_connected:
                        conversation.cancel_response()
            except WebSocketDisconnect: break
            except Exception as e: logger.error(f"WS error: {e}"); break
    finally:
        if heartbeat_task: heartbeat_task.cancel()
        if conversation:
            try: conversation.close()
            except: pass

@app.get("/health")
async def health_check(): return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8008)
