import os
import json
import asyncio
import threading
import logging
import base64
import time
import re
from datetime import datetime
from contextlib import asynccontextmanager
from http.server import HTTPServer, BaseHTTPRequestHandler

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import uvicorn
import httpx

import dashscope
import websocket
from dashscope.audio.qwen_omni import OmniRealtimeConversation, OmniRealtimeCallback, MultiModality
from dashscope.audio.tts import SpeechSynthesizer
from fastapi.responses import Response

try:
    from app.prompt_manager import prompt_manager
except ImportError:
    try:
        from prompt_manager import prompt_manager
    except ImportError:
        pass

# Load env
load_dotenv()

# Configure logging

logging.basicConfig(level=logging.INFO)
#logging.getLogger("dashscope").setLevel(logging.DEBUG)
logger = logging.getLogger(__name__)

# Configure DashScope API Key
dashscope.api_key = os.getenv("QWEN3_OMNI_API_KEY")

class TTSRequest(BaseModel):
    text: str
    voice: str = os.getenv("QWEN3_OMNI_VOICE", "Cherry")

# --- Helper Functions ---
async def fetch_user_context(user_id: str, token: str):
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        try:
            # 1. Profile
            base_url = "http://user-service:3000"

            profile_resp = await client.get(f"{base_url}/profile", headers=headers)
            profile_data = profile_resp.json().get('data', {}).get('user', {})

            # 2. Active Goal
            goal_resp = await client.get(f"{base_url}/goals/active", headers=headers)
            goal_data = goal_resp.json().get('data', {}).get('goal') or {}

            logger.info(f"Fetched context for user {user_id}: {profile_data.get('username')}, Goal: {goal_data.get('target_language')}")
            return profile_data, goal_data
        except Exception as e:
            logger.error(f"Error fetching user context: {e}")
            return {}, {}

async def execute_action(action: str, data: dict, token: str, user_id: str = None, session_id: str = None, context: dict = None):
    headers = {"Authorization": f"Bearer {token}"}
    base_url = "http://user-service:3000"
    async with httpx.AsyncClient() as client:
        try:
            if action == "update_profile":
                await client.put(f"{base_url}/profile", json=data, headers=headers)
                logger.info(f"Updated profile: {data}")
            elif action == "set_goal":
                await client.post(f"{base_url}/goals", json=data, headers=headers)
                logger.info(f"Set goal: {data}")
            elif action == "complete_goal":
                goal_id = data.get('goal_id')
                if goal_id:
                    await client.put(f"{base_url}/goals/{goal_id}/complete", headers=headers)
                    logger.info(f"Completed goal: {goal_id}")
            elif action == "complete_task":
                task_name = data.get('task')
                scenario_title = context.get('custom_topic') if context else None
                
                # Robustly extract scenario title from "Title (Tasks: ...)" format
                if scenario_title and " (Tasks:" in scenario_title:
                     scenario_title = scenario_title.split(" (Tasks:")[0].strip()
                
                if task_name:
                    payload = {
                        "scenario": scenario_title or "Unknown", # Fallback, user-service might need to scan all
                        "task": task_name
                    }
                    url = f"{base_url}/internal/users/{user_id}/tasks/complete"
                    resp = await client.post(url, json=payload)
                    logger.info(f"Task Completion Request: {payload}, Status: {resp.status_code}, Resp: {resp.text}")
            elif action == "save_summary":
                # Prepare payload for history service
                payload = {
                    "sessionId": session_id,
                    "userId": user_id,
                    "summary": data.get("summary"),
                    "feedback": data.get("feedback"),
                    "proficiency_score_delta": data.get("proficiency_score_delta"),
                    "goalId": data.get("goalId")
                }
                logger.info(f"[Action] Trace: Saving Summary. Delta: {payload.get('proficiency_score_delta')}, Session: {session_id}")
                history_url = "http://history-analytics-service:3004/api/history/summary"
                resp = await client.post(history_url, json=payload)
                logger.info(f"Summary generated & saved: {data}, Status: {resp.status_code}")
        except Exception as e:
            logger.error(f"Error executing action {action}: {e}")

async def save_conversation_history(session_id: str, user_id: str, messages: list, topic: str = "General Practice"):
    url = "http://history-analytics-service:3004/api/history/conversation"
    payload = {
        "sessionId": session_id,
        "userId": user_id,
        "messages": messages,
        "topic": topic,
        "endTime": datetime.utcnow().isoformat()
    }
    logger.info(f"Saving history for session {session_id}, User: {user_id}, Topic: {topic}, Msgs: {len(messages)}")
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                logger.error(f"Failed to save history: {resp.status_code} {resp.text}")
            else:
                logger.info(f"Saved {len(messages)} messages to history for session {session_id}")
        except Exception as e:
            logger.error(f"Error saving history: {e}")
            import traceback
            traceback.print_exc()

