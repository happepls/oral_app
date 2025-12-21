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
        
        # Determine Role based on context
        self.role = "OralTutor"
        if not user_context.get('target_language'):
            self.role = "InfoCollector"
        elif not user_context.get('active_goal'):
            self.role = "GoalPlanner"
        
        logger.info(f"Assigned Role: {self.role}")

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
                        await self.websocket.send_json({ "type": "text_response", "payload": text, "role": self.role })

                elif event_name == 'response.audio_transcript.done' or event_name == 'response.text.done':
                     # Process Action
                     text = self.full_response_text
                     json_match = re.search(r'```json\s*(\{.*?\})\s*```', text, re.DOTALL)
                     if json_match:
                         try:
                             json_str = json_match.group(1)
                             action_data = json.loads(json_str)
                             action = action_data.get('action')
                             data = action_data.get('data')
                             if action and data:
                                 logger.info(f"Detected Action: {action}")
                                 await execute_action(action, data, self.token, self.user_id, self.session_id)
                         except json.JSONDecodeError:
                             logger.error("Failed to decode JSON action block")
                     
                     self.full_response_text = "" # Reset

                elif event_name == 'conversation.item.input_audio_transcription.completed':
                     text = payload.get('transcript')
                     if text:
                         await self.websocket.send_json({ "type": "transcription", "text": text })

                elif 'input' in event_name and 'transcript' in event_name:
                     text = payload.get('delta') or payload.get('text') or payload.get('transcript')
                     if text:
                         await self.websocket.send_json({ "type": "transcription", "text": text })

            except Exception as e:
                logger.error(f"Error processing event: {e}")

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
            message = await client_ws.receive_text()
            data = json.loads(message)
            msg_type = data.get('type')
            payload = data.get('payload', {})
            
            if msg_type == 'audio_stream':
                audio_b64 = payload.get('audioBuffer')
                if audio_b64 and conversation:
                    conversation.append_audio(audio_b64)
            
            elif msg_type == 'text_message':
                text = payload.get('text')
                if text and conversation:
                    conversation.create_response(instructions=f"User said: {text}")

            elif msg_type == 'user_audio_ended' and conversation:
                conversation.create_response()
                    
            elif msg_type == 'ping':
                await client_ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket Error: {e}")
    finally:
        if heartbeat_task: heartbeat_task.cancel()
        if conversation: conversation.close()

if __name__ == "__main__":
    port = int(os.getenv("AI_SERVICE_PORT", 8082))
    uvicorn.run(app, host="0.0.0.0", port=port)