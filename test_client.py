import asyncio
import websockets
import json
import base64
import sys
import time
import queue

# Try importing audio dependencies
try:
    import sounddevice as sd
    import numpy as np
    AUDIO_AVAILABLE = True
except ImportError:
    AUDIO_AVAILABLE = False
    print("Warning: sounddevice and/or numpy not found. Audio features disabled.")
    print("Install with: pip install sounddevice numpy")

# Audio Config
SAMPLE_RATE = 24000
CHANNELS = 1
BLOCK_SIZE = 1024  # Size of audio chunks (samples)

# Queues for audio I/O
audio_input_queue = queue.Queue()
audio_output_queue = queue.Queue()

def audio_callback(indata, frames, time, status):
    """Callback for sounddevice input stream."""
    if status:
        print(f"Audio Input Error: {status}", file=sys.stderr)
    if AUDIO_AVAILABLE:
        # Copy data to avoid issues with buffer reuse
        audio_input_queue.put(indata.copy())

async def capture_loop(websocket):
    """Captures audio from microphone and sends it via WebSocket."""
    if not AUDIO_AVAILABLE:
        return

    print("[System] Starting microphone capture...")
    
    loop = asyncio.get_running_loop()
    
    # We need to run the blocking queue.get() in an executor or use non-blocking get
    # But sounddevice callback puts data in queue.
    
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, dtype='int16', 
                        blocksize=BLOCK_SIZE, callback=audio_callback):
        while True:
            # Non-blocking check for queue
            try:
                # Simple echo cancellation: If AI is playing, drain input queue and don't send
                if IS_PLAYING or not audio_output_queue.empty():
                    # Drain queue to avoid processing old audio later
                    while not audio_input_queue.empty():
                        audio_input_queue.get_nowait()
                    await asyncio.sleep(0.1)
                    continue

                # Get all available chunks to reduce latency
                while not audio_input_queue.empty():
                    indata = audio_input_queue.get_nowait()
                    # indata is numpy array (int16). Convert to bytes -> base64
                    pcm_bytes = indata.tobytes()
                    b64_audio = base64.b64encode(pcm_bytes).decode('utf-8')
                    
                    msg = {
                        "type": "audio_stream",
                        "payload": {
                            "audioBuffer": b64_audio
                        }
                    }
                    await websocket.send(json.dumps(msg))
                
                # Sleep a tiny bit to yield control
                await asyncio.sleep(0.01)
                
            except Exception as e:
                print(f"[Error] Audio capture error: {e}")
                break

async def play_audio_chunk(audio_data):
    """Plays a single chunk of audio."""
    if not AUDIO_AVAILABLE:
        return
    # Convert bytes to numpy array
    audio_np = np.frombuffer(audio_data, dtype=np.int16)
    sd.play(audio_np, samplerate=SAMPLE_RATE, blocking=True)

async def receive_loop(websocket):
    """Handles receiving messages from the server."""
    print("[System] Ready to receive.")
    try:
        while True:
            msg = await websocket.recv()
            data = json.loads(msg)
            msg_type = data.get('type')
            payload = data.get('payload')
            
            if msg_type == 'text_response':
                # Print text chunk immediately
                sys.stdout.write(payload)
                sys.stdout.flush()
            elif msg_type == 'transcription':
                # Print user transcription
                sys.stdout.write(f"[me]: {data.get('text')}\n")
                sys.stdout.flush()
            elif msg_type == 'audio_response':
                # Play audio
                if payload:
                    audio_data = base64.b64decode(payload)
                    # Play in a separate task/thread to not block receiving? 
                    # For simple CLI, blocking play might be okay if chunks are small, 
                    # but 'blocking=True' in sd.play will block the loop.
                    # Better to use an OutputStream or just fire and forget if sd.play handles queueing (it doesn't by default).
                    # 'sd.play' is simple but not good for streaming.
                    # We should really use an OutputStream callback.
                    if AUDIO_AVAILABLE:
                        audio_output_queue.put(audio_data)

            elif msg_type == 'connection_established':
                print(f"\n[System] Session Established: {payload.get('message')}")
            elif msg_type == 'error':
                print(f"\n[Error from Server]: {payload}")
            elif msg_type == 'ping':
                pong_msg = {"type": "pong", "payload": {"timestamp": int(time.time())}}
                await websocket.send(json.dumps(pong_msg))
    except websockets.exceptions.ConnectionClosed:
        print("\n[System] Connection closed by server.")
        raise
    except Exception as e:
        print(f"\n[Error] Receive loop error: {e}")
        raise

