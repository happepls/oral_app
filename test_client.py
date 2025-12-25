import asyncio
import websockets
import json
import base64
import sys
import time
import queue
import threading

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
ECHO_CANCEL_DELAY = 0.8  # Increased delay to 0.8 seconds after playback stops
last_playback_time = 0

# Voice Activity Detection (VAD) parameters
VAD_THRESHOLD = 0.2  # RMS energy threshold for voice detection（已调高，需根据实际环境微调）
MIN_VOICE_DURATION = 0.3  # Minimum voice duration to trigger interruption (seconds)
voice_start_time = None
is_voice_detected = False

# Environment-specific tuning parameters
# You may need to adjust these based on your microphone sensitivity and room acoustics:
# - Increase VAD_THRESHOLD if your microphone picks up too much background noise
# - Increase ECHO_CANCEL_DELAY if you still get echo interference
# - Increase MIN_VOICE_DURATION if brief sounds trigger interruptions

# Connection and role management
websocket_connection = None
current_role = None
connection_active = False
reconnect_attempts = 0
MAX_RECONNECT_ATTEMPTS = 10

def calculate_audio_energy(audio_data):
    """Calculate RMS energy of audio data for voice activity detection."""
    if len(audio_data) == 0:
        return 0.0
    # Convert to float and calculate RMS
    audio_float = audio_data.astype(np.float32)
    rms = np.sqrt(np.mean(audio_float**2))
    return rms

def audio_callback(indata, frames, time_info, status):
    """Callback for sounddevice input stream."""
    if status:
        print(f"Audio Input Error: {status}", file=sys.stderr)
    
    # 只在能量超过阈值时入队，防止AI回声被误判为人声
    audio_energy = calculate_audio_energy(indata)
    if audio_energy > VAD_THRESHOLD:
        audio_input_queue.put(indata.copy())

async def capture_loop(websocket):
    """Captures audio from microphone and sends it via WebSocket. Mutes mic during playback to prevent echo."""
    if not AUDIO_AVAILABLE:
        return

    print("[System] Starting microphone capture...")
    
    global IS_PLAYING, last_playback_time, connection_active
    
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, dtype='int16', 
                        blocksize=BLOCK_SIZE, callback=audio_callback):
        while connection_active:
            try:
                current_time = time.time()
                
                # STRICT MUTE LOGIC: If AI is playing (or recently stopped), drop all audio input
                # This prevents "self-talking" / echo, but also disables voice interruption during playback.
                if IS_PLAYING or (current_time - last_playback_time < ECHO_CANCEL_DELAY):
                    # Drain the queue to discard audio captured during playback
                    while not audio_input_queue.empty():
                        try:
                            audio_input_queue.get_nowait()
                        except queue.Empty:
                            break
                    await asyncio.sleep(0.01)
                    continue

                # Process user audio input (normal flow)
                while not audio_input_queue.empty() and connection_active:
                    try:
                        indata = audio_input_queue.get_nowait()
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
                        print("[System] WebSocket closed during audio send.")
                        connection_active = False
                        return
                    except Exception as e:
                         print(f"[Error] Audio send error: {e}")
                         break
                
                await asyncio.sleep(0.01)
                
            except Exception as e:
                print(f"[Error] Audio capture error: {e}")
                break
    
    print("[System] Audio capture stopped.")
    await asyncio.Future()

async def play_audio_chunk(audio_data):
    """Plays a single chunk of audio."""
    if not AUDIO_AVAILABLE:
        return
    # Convert bytes to numpy array
    audio_np = np.frombuffer(audio_data, dtype=np.int16)
    sd.play(audio_np, samplerate=SAMPLE_RATE, blocking=True)

