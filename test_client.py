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

# Echo cancellation state
IS_PLAYING = False
ECHO_CANCEL_DELAY = 0.5  # Delay in seconds to wait after playback stops
last_playback_time = 0

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
    
    global IS_PLAYING, last_playback_time
    
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, dtype='int16', 
                        blocksize=BLOCK_SIZE, callback=audio_callback):
        while True:
            # Rely on send() failing to detect closure
            
            # Non-blocking check for queue
            try:
                # Improved echo cancellation: Check if we're currently playing audio or 
                # if we've played audio recently (within ECHO_CANCEL_DELAY seconds)
                current_time = time.time()
                if IS_PLAYING or (current_time - last_playback_time) < ECHO_CANCEL_DELAY:
                    # Drain input queue to avoid processing old audio later
                    while not audio_input_queue.empty():
                        try:
                            audio_input_queue.get_nowait()
                        except queue.Empty:
                            break
                    await asyncio.sleep(0.05)  # Shorter sleep for more responsive detection
                    continue

                # Get all available chunks to reduce latency
                while not audio_input_queue.empty():
                    try:
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
                    except queue.Empty:
                        break
                    except websockets.exceptions.ConnectionClosed:
                        return # Exit loop on disconnection
                
                # Sleep a tiny bit to yield control
                await asyncio.sleep(0.01)
                
            except Exception as e:
                # print(f"[Error] Audio capture error: {e}")
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
        current_role_printed = None
        while True:
            msg = await websocket.recv()
            data = json.loads(msg)
            msg_type = data.get('type')
            payload = data.get('payload')
            role = data.get('role') # Extract role from metadata

            # Print Role if changed
            if role and role != current_role_printed:
                print(f"\n[System] Current Role: {role}")
                current_role_printed = role
            
            if msg_type == 'text_response':
                # Print text chunk immediately
                sys.stdout.write(payload)
                sys.stdout.flush()
            elif msg_type == 'transcription':
                # Print user transcription
                sys.stdout.write(f"\n[me]: {data.get('text')}\n")
                sys.stdout.flush()
            elif msg_type == 'audio_response':
                # Play audio
                if payload:
                    audio_data = base64.b64decode(payload)
                    if AUDIO_AVAILABLE:
                        audio_output_queue.put(audio_data)

            elif msg_type == 'connection_established':
                print(f"\n[System] Session Established: {payload.get('message')}")
                if payload.get('role'):
                     print(f"[System] Role: {payload.get('role')}")
                     current_role_printed = payload.get('role')
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
        outdata.fill(0) 
    except queue.Empty:
        outdata.fill(0)

async def audio_playback_worker():
    """Consumes audio_output_queue and plays it."""
    global IS_PLAYING, last_playback_time
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
                last_playback_time = time.time()  # Update the last playback time
                audio_bytes = audio_output_queue.get()
                audio_np = np.frombuffer(audio_bytes, dtype=np.int16)
                stream.write(audio_np)
            else:
                # Only set IS_PLAYING to False when queue is truly empty
                # This prevents race conditions between queue checks
                if audio_output_queue.empty():
                    IS_PLAYING = False
                await asyncio.sleep(0.01)
        except Exception as e:
            print(f"Playback error: {e}")
            IS_PLAYING = False
            last_playback_time = time.time()  # Update time even on error
            await asyncio.sleep(0.1)

async def send_loop(websocket):
    """Handles reading user input (text) and sending it."""
    print("-" * 50)
    print("Receiving response... (Type below to reply via text, or just speak if audio enabled)")
    
    loop = asyncio.get_running_loop()
    
    while True:
        # Rely on send() failure to exit
        
        try:
            user_input = await loop.run_in_executor(None, sys.stdin.readline)
            user_input = user_input.strip()
            
            if not user_input:
                continue
                
            if user_input.lower() in ['quit', 'exit']:
                print("Exiting...")
                sys.exit(0)
                break
                
            msg = {
                "type": "text_message",
                "payload": {"text": user_input}
            }
            
            await websocket.send(json.dumps(msg))
            # print(f"[me]: {user_input}") # Echo user's typed input
            
        except websockets.exceptions.ConnectionClosed:
             break
        except Exception as e:
            # print(f"\n[Error] Failed to send: {e}")
            break

async def test():
    uri = "ws://localhost:8082/stream" 
    
    while True:
        try:
            print(f"Connecting to {uri}...")
            async with websockets.connect(uri) as websocket:
                print("Connected!")
                
                # Send session_start simulation
                await websocket.send(json.dumps({
                    "type": "session_start",
                    "userId": "test-user-1",
                    "sessionId": f"test-sess-{int(time.time())}",
                    "token": "mock-token"
                }))
                
                tasks = [
                    asyncio.create_task(receive_loop(websocket)),
                    asyncio.create_task(send_loop(websocket)),
                ]
                
                if AUDIO_AVAILABLE:
                    tasks.append(asyncio.create_task(capture_loop(websocket)))
                    tasks.append(asyncio.create_task(audio_playback_worker()))
                
                # Wait for any task to finish (likely receive_loop on disconnect)
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                
                for task in pending:
                    task.cancel()
                    
        except (websockets.exceptions.ConnectionClosed, ConnectionRefusedError, OSError) as e:
            print(f"\n[System] Connection lost/failed: {e}")
            print("[System] Reconnecting in 3 seconds...")
            await asyncio.sleep(3)
        except KeyboardInterrupt:
            print("\nTest stopped.")
            break
        except Exception as e:
             print(f"\n[System] Unexpected error: {e}")
             await asyncio.sleep(3)

if __name__ == "__main__":
    try:
        asyncio.run(test())
    except KeyboardInterrupt:
        print("\nTest stopped.")