async def fetch_conversation_history(session_id: str):
    url = f"http://history-analytics-service:3004/api/history/session/{session_id}"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json().get('data', {})
                # Extract messages list from the conversation object
                return data.get('messages', [])
            else:
                logger.warning(f"Failed to fetch history: {resp.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error fetching history: {e}")
            return []

# --- Health Check Server (Port 8081) ---
class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "OK", "service": "ai-omni-service-python", "aiService": {"usingRealAPI": True}}).encode())
        else:
            self.send_response(404)
            self.end_headers()

def run_health_server():
    port = int(os.getenv("HEALTH_CHECK_PORT", 8081))
    server = HTTPServer(('0.0.0.0', port), HealthCheckHandler)
    logger.info(f"Health check server running on port {port}")
    server.serve_forever()

# --- Main FastAPI App (Port 8082) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    health_thread = threading.Thread(target=run_health_server, daemon=True)
    health_thread.start()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        self.is_connected = False # Track connection state
        self.suppress_text_sending = False # Flag to hide JSON from client
        self.interrupted_turn = False # Flag to ignore interrupted responses
        self.current_response_id = None
        self.ignored_response_ids = set()
        self.messages = history_messages # Initialize with restored history
        self.user_audio_buffer = bytearray()
        self.ai_audio_buffer = bytearray()
        self.last_user_audio_url = None
        self.last_ai_audio_url = None
        logger.info(f"Assigned Role: {self.role}, Loaded History: {len(self.messages)} msgs")

    def _determine_role(self, context):
        # Handle 401 errors or empty context by defaulting to InfoCollector
        if not context or isinstance(context, str):
            return "InfoCollector"

        # Check if basic profile info exists (Native Language is key)
        if not context.get('native_language'):
            return "InfoCollector"

        # Check if active goal exists
        goal = context.get('active_goal', {})
        # If no goal or goal is empty, go to GoalPlanner
        if not goal or not goal.get('type'):
            return "GoalPlanner"

        # Check if proficiency is high (Graduation/Summary Mode)
        # Note: Proficiency is stored in the active goal
        if goal.get('current_proficiency', 0) >= 90:
            return "SummaryExpert"

        # Only switch to OralTutor if all conditions met
        return "OralTutor"

    def on_open(self) -> None:
        logger.info("DashScope Connection Open")
        self.is_connected = True
        asyncio.run_coroutine_threadsafe(
            self.websocket.send_json({
                "type": "connection_established",
                "payload": {
                    "connectionId": "python-session",
                    "message": f"Connected to Qwen3-Omni (Role: {self.role})",
                    "role": self.role
                }
            }),
            self.loop
        )
        self._update_session_prompt()

    def _update_session_prompt(self):
        if self.conversation:
            full_ctx = {**self.user_context}
            active_goal = self.user_context.get('active_goal') or {}
            
            if active_goal:
                full_ctx.update(active_goal)

            # --- Scenario & Task Injection ---
            # If a specific scenario is selected (via WS param), try to find its detailed tasks in the goal
            if self.scenario and active_goal.get('scenarios'):
                scenarios = active_goal.get('scenarios', [])
                # Simple matching by Title (or ID if we had one)
                matched_scenario = next((s for s in scenarios if s.get('title') == self.scenario), None)
                
                if matched_scenario:
                    tasks_str = ", ".join(matched_scenario.get('tasks', []))
                    # Persist to self.user_context so execute_action can access it later
                    self.user_context['custom_topic'] = f"{self.scenario} (Tasks: {tasks_str})"
                    full_ctx['custom_topic'] = self.user_context['custom_topic']
                    logger.info(f"Selected Scenario: {self.scenario}, Tasks: {tasks_str}")
                else:
                    self.user_context['custom_topic'] = self.scenario
                    full_ctx['custom_topic'] = self.scenario
            elif self.scenario:
                self.user_context['custom_topic'] = self.scenario
                full_ctx['custom_topic'] = self.scenario
            
            # --- Fallback: Use Topic from History if not in URL but restoring ---
            # If we are restoring a session but no scenario param provided, check if we have a topic in messages?
            # Ideally we rely on the client to pass the scenario/topic.
            # But let's log what we have.
            if not self.scenario and self.messages:
                 # Check if we can infer topic from DB? Not easily here.
                 # Rely on client passing scenario=... even for resume.
                 pass

            system_prompt = prompt_manager.generate_system_prompt(full_ctx, role=self.role)
            
            # --- Context Restoration: Append History ---
            # If we have history, append it to the system prompt to simulate multi-turn memory
            # for the new DashScope session.
            if self.messages:
                history_text = "\n\n# Previous Conversation Context:\n"
                # Take last 10 messages to fit context window
                recent_msgs = self.messages[-10:] 
                for msg in recent_msgs:
                    role_label = "User" if msg['role'] == 'user' else "AI"
                    content = msg.get('content', '')
                    history_text += f"{role_label}: {content}\n"
                
                system_prompt += history_text
                logger.info(f"Restored {len(recent_msgs)} messages to system prompt context.")

            logger.info(f"Sending System Prompt ({self.role}): {system_prompt[:100]}...")

            self.conversation.update_session(
                output_modalities=[MultiModality.TEXT, MultiModality.AUDIO],
                instructions=system_prompt,
                voice=os.getenv("QWEN3_OMNI_VOICE", "Cherry"),
                # Manual Mode: Disable turn detection
                enable_turn_detection=False,
            )

    async def upload_audio_to_cos(self, audio_data: bytes, audio_type: str) -> str:
        """
        Uploads audio data to media-processing-service.
        audio_type: 'user_audio' or 'ai_audio'
        Returns: Public URL of the uploaded file or None.
        """
        if not audio_data:
            return None
        
        url = "http://media-processing-service:3005/api/media/upload"
        filename = f"{self.session_id}_{int(time.time())}.pcm"
        files = {audio_type: (filename, audio_data, 'application/octet-stream')}
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, files=files, timeout=10.0)
                if resp.status_code == 200:
                    data = resp.json().get('data', {})
                    return data.get(f'{audio_type}Url')
                else:
                    logger.error(f"Failed to upload audio: {resp.status_code} {resp.text}")
                    return None
            except Exception as e:
                logger.error(f"Error uploading audio to COS: {e}")
                return None


    async def upload_audio_to_cos(self, audio_data: bytes, audio_type: str) -> str:
        """
        Uploads audio data to media-processing-service.
        audio_type: 'user_audio' or 'ai_audio'
        Returns: Public URL of the uploaded file or None.
        """
        if not audio_data:
            return None
        
        url = "http://media-processing-service:3005/api/media/upload"
        filename = f"{self.session_id}_{int(time.time())}.pcm"
        files = {audio_type: (filename, audio_data, 'application/octet-stream')}
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, files=files, timeout=10.0)
                if resp.status_code == 200:
                    data = resp.json().get('data', {})
                    return data.get(f'{audio_type}Url')
                else:
                    logger.error(f"Failed to upload audio: {resp.status_code} {resp.text}")
                    return None
            except Exception as e:
                logger.error(f"Error uploading audio to COS: {e}")
                return None


    def on_event(self, response: dict) -> None:
        event_name = response.get('type')
        payload = response
        
        # Robust Response ID Extraction
        # DashScope usually puts response_id in header.response_id or top-level request_id/id
        rid = response.get('header', {}).get('response_id') or response.get('response_id') or response.get('request_id')
        
        # Debug Log for ID
        if event_name not in ['response.audio.delta', 'response.audio_transcript.delta']: # Reduce noise for deltas
             logger.info(f"Event: {event_name}, RID: {rid}, Current: {self.current_response_id}")
        
        if rid:
            self.current_response_id = rid
            if rid in self.ignored_response_ids:
                # Silently ignore events from interrupted turns
                # logger.debug(f"Ignoring event {event_name} for ignored ID {rid}")
                return

        async def process_event():
            try:
                # Ignore events if this turn was interrupted (Legacy check + ID check fallback)
                if self.interrupted_turn and event_name in ['response.audio.delta', 'response.audio_transcript.delta', 'response.text.done', 'response.audio_transcript.done']:
                    logger.debug(f"Ignoring event {event_name} due to interruption flag")
                    return

                elif event_name == 'response.audio.delta':
                    audio_data = payload.get('delta')
                    if audio_data:
                        try:
                            audio_bytes = base64.b64decode(audio_data)
                            self.ai_audio_buffer.extend(audio_bytes)
                        except:
                            pass
                        await self.websocket.send_json({ 
                            "type": "audio_response", 
                            "payload": audio_data, 
                            "role": self.role,
                            "responseId": self.current_response_id
                        })

                elif event_name == 'response.audio_transcript.delta':
                    text = payload.get('delta')
                    if text:
                        self.full_response_text += text
                        # No suppression needed anymore!
                        
                        # Only send role with first delta or role_switch event
                        if not hasattr(self, '_sent_role_for_turn'):
                            await self.websocket.send_json({ "type": "role_switch", "payload": {"role": self.role} })
                            self._sent_role_for_turn = True
                        await self.websocket.send_json({ 
                            "type": "text_response", 
                            "payload": text,
                            "responseId": self.current_response_id
                        })

                elif event_name == 'response.audio.done':
                    if self.ai_audio_buffer:
                        audio_data = bytes(self.ai_audio_buffer)
                        self.ai_audio_buffer = bytearray()
                        
                        # Async upload
                        async def upload_ai_task(data, rid):
                            url = await self.upload_audio_to_cos(data, 'ai_audio')
                            if url:
                                logger.info(f"AI Audio Uploaded: {url}")
                                
                                # Notify Client
                                await self.websocket.send_json({
                                    "type": "audio_url",
                                    "payload": {
                                        "url": url,
                                        "role": "assistant"
                                    },
                                    "responseId": rid
                                })

                                # Correctly attach to the matching message
                                if self.messages and self.messages[-1]['role'] == 'assistant':
                                    self.messages[-1]['audioUrl'] = url
                                    await save_conversation_history(self.session_id, self.user_id, self.messages, self.scenario or "General Practice")
                                else:
                                    self.last_ai_audio_url = url
                        
                        asyncio.create_task(upload_ai_task(audio_data, self.current_response_id))

                elif event_name == 'response.audio_transcript.done' or event_name == 'response.text.done':
                    logger.info(f"AI Response Finished. Raw Length: {len(self.full_response_text)}")
                    
                    if self.interrupted_turn:
                        logger.info("Skipping action execution due to interruption")
                        self.full_response_text = ""
                        self.ai_audio_buffer = bytearray() 
                        return

                    # Clean Text (Remove JSON blocks if any slipped through)
                    # This prevents pollution of history and prompt context
                    clean_text = re.sub(r'```json.*?```', '', self.full_response_text, flags=re.DOTALL | re.IGNORECASE).strip()
                    clean_text = re.sub(r'\{"action":.*?\}', '', clean_text, flags=re.DOTALL | re.IGNORECASE).strip()
                    
                    # Update full_response_text with cleaned version for logic
                    self.full_response_text = clean_text

                    # Save AI Message to History
                    if self.full_response_text:
                        msg = {
                            "role": "assistant",
                            "content": self.full_response_text,
                            "timestamp": datetime.utcnow().isoformat()
                        }
                        if self.last_ai_audio_url:
                            msg['audioUrl'] = self.last_ai_audio_url
                            self.last_ai_audio_url = None 
                        
                        self.messages.append(msg)
                        await save_conversation_history(self.session_id, self.user_id, self.messages, self.scenario or "General Practice")

                    # --- KEYWORD SPOTTING LOGIC (New) ---
                    text_lower = self.full_response_text.lower()
                    
                    # 1. Task Completion Keywords (Strong Affirmation)
                    # Regex for exact phrase match to avoid accidental substring triggers
                    # Matches: "Perfect!", "Excellent!", "Mission Accomplished", "You nailed it"
                    # Note: We look for the word followed by punctuation or end of string for robustness
                    completion_patterns = [
                        r"\bperfect\b", 
                        r"\bexcellent\b", 
                        r"\bmission accomplished\b", 
                        r"\byou nailed it\b",
                        r"\bcorrect!\b" 
                    ]
                    
                    is_completed = any(re.search(p, text_lower) for p in completion_patterns)
                    
                    if is_completed:
                        logger.info(f"KEYWORD TRIGGER: Task Completion Detected in '{self.full_response_text[:50]}...'")
                        
                        # Infer task name from context (We don't get it from JSON anymore)
                        # We use the current focus from the context
                        current_focus = self.user_context.get('custom_topic', '')
                        # Try to extract just the task name if it's in "Scenario (Tasks: X, Y)" format
                        # Limitation: This completes the *current active scenario* context. 
                        # Ideally, we should know WHICH task. For now, we assume the AI is guiding linearly.
                        # But wait, `complete_task` API requires a task name.
                        # How do we get the SPECIFIC task name without JSON?
                        # 
                        # Strategy: 
                        # 1. We send a generic "Advance Progress" signal? No, backend needs task name.
                        # 2. We scan the user context's task list and pick the first 'pending' one?
                        #    We can't do that easily here without fetching DB again.
                        # 3. We rely on the AI mentioning the task? Unreliable.
                        # 
                        # Better Strategy:
                        # Since we are in a specific `custom_topic` which usually contains the tasks string:
                        # "Scenario (Tasks: Ask for A, Ask for B)"
                        # If we assume linear progression, we can try to complete the *next* task?
                        # OR, simply send the WHOLE string to user-service and let it figure out which one to mark?
                        # My `user-service` update allows fuzzy matching.
                        #
                        # Let's extract the raw task string from `custom_topic` and pass it.
                        # However, `custom_topic` might contain ALL tasks.
                        # 
                        # Let's fallback to: We send a special "auto_complete_next" signal?
                        # Or we revert to: The AI Prompt *must* output the task name? 
                        # No, User said NO JSON.
                        #
                        # Solution: We assume the User Service can handle a partial match or we complete the *Scenario*?
                        # Actually, looking at `user-service`, `completeTask` needs `scenario` and `task`.
                        # 
                        # Workaround: We will extract the *first* task from the prompt context's task list?
                        # No, that will always complete the first one.
                        #
                        # Let's parse `self.user_context['custom_topic']`. 
                        # If it is "Airport (Tasks: A, B, C)", we can't know which one.
                        # 
                        # Wait, the `OralTutor` prompt has `{current_focus}`.
                        # If we update `current_focus` dynamically per turn? We don't.
                        # 
                        # Let's look at the `data` payload the user wants.
                        # "Capture keywords... trigger task_completed".
                        # 
                        # If I cannot know the specific task name, I will send a special task name: "**CURRENT_FOCUS**"
                        # And update `user-service` to handle this magic string by finding the first pending task?
                        # That's a good backend change.
                        #
                        # For now, let's try to parse the AI text to see if it *quotes* the task?
                        # "Perfect! You successfully **asked for an aisle seat**."
                        # That's hard.
                        #
                        # Let's use the `custom_topic` parsing I added earlier.
                        # If `custom_topic` is "Ask for window seat", then we use that.
                        # The `GoalPlanner` sets `custom_topic` to specific tasks usually?
                        # No, usually it sets it to the Scenario Title + List.
                        #
                        # CRITICAL: In `Conversation.js` or `GoalPlanner`, do we set the topic to a SINGLE task?
                        # No.
                        #
                        # Let's assume for this refactor that `task` = "Auto-Detect" or pass the scenario title.
                        # I will modify `execute_action` to handle `task=None` implies "Complete whatever is pending in this scenario".
                        
                        # Let's pass the raw scenario title we have.
                        scenario_title = self.user_context.get('custom_topic', 'Unknown')
                        if " (Tasks:" in scenario_title:
                             scenario_title = scenario_title.split(" (Tasks:")[0].strip()

                        # Trigger Action: We send a specific flag task name
                        await execute_action("complete_task", {"task": "NEXT_PENDING_TASK"}, self.token, self.user_id, self.session_id, context=self.user_context)
                        
                        # Notify Frontend (Generic Success)
                        await self.websocket.send_json({
                            "type": "task_completed",
                            "payload": { "task": "Task Completed" } # Frontend will define what to cross out?
                        })

                    # 2. Proficiency Scoring (Sentiment)
                    delta = 0
                    if is_completed:
                        delta = 5 # Big boost for completion
                    elif re.search(r"\b(good|nice|great|well done)\b", text_lower):
                        delta = 1 # Small boost for encouragement
                    elif re.search(r"\b(try again|not quite|almost)\b", text_lower):
                        delta = -1 # Small penalty/learning opportunity
                    
                    if delta != 0:
                        # Send silent proficiency update
                        await execute_action("save_summary", {
                            "summary": "Auto-update via keyword spotting", 
                            "proficiency_score_delta": delta,
                            "feedback": "Keyword detected",
                            "goalId": self.user_context.get('active_goal', {}).get('id')
                        }, self.token, self.user_id, self.session_id, context=self.user_context)

                    self.full_response_text = "" # Reset


                elif event_name == 'conversation.item.input_audio_transcription.completed':
                    text = payload.get('transcript')
                    if text:
                        logger.info(f"User Transcription (Final): {text}")
                        
                        # Check if last message is a user placeholder
                        updated_placeholder = False
                        if self.messages and self.messages[-1]['role'] == 'user' and self.messages[-1].get('content') == '...':
                            logger.info("Updating placeholder with transcription")
                            self.messages[-1]['content'] = text
                            updated_placeholder = True
                        
                        if not updated_placeholder:
                            msg = {
                                "role": "user",
                                "content": text,
                                "timestamp": datetime.utcnow().isoformat()
                            }
                            if self.last_user_audio_url:
                                msg['audioUrl'] = self.last_user_audio_url
                                self.last_user_audio_url = None # Consume
                            
                            self.messages.append(msg)
                        
                        await save_conversation_history(self.session_id, self.user_id, self.messages, self.scenario or "General Practice")
                        await self.websocket.send_json({ "type": "transcription", "text": text, "isFinal": True })

                elif 'input' in event_name and 'transcript' in event_name:
                    text = payload.get('delta') or payload.get('text') or payload.get('transcript')
                    if text:
                        logger.debug(f"User Transcription Delta: {text}")
                        await self.websocket.send_json({ "type": "transcription", "text": text, "isFinal": False })

            except Exception as e:
                logger.error(f"Error processing event {event_name}: {e}")

        if event_name == 'error':
             logger.error(f"DashScope Error Payload: {json.dumps(payload)}")

        asyncio.run_coroutine_threadsafe(process_event(), self.loop)

    def on_close(self, close_status_code: int, close_msg: str) -> None:
        logger.info(f"DashScope Connection Closed: {close_msg}")
        self.is_connected = False
        # Notify client about closure/error
        asyncio.run_coroutine_threadsafe(
            self.websocket.send_json({"type": "info", "payload": f"Backend Connection Closed (will reconnect on input): {close_msg}"}),
            self.loop
        )