async def receive_loop(websocket):
    """Handles receiving messages from the server with improved role tracking and error handling."""
    global current_role, connection_active
    last_printed_role = None # Track the last role we printed to avoid repetition
    
    print("[System] Ready to receive.")
    try:
        while connection_active:
            try:
                msg = await websocket.recv()
            except websockets.exceptions.ConnectionClosed:
                 print("\n[System] Connection closed by server (recv).")
                 connection_active = False
                 raise # Propagate to trigger reconnection
            
            try:
                # Ensure message is properly parsed as JSON
                if isinstance(msg, str):
                    data = json.loads(msg)
                elif isinstance(msg, dict):
                    data = msg
                else:
                    print(f"[Error] Unexpected message format: {type(msg)}")
                    continue
                
                msg_type = data.get('type')
                payload = data.get('payload')
                role = data.get('role') # Extract role from metadata
            except Exception as e:
                print(f"[Error] Failed to parse message: {e}")
                continue

            # Update role state (but don't print banner yet, wait for explicit events or first text)
            if role and role != current_role:
                current_role = role
            
            if msg_type == 'text_response':
                # Only print role label if it changed since last print
                if current_role and current_role != last_printed_role:
                    sys.stdout.write(f"\n[{current_role}]: ")
                    last_printed_role = current_role
                
                sys.stdout.write(payload)
                sys.stdout.flush()
                
            elif msg_type == 'transcription':
                # Print user transcription
                sys.stdout.write(f"\n[User]: {data.get('text')}\n")
                sys.stdout.flush()
                # Reset last_printed_role so AI role prints again next time
                last_printed_role = None 
                
            elif msg_type == 'audio_response':
                # Play audio
                if payload:
                    audio_data = base64.b64decode(payload)
                    if AUDIO_AVAILABLE:
                        audio_output_queue.put(audio_data)

            elif msg_type == 'connection_established':
                print(f"\n[System] Session Established: {payload.get('message')}")
                if payload.get('role'):
                    current_role = payload.get('role')
                    print(f"[System] Starting Role: {current_role}")

            elif msg_type == 'role_switch':
                new_role = payload.get('role')
                if isinstance(new_role, dict):
                     new_role = new_role.get('role')
                     
                current_role = new_role
                last_printed_role = None # Force reprint of label on next text
                
                print(f"\n{'='*60}")
                print(f"[SYSTEM] ROLE SWITCHED TO: {str(new_role).upper()}")
                if new_role == 'InfoCollector':
                    print("[SYSTEM] Gathering information about your learning needs...")
                elif new_role == 'GoalPlanner':
                    print("[SYSTEM] Planning your learning goals...")
                elif new_role == 'OralTutor':
                    print("[SYSTEM] Starting oral practice session...")
                print(f"{'='*60}\n")

            elif msg_type == 'error':
                print(f"\n[Error from Server]: {payload}")
                # Server indicates a processing error (likely upstream issue), so we should reconnect
                raise websockets.exceptions.ConnectionClosed(1011, "Server Error")
                
            elif msg_type == 'ping':
                pong_msg = {"type": "pong", "payload": {"timestamp": int(time.time())}}
                await websocket.send(json.dumps(pong_msg))
    except websockets.exceptions.ConnectionClosed:
        print("\n[System] Connection closed (outer loop).")
        connection_active = False
        raise
    except Exception as e:
        print(f"\n[Error] Receive loop error: {e}")
        connection_active = False
        raise

def output_callback(outdata, frames, time, status):
    """Callback for sounddevice output stream."""
    if status:
        print(f"Audio Output Error: {status}", file=sys.stderr)
    try:
        outdata.fill(0) 
    except queue.Empty:
        outdata.fill(0)

def playback_thread_func():
    """Consumes audio_output_queue and plays it in a separate thread to avoid blocking asyncio loop."""
    global IS_PLAYING, last_playback_time, voice_start_time, is_voice_detected
    if not AUDIO_AVAILABLE:
        return
        
    print("[System] Audio playback thread started.")
    # We use a raw OutputStream and write to it
    try:
        with sd.OutputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, dtype='int16') as stream:
            while True:
                try:
                    # Blocking get with timeout to allow checking for exit conditions if needed
                    audio_bytes = audio_output_queue.get(timeout=0.1)
                    
                    # Reset voice tracking when AI starts speaking
                    voice_start_time = None
                    is_voice_detected = False
                    
                    IS_PLAYING = True
                    last_playback_time = time.time()
                    
                    audio_np = np.frombuffer(audio_bytes, dtype=np.int16)
                    stream.write(audio_np) # Blocking call, safe here in thread
                    
                except queue.Empty:
                    IS_PLAYING = False
                except Exception as e:
                    print(f"Playback error: {e}")
                    IS_PLAYING = False
                    time.sleep(0.1)
    except Exception as e:
        print(f"[Error] Audio stream failed: {e}")

