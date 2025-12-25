import os
import json
import asyncio
import threading
import logging
import base64
import time
import re
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
logger = logging.getLogger(__name__)

# Configure DashScope API Key
dashscope.api_key = os.getenv("QWEN3_OMNI_API_KEY")

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

async def execute_action(action: str, data: dict, token: str, user_id: str = None, session_id: str = None):
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
                 history_url = "http://history-analytics-service:3004/api/history/summary"
                 resp = await client.post(history_url, json=payload)
                 logger.info(f"Summary generated & saved: {data}, Status: {resp.status_code}")
        except Exception as e:
            logger.error(f"Error executing action {action}: {e}")

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
    def __init__(self, websocket: WebSocket, loop: asyncio.AbstractEventLoop, user_context: dict, token: str, user_id: str, session_id: str):
        self.websocket = websocket
        self.loop = loop
        self.user_context = user_context
        self.token = token
        self.user_id = user_id
        self.session_id = session_id
        self.conversation = None 
        self.full_response_text = ""
        self.role = self._determine_role(user_context)
        logger.info(f"Assigned Role: {self.role}")

    def _determine_role(self, context):
        # Handle 401 errors by defaulting to InfoCollector
        if not context or isinstance(context, str):
            return "InfoCollector"
            
        # Check target language from goal data
        goal = context.get('active_goal', {})
        if not goal or not goal.get('target_language'):
            return "InfoCollector" if not goal else "GoalPlanner"
            
        # Only switch to OralTutor if all conditions met
        return "OralTutor"

    def on_open(self) -> None:
        logger.info("DashScope Connection Open")
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
             if self.user_context.get('active_goal'):
                 full_ctx.update(self.user_context['active_goal'])
                 
             system_prompt = prompt_manager.generate_system_prompt(full_ctx, role=self.role)
             logger.info(f"Sending System Prompt ({self.role}): {system_prompt[:100]}...")
             
             self.conversation.update_session(
                 output_modalities=[MultiModality.TEXT, MultiModality.AUDIO],
                 instructions=system_prompt,
                 voice="Cherry",
                 enable_turn_detection=True,
                 turn_detection_threshold=0.4,
                 turn_detection_silence_duration_ms=1500,
             )

    def on_event(self, response: dict) -> None:
        event_name = response.get('type')
        payload = response 
        
        async def process_event():
            try:
                if event_name == 'response.audio.delta': 
                     audio_data = payload.get('delta') 
                     if audio_data:
                         await self.websocket.send_json({ "type": "audio_response", "payload": audio_data, "role": self.role })
                         
                elif event_name == 'response.audio_transcript.delta': 
                     text = payload.get('delta') 
                     if text:
                        self.full_response_text += text
                        # Only send role with first delta or role_switch event
                        if not hasattr(self, '_sent_role_for_turn'):
                            await self.websocket.send_json({ "type": "role_switch", "payload": {"role": self.role} })
                            self._sent_role_for_turn = True
                        await self.websocket.send_json({ "type": "text_response", "payload": text })

                elif event_name == 'response.audio_transcript.done' or event_name == 'response.text.done':
                     logger.info(f"AI Response Finished: {self.full_response_text[:50]}...")
                     # Process Action
                     text = self.full_response_text
                     # Try finding JSON with backticks first, then just raw JSON object
                     json_match = re.search(r'```json\s*(\{.*?"action".*?\})\s*```', text, re.DOTALL)
                     if not json_match:
                         # Fallback: Look for a JSON block starting with { and containing "action"
                         json_match = re.search(r'(\{.*?"action".*?\})', text, re.DOTALL)

                     if json_match:
                         try:
                             json_str = json_match.group(1)
                             # Clean up potential trailing characters if regex grabbed too much
                             if json_str.count('{') == json_str.count('}'):
                                 pass
                             else:
                                 # Naive balancing (optional, but regex usually grabs greedily)
                                 pass
                                 
                             action_data = json.loads(json_str)
                             action = action_data.get('action')
                             data = action_data.get('data')
                             if action and data:
                                 logger.info(f"Detected Action: {action}")
                                 await execute_action(action, data, self.token, self.user_id, self.session_id)
                                 
                                 # Refresh Context & Role
                                 new_profile, new_goal = await fetch_user_context(self.user_id, self.token)
                                 self.user_context = new_profile
                                 self.user_context['active_goal'] = new_goal
                                 
                                 new_role = self._determine_role(self.user_context)
                                 if new_role != self.role:
                                     logger.info(f"Role Switching: {self.role} -> {new_role}")
                                     self.role = new_role
                                     self._update_session_prompt()
                                     await self.websocket.send_json({
                                         "type": "role_switch",
                                         "payload": {"role": self.role}
                                     })

                         except json.JSONDecodeError:
                             logger.error("Failed to decode JSON action block")
                     
                     self.full_response_text = "" # Reset

                elif event_name == 'conversation.item.input_audio_transcription.completed':
                     text = payload.get('transcript')
                     if text:
                         logger.info(f"User Transcription (Final): {text}")
                         await self.websocket.send_json({ "type": "transcription", "text": text })

                elif 'input' in event_name and 'transcript' in event_name:
                     text = payload.get('delta') or payload.get('text') or payload.get('transcript')
                     if text:
                         logger.debug(f"User Transcription Delta: {text}")
                         await self.websocket.send_json({ "type": "transcription", "text": text })

            except Exception as e:
                logger.error(f"Error processing event {event_name}: {e}")

        asyncio.run_coroutine_threadsafe(process_event(), self.loop)

    def on_close(self, close_status_code: int, close_msg: str) -> None:
        logger.info(f"DashScope Connection Closed: {close_msg}")
        # Notify client about closure/error
        asyncio.run_coroutine_threadsafe(
             self.websocket.send_json({"type": "error", "payload": f"Backend Connection Closed: {close_msg}"}),
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
    
    # State
    user_id = None
    session_id = None
    token = None
    user_context = {}
    
    # Wait for session_start
    try:
        init_msg = await client_ws.receive_text()
        init_data = json.loads(init_msg)
        if init_data.get('type') == 'session_start':
            user_id = init_data.get('userId')
            session_id = init_data.get('sessionId')
            token = init_data.get('token')
            logger.info(f"Session Start: User {user_id}, Session {session_id}")
            
            # Fetch Context
            profile, goal = await fetch_user_context(user_id, token)
            user_context = profile
            user_context['active_goal'] = goal
            
        else:
            logger.warning("Expected session_start message first")
            pass
            
    except Exception as e:
        logger.error(f"Error awaiting session start: {e}")
        await client_ws.close()
        return

    def connect_dashscope():
        nonlocal conversation, callback
        callback = WebSocketCallback(client_ws, loop, user_context, token, user_id, session_id)
        conversation = OmniRealtimeConversation(
            model=os.getenv("QWEN3_OMNI_MODEL", "qwen3-omni-flash-realtime"),
            callback=callback,
        )
        callback.conversation = conversation
        conversation.connect()
        return conversation

    async def heartbeat():
        while True:
            try:
                await asyncio.sleep(20)
                await client_ws.send_json({"type": "ping", "payload": {"timestamp": int(time.time())}})
            except:
                break

    try:
        conversation = connect_dashscope()
        heartbeat_task = asyncio.create_task(heartbeat())
        
        while True:
            try:
                message = await client_ws.receive_text()
                data = json.loads(message)
                msg_type = data.get('type')
                payload = data.get('payload', {})
                
                # Validate connection state before processing
                if not conversation:
                    logger.warning(f"Received {msg_type} but conversation not established")
                    await client_ws.send_json({"type": "error", "payload": {"error": "Conversation not established", "type": "invalid_state"}})
                    continue
                
                if msg_type == 'audio_stream':
                    audio_b64 = payload.get('audioBuffer')
                    if audio_b64:
                        # logger.debug(f"Received audio buffer: {len(audio_b64)} bytes")
                        conversation.append_audio(audio_b64)
                
                elif msg_type == 'text_message':
                    text = payload.get('text')
                    if text:
                        logger.info(f"User Text Message: {text}")
                        conversation.create_response(instructions=f"User said: {text}")

                elif msg_type == 'user_audio_ended':
                    logger.info("User Audio Ended event received")
                    conversation.create_response()
                
                elif msg_type == 'user_interruption':
                    logger.info("User interruption received - stopping current response")
                    # Clear any ongoing response and reset the conversation state
                    conversation.create_response(instructions="User interrupted. Please stop your current response and wait for their next input.")
                        
                elif msg_type == 'ping':
                    await client_ws.send_json({"type": "pong"})
                    
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON received: {e}")
                await client_ws.send_json({"type": "error", "payload": {"error": "Invalid message format", "type": "invalid_json"}})
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                if "receive" in str(e).lower() or "disconnect" in str(e).lower():
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

if __name__ == "__main__":
    port = int(os.getenv("AI_SERVICE_PORT", 8082))
    uvicorn.run(app, host="0.0.0.0", port=port)