# --- Routes ---

@app.websocket("/stream")
async def websocket_endpoint(client_ws: WebSocket):
    await client_ws.accept()
    loop = asyncio.get_running_loop()

    conversation = None
    callback = None
    heartbeat_task = None

    # 1. Parse Query Params as Defaults
    query_params = client_ws.query_params
    user_id = query_params.get('userId')
    session_id = query_params.get('sessionId')
    token = query_params.get('token')
    scenario = query_params.get('scenario')
    topic = query_params.get('topic')
    
    user_context = {}
    
    # Log initial connection info
    logger.info(f"WS Connect: User={user_id}, Session={session_id}, Scenario={scenario}")

    # 2. Wait for optional session_start (Non-blocking check effectively)
    # We'll peek at the first message. If it's session_start, we update context.
    # If it's audio/other, we proceed with defaults.
    try:
        # We need to fetch context regardless, so let's try to get initial message
        # likely containing more info, OR start using defaults.
        
        # Strategy: We'll try to fetch context using defaults first to be safe
        if user_id and token:
             user_context, active_goal = await fetch_user_context(user_id, token)
             if user_context is None: user_context = {}
             user_context['active_goal'] = active_goal
             if topic: user_context['custom_topic'] = topic
        
        # Now wait for first message
        message = await client_ws.receive()
        
        start_processing_immediately = False
        initial_payload = None

        if message["type"] == "websocket.receive":
            if "text" in message:
                try:
                    init_data = json.loads(message["text"])
                    if init_data.get('type') == 'session_start':
                        # Update with explicit handshake data
                        user_id = init_data.get('userId') or user_id
                        session_id = init_data.get('sessionId') or session_id
                        token = init_data.get('token') or token
                        scenario = init_data.get('scenario') or scenario
                        topic = init_data.get('topic') or topic
                        
                        logger.info(f"Handshake received: User {user_id}, Session {session_id}")
                        
        # Re-fetch context if handshake provided new token/user
                        user_context, active_goal = await fetch_user_context(user_id, token)
                        if user_context is None: user_context = {}
                        
                        # Fallback: If user_id is still None (e.g. not in URL/Handshake), get from profile
                        if not user_id and user_context:
                            user_id = user_context.get('id') or user_context.get('userId') or user_context.get('_id')
                            logger.info(f"User ID inferred from context: {user_id}")

                        user_context['active_goal'] = active_goal
                        if topic: user_context['custom_topic'] = topic
                        
                    else:
                        # Text message but not session_start? Treat as normal input
                        start_processing_immediately = True
                        initial_payload = init_data
                except json.JSONDecodeError:
                    pass # Not JSON
            elif "bytes" in message:
                # Binary data (Audio) - Client started streaming immediately
                start_processing_immediately = True
                initial_payload = {"type": "audio_stream", "payload": {"audioBuffer": base64.b64encode(message["bytes"]).decode('utf-8')}}
        
        # Fetch History after context is settled
        history_messages = await fetch_conversation_history(session_id) if session_id else []
        logger.info(f"History loaded: {len(history_messages)} messages")

    except Exception as e:
        logger.error(f"Error during handshake: {e}")
        await client_ws.close()
        return

    def connect_dashscope():
        nonlocal conversation, callback
        callback = WebSocketCallback(client_ws, loop, user_context, token, user_id, session_id, history_messages, scenario)
        conversation = OmniRealtimeConversation(
            model=os.getenv("QWEN3_OMNI_MODEL", "qwen3-omni-flash-realtime"),
            callback=callback,
        )
        callback.conversation = conversation
        conversation.connect()
        return conversation

    async def heartbeat():
        # 10ms of 16kHz mono 16-bit PCM silence
        silence_frame = b'\x00' * 320 
        
        while True:
            try:
                await asyncio.sleep(15)
                try:
                    await client_ws.send_json({"type": "ping", "payload": {"timestamp": int(time.time())}})
                except:
                    break
                
                if conversation and callback and callback.is_connected:
                    try:
                        silence_b64 = base64.b64encode(silence_frame).decode('utf-8')
                        conversation.append_audio(silence_b64)
                    except Exception as ds_e:
                        logger.warning(f"Failed to send heartbeat to DashScope: {ds_e}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Heartbeat loop error: {e}")
                break

    try:
        conversation = connect_dashscope()
        heartbeat_task = asyncio.create_task(heartbeat())
        
        # Process the initial message if we consumed it during handshake
        if start_processing_immediately and initial_payload:
            # Inject into loop processing logic manually or just handle here?
            # It's cleaner to handle here quickly
            msg_type = initial_payload.get('type')
            if msg_type == 'audio_stream':
                 audio_b64 = initial_payload.get('payload', {}).get('audioBuffer')
                 if audio_b64:
                     conversation.append_audio(audio_b64)
                     if callback:
                         callback.user_audio_buffer.extend(base64.b64decode(audio_b64))
        
        # Trigger Welcome Message for New Sessions (if no initial input)
        elif not history_messages:
            current_topic = scenario or user_context.get('custom_topic') or "General Practice"
            logger.info(f"New Session Detected (History: {len(history_messages)}). Triggering Welcome Message for Role: {callback.role}, Topic: {current_topic}")
            
            # FORCE INITIAL SAVE to ensure persistence of Topic/Scenario
            # This allows Discovery page to find this session immediately even if the user leaves before the first message completes.
            await save_conversation_history(session_id, user_id, [], current_topic)

            welcome_instruction = "This is the start of a new session. You MUST greet the user to initiate the interaction."
            
            if callback.role == "InfoCollector":
                welcome_instruction += " Introduce yourself as their personal language goal planner and ask for their nickname."
            elif callback.role == "GoalPlanner":
                welcome_instruction += " Welcome them and mention you are ready to design their learning scenarios."
            elif callback.role == "OralTutor":
                welcome_instruction += f" Greet the user for their {user_context.get('target_language', 'language')} practice session on {current_topic}."
            
            # Use create_response to trigger the greeting
            # We add a slight delay to ensure the connection is fully ready and stable
            await asyncio.sleep(0.5)
            conversation.create_response(instructions=welcome_instruction)

        while True:
            try:
                message = await client_ws.receive_text()
                data = json.loads(message)
                msg_type = data.get('type')
                payload = data.get('payload', {})

                # Check for reconnection need on user activity
                if (not conversation or (callback and not callback.is_connected)) and msg_type in ['audio_stream', 'text_message', 'input_text', 'user_audio_ended']:
                    logger.info("Reconnecting to DashScope due to new user input...")
                    try:
                        if conversation:
                            conversation.close()
                    except:
                        pass
                    conversation = connect_dashscope()

                # Validate connection state before processing
                if not conversation:
                    logger.warning(f"Received {msg_type} but conversation not established")
                    await client_ws.send_json({"type": "error", "payload": {"error": "Conversation not established", "type": "invalid_state"}})
                    continue

                if msg_type == 'audio_stream':
                    # Debug log for audio receipt
                    # logger.info("Received audio_stream frame")
                    audio_b64 = payload.get('audioBuffer')
                    if audio_b64:
                        try:
                            # Pass base64 string to SDK (it handles decoding/sending)
                            conversation.append_audio(audio_b64)
                            
                            # Decode for our own storage/upload
                            if callback:
                                audio_bytes = base64.b64decode(audio_b64)
                                callback.user_audio_buffer.extend(audio_bytes)
                        except Exception as e:
                            logger.error(f"Failed to process audio frame: {e}")
                    else:
                        logger.warning(f"Received audio_stream but payload.audioBuffer is missing. Keys: {list(payload.keys())}")

                elif msg_type == 'text_message' or msg_type == 'input_text':
                    text = payload.get('text')
                    if text:
                        logger.info(f"User Text Message: {text}")
                        
                        # 1. Cancel any active response
                        if conversation:
                            try:
                                conversation.cancel_response()
                                await asyncio.sleep(0.1) 
                            except Exception:
                                pass

                        # 2. Check for STOP command (Deterministic Override)
                        stop_keywords = ["STOP", "QUIT", "BYE", "GOODBYE", "SUMMARIZE", "END SESSION"]
                        is_stop_command = any(k in text.upper() for k in stop_keywords)

                        if is_stop_command and callback:
                            logger.info(f"STOP command detected: {text}. Forcing summary.")
                            force_instruction = (
                                f"The user has issued a SYSTEM STOP COMMAND.\n"
                                f"1. Say goodbye.\n"
                                f"2. OUTPUT THE JSON SUMMARY BLOCK IMMEDIATELY.\n"
                            )
                            # Force update system prompt to ensure compliance
                            conversation.update_session(
                                instructions=force_instruction,
                                output_modalities=[MultiModality.TEXT, MultiModality.AUDIO]
                            )
                            # Send a "System Command" as user input to break roleplay frame
                            # We don't send this to the client, just to the LLM context
                            # The SDK append_message adds to history
                            # But we need to be careful not to mess up client history? 
                            # Client history is managed by `callback.messages`. 
                            # DashScope SDK manages its own history.
                            # We can just send `text` as usual, but prompt logic handles it.
                            
                            # Let's try explicit instruction with the text
                            conversation.create_response(instructions=force_instruction)
                        
                        elif callback:
                            # Normal flow: Update prompt with context if needed, but create_response instructions 
                            # acts as the "Turn Instructions". 
                            # We keep the original system prompt (via update_session in callback) and just send user input.
                            # But to reinforce, we can prepend system instructions to the user input wrapper.
                            
                            # Actually, let's trust the Base Prompt + User Input
                            conversation.create_response(instructions=f"User input: {text}")
                        else:
                            conversation.create_response(instructions=f"User input: {text}")

                elif msg_type == 'user_audio_ended':
                    logger.info("User Audio Ended event received")
                    if callback: 
                        callback.interrupted_turn = False
                        
                        # Upload User Audio
                        if callback.user_audio_buffer:
                            audio_data = bytes(callback.user_audio_buffer)
                            callback.user_audio_buffer = bytearray() # Reset immediately
                            
                            # Async upload task
                            async def upload_task(data):
                                url = await callback.upload_audio_to_cos(data, 'user_audio')
                                if url:
                                    logger.info(f"User Audio Uploaded: {url}")
                                    
                                    # Notify Client
                                    await client_ws.send_json({
                                        "type": "audio_url",
                                        "payload": {
                                            "url": url,
                                            "role": "user"
                                        }
                                    })

                                    callback.last_user_audio_url = url
                                    
                                    # Update logic: Only attach to the VERY LAST message if it is a USER PLACEHOLDER.
                                    # Otherwise, create a new message. This prevents overwriting history.
                                    updated = False
                                    if callback.messages and callback.messages[-1]['role'] == 'user' and callback.messages[-1].get('content') == '...':
                                         callback.messages[-1]['audioUrl'] = url
                                         updated = True
                                         logger.info("Attached audio to existing placeholder.")
                                    
                                    if not updated:
                                        # No suitable placeholder found (or last message was AI/History). Create new.
                                        logger.info("Creating new user message for audio.")
                                        msg = {
                                            "role": "user",
                                            "content": "...", # Placeholder
                                            "audioUrl": url,
                                            "timestamp": datetime.utcnow().isoformat()
                                        }
                                        callback.messages.append(msg)
                                    
                                    await save_conversation_history(session_id, user_id, callback.messages, callback.scenario or "General Practice")

                            asyncio.create_task(upload_task(audio_data))

                    conversation.create_response()

                elif msg_type == 'user_interruption':
                    logger.info("User interruption received - ignoring current response")
                    if callback: 
                        callback.interrupted_turn = True
                        if callback.current_response_id:
                            callback.ignored_response_ids.add(callback.current_response_id)
                            logger.info(f"Added response ID {callback.current_response_id} to ignore list")
                    
                    # Attempt to cancel active response on DashScope side to allow new turn
                    if conversation:
                        try:
                            # Use the correct method identified from logs
                            if hasattr(conversation, 'cancel_response'):
                                conversation.cancel_response()
                                logger.info("Called conversation.cancel_response()")
                            else:
                                logger.warning("Method cancel_response not found on conversation object")
                                
                        except Exception as e:
                            logger.error(f"Failed to cancel response: {e}")
                    pass

                elif msg_type == 'ping':
                    await client_ws.send_json({"type": "pong"})

            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON received: {e}")
                await client_ws.send_json({"type": "error", "payload": {"error": "Invalid message format", "type": "invalid_json"}})
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                err_str = str(e).lower()
                if "receive" in err_str or "disconnect" in err_str or "not connected" in err_str:
                    logger.info("Breaking loop due to connection error")
                    break
                # Don't break the loop on processing errors, just log and continue
                try:
                    await client_ws.send_json({"type": "error", "payload": {"error": "Message processing failed", "type": "processing_error"}})
                except:
                    pass # Connection likely closed

    except WebSocketDisconnect:
        logger.info("Client disconnected normally")
        # Send a clean disconnect message before closing
        try:
            await client_ws.send_json({"type": "connection_closed", "payload": {"reason": "client_disconnected"}})
        except:
            pass  # Connection already closed
    except Exception as e:
        logger.error(f"WebSocket Error: {e}")
        # Send error details to client for better reconnection handling
        try:
            await client_ws.send_json({"type": "error", "payload": {"error": str(e), "type": "connection_error"}})
        except:
            pass  # Connection already broken
    finally:
        if heartbeat_task:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
        if conversation:
            conversation.close()
        logger.info(f"WebSocket connection cleaned up for user {user_id}")