async def send_loop(websocket):
    """Handles reading user input (text) and sending it with interruption support."""
    global connection_active
    print("-" * 60)
    print("Commands: 'quit'/'exit' to stop, 'interrupt' to stop AI response")
    print("Type messages below or speak if audio is enabled...")
    print("-" * 60)
    
    loop = asyncio.get_running_loop()
    
    while connection_active:
        try:
            # Use run_in_executor to avoid blocking the event loop with stdin reading
            user_input = await loop.run_in_executor(None, sys.stdin.readline)
            user_input = user_input.strip()
            
            if not user_input:
                continue
                
            if user_input.lower() in ['quit', 'exit']:
                print("[System] Exiting...")
                connection_active = False
                break
            elif user_input.lower() == 'interrupt':
                print("[System] Sending interruption signal...")
                # Send interruption signal
                interrupt_msg = {
                    "type": "user_interruption",
                    "payload": {"timestamp": int(time.time())}
                }
                try:
                    await websocket.send(json.dumps(interrupt_msg))
                    # Clear local audio output queue
                    while not audio_output_queue.empty():
                        try:
                            audio_output_queue.get_nowait()
                        except queue.Empty:
                            break
                    print("[System] Interruption sent and audio cleared.")
                except websockets.exceptions.ConnectionClosed:
                    connection_active = False
                    break
                continue
                
            msg = {
                "type": "text_message",
                "payload": {"text": user_input}
            }
            
            await websocket.send(json.dumps(msg))
            
        except websockets.exceptions.ConnectionClosed:
            connection_active = False
            break
        except Exception as e:
            print(f"[Error] Failed to send: {e}")
            connection_active = False
            break

async def test():
    """Main test function with improved reconnection logic."""
    uri = "ws://localhost:8082/stream" 
    global connection_active, reconnect_attempts, current_role
    
    # Persist session ID across reconnections
    current_session_id = f"test-sess-{int(time.time())}"
    print(f"[System] Session ID: {current_session_id}")

    # Start playback thread once
    if AUDIO_AVAILABLE:
        pb_thread = threading.Thread(target=playback_thread_func, daemon=True)
        pb_thread.start()
    
    while reconnect_attempts < MAX_RECONNECT_ATTEMPTS:
        try:
            print(f"\n[System] Connecting to {uri} (attempt {reconnect_attempts + 1}/{MAX_RECONNECT_ATTEMPTS})...")
            async with websockets.connect(uri) as websocket:
                global websocket_connection
                websocket_connection = websocket
                connection_active = True
                reconnect_attempts = 0  # Reset on successful connection
                current_role = None   # Reset role on new connection
                
                print("[System] Connected successfully!")
                
                # Send session_start simulation
                await websocket.send(json.dumps({
                    "type": "session_start",
                    "userId": "test-user-1",
                    "sessionId": current_session_id,
                    "token": "mock-token"
                }))
                
                # Create all tasks
                tasks = []
                tasks.append(asyncio.create_task(receive_loop(websocket)))
                tasks.append(asyncio.create_task(send_loop(websocket)))
                
                if AUDIO_AVAILABLE:
                    tasks.append(asyncio.create_task(capture_loop(websocket)))
                    # Playback is now in a separate thread
                
                try:
                    # Wait for any critical task to complete or fail
                    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    
                    # Handle completed tasks
                    for task in done:
                        try:
                            task.result()  # This will raise if task failed
                        except Exception as e:
                            print(f"[System] Task failed: {e}")
                            # Force reconnection state
                            connection_active = False
                            websocket_connection = None
                            raise e # Re-raise to trigger outer loop catch
                    
                    # Cancel remaining tasks
                    for task in pending:
                        task.cancel()
                    
                except asyncio.CancelledError:
                    print("[System] Connection cancelled.")
                    break
                
                # Connection lost, prepare for reconnection
                connection_active = False
                websocket_connection = None
                
                if reconnect_attempts == 0:
                    print("\n[System] Connection lost. Attempting to reconnect...")
                
        except (websockets.exceptions.ConnectionClosed, ConnectionRefusedError, OSError) as e:
            reconnect_attempts += 1
            if reconnect_attempts < MAX_RECONNECT_ATTEMPTS:
                wait_time = min(2 ** reconnect_attempts, 30)  # Exponential backoff, max 30s
                print(f"\n[System] Connection failed: {e}")
                print(f"[System] Retrying in {wait_time} seconds... (attempt {reconnect_attempts}/{MAX_RECONNECT_ATTEMPTS})")
                await asyncio.sleep(wait_time)
            else:
                print(f"\n[System] Max reconnection attempts ({MAX_RECONNECT_ATTEMPTS}) reached. Giving up.")
                break
                
        except KeyboardInterrupt:
            print("\n[System] Test stopped by user.")
            break
        except Exception as e:
            reconnect_attempts += 1
            print(f"\n[System] Unexpected error: {e}")
            if reconnect_attempts < MAX_RECONNECT_ATTEMPTS:
                print(f"[System] Retrying in 5 seconds... (attempt {reconnect_attempts}/{MAX_RECONNECT_ATTEMPTS})")
                await asyncio.sleep(5)
            else:
                print(f"\n[System] Max reconnection attempts reached. Giving up.")
                break
    
    print("\n[System] Test completed.")

if __name__ == "__main__":
    try:
        asyncio.run(test())
    except KeyboardInterrupt:
        print("\nTest stopped.")