def output_callback(outdata, frames, time, status):
    """Callback for sounddevice output stream."""
    if status:
        print(f"Audio Output Error: {status}", file=sys.stderr)
    try:
        # Get data from queue
        # We need exactly 'frames' * CHANNELS * 2 bytes
        # This is tricky because our chunks might not match 'frames'.
        # For a simple test client, we'll try to just pull whatever is there.
        # But handling raw PCM stream correctly requires a ring buffer.
        # Simplified: Just output silence if empty.
        
        # NOTE: implementing a robust ring buffer here is complex.
        # Let's use a simpler approach for the output loop:
        # Don't use a callback stream for output in this simple script.
        # Just use sd.play() in a separate thread? No, sd.play overlaps.
        # We'll stick to the "Audio Output Worker" approach.
        outdata.fill(0) 
    except queue.Empty:
        outdata.fill(0)

IS_PLAYING = False

async def audio_playback_worker():
    """Consumes audio_output_queue and plays it."""
    global IS_PLAYING
    if not AUDIO_AVAILABLE:
        return
        
    print("[System] Audio playback worker started.")
    # We use a raw OutputStream and write to it
    stream = sd.OutputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, dtype='int16')
    stream.start()
    
    while True:
        try:
            # Non-blocking check
            if not audio_output_queue.empty():
                IS_PLAYING = True
                audio_bytes = audio_output_queue.get()
                audio_np = np.frombuffer(audio_bytes, dtype=np.int16)
                stream.write(audio_np)
            else:
                IS_PLAYING = False
                await asyncio.sleep(0.01)
        except Exception as e:
            print(f"Playback error: {e}")
            IS_PLAYING = False
            await asyncio.sleep(0.1)

async def send_loop(websocket):
    """Handles reading user input (text) and sending it."""
    # Send initial greeting
    initial_text = "Hello"
    initial_msg = {
        "type": "text_message", 
        "payload": {"text": initial_text}
    }
    await websocket.send(json.dumps(initial_msg))
    print(f"[me]: {initial_text}")
    print("-" * 50)
    print("Receiving response... (Type below to reply via text, or just speak if audio enabled)")
    
    loop = asyncio.get_running_loop()
    last_activity_time = time.time()
    
    while True:
        user_input = await loop.run_in_executor(None, sys.stdin.readline)
        user_input = user_input.strip()
        
        if not user_input:
            continue
            
        if user_input.lower() in ['quit', 'exit']:
            print("Exiting...")
            # Signal other tasks?
            sys.exit(0)
            break
            
        msg = {
            "type": "text_message",
            "payload": {"text": user_input}
        }
        try:
            await websocket.send(json.dumps(msg))
            print(f"[me]: {user_input}") # Echo user's typed input
            last_activity_time = time.time()
        except Exception as e:
            print(f"\n[Error] Failed to send: {e}")
            raise
            
        # Heartbeat logic handled in main loop implicitly by activity or separate task?
        # Let's just rely on ping/pong from receive loop or add heartbeat here.

async def test():
    uri = "ws://localhost:8080/api/ai/ws/stream"
    
    async with websockets.connect(uri) as websocket:
        print("Connected!")
        
        tasks = [
            asyncio.create_task(receive_loop(websocket)),
            asyncio.create_task(send_loop(websocket)),
        ]
        
        if AUDIO_AVAILABLE:
            tasks.append(asyncio.create_task(capture_loop(websocket)))
            tasks.append(asyncio.create_task(audio_playback_worker()))
        
        await asyncio.gather(*tasks)

if __name__ == "__main__":
    try:
        asyncio.run(test())
    except KeyboardInterrupt:
        print("\nTest stopped.")