# --- TTS Endpoint ---
@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    try:
        if not request.text:
            raise HTTPException(status_code=400, detail="Text is required")

        # Use the voice mapping if necessary, or pass directly if model supports it
        # For standard DashScope TTS, we might need a specific model ID.
        # However, for Omni compatibility, we'll try to use the requested voice.
        # Note: 'Cherry' and 'Ryan' are omni-specific voice names. 
        # For standard Sambert TTS, we'll use high-quality fallbacks.
        tts_model = request.voice
        if tts_model.lower() == "cherry":
            tts_model = "sambert-zhimiao-emo-v1" # Female fallback
        elif tts_model.lower() == "ryan":
            tts_model = "sambert-zhishuo-v1"   # Male fallback

        result = SpeechSynthesizer.call(model=tts_model,
                                      text=request.text,
                                      sample_rate=24000,
                                      format='mp3')

        if result.get_audio_data() is not None:
            return Response(content=result.get_audio_data(), media_type="audio/mpeg")
        else:
             logger.error(f"TTS Error: {result}")
             raise HTTPException(status_code=500, detail="TTS generation failed")
    except Exception as e:
        logger.error(f"TTS Exception: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("AI_SERVICE_PORT", 8082))
    uvicorn.run(app, host="0.0.0.0", port=port)