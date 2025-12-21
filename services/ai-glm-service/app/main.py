import os
import json
import asyncio
import logging
import base64
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Mock Model Placeholders (Replace with Real GLM/TTS later) ---

class GlmAsrService:
    async def transcribe(self, audio_bytes: bytes) -> str:
        # TODO: Implement GLM-ASR-2512 inference
        return "This is a mock transcription from GLM-ASR."

class LlmService:
    async def chat(self, text: str) -> str:
        # TODO: Implement LLM chat
        return f"I heard you say: {text}. This is a mock response."

class TtsService:
    async def synthesize(self, text: str):
        # TODO: Implement TTS, yield audio chunks
        # Mock: yield silence
        yield b'\x00' * 1024

asr_service = GlmAsrService()
llm_service = LlmService()
tts_service = TtsService()

# --- App Lifecycle ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load models here
    logger.info("Loading GLM-ASR model...")
    # await asr_service.load()
    logger.info("Loading LLM model...")
    logger.info("Loading TTS model...")
    yield
    logger.info("Unloading models...")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routes ---

@app.get("/health")
async def health():
    return {"status": "OK", "service": "ai-glm-service"}

@app.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to GLM Service")
    
    try:
        while True:
            message = await websocket.receive_text()
            data = json.loads(message)
            msg_type = data.get('type')
            
            if msg_type == 'session_start':
                logger.info(f"Session start: {data}")
                await websocket.send_json({
                    "type": "connection_established",
                    "payload": {"message": "Connected to GLM-ASR Pipeline", "role": "OralTutor"}
                })
            
            elif msg_type == 'audio_stream':
                # Receive audio
                payload = data.get('payload', {})
                b64_audio = payload.get('audioBuffer')
                if b64_audio:
                    audio_bytes = base64.b64decode(b64_audio)
                    # TODO: Buffer and VAD
                    # For now, let's just pretend we got a full sentence every X chunks?
                    # This is hard without VAD. 
                    pass
            
            elif msg_type == 'text_message':
                 # Handle text input (easier for testing pipeline)
                 text = data.get('payload', {}).get('text')
                 if text:
                     logger.info(f"User Text: {text}")
                     
                     # 1. LLM
                     response_text = await llm_service.chat(text)
                     await websocket.send_json({
                         "type": "text_response",
                         "payload": response_text
                     })
                     
                     # 2. TTS
                     async for audio_chunk in tts_service.synthesize(response_text):
                         b64_chunk = base64.b64encode(audio_chunk).decode('utf-8')
                         await websocket.send_json({
                             "type": "audio_response",
                             "payload": b64_chunk
                         })

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"Error: {e}")
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)
