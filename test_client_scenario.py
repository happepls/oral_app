import websocket
import threading
import time
import json
import sys
import argparse
import requests
import uuid
import os

# Try importing audio libraries
try:
    import pyaudio
    AUDIO_AVAILABLE = True
    print("Using PyAudio for audio I/O")
except ImportError:
    AUDIO_AVAILABLE = False
    print("Warning: PyAudio not found. Installing dependencies is recommended.")

# Configuration
API_BASE = "http://localhost:8080/api"
WS_URL = "ws://localhost:8080/api/ws/"
SAMPLE_RATE = 24000 # Omni supports 24k
CHANNELS = 1
CHUNK_SIZE = 1024

class Color:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'

def register_and_login():
    timestamp = int(time.time())
    email = f"test_{timestamp}@example.com"
    username = f"Tester_{timestamp}"
    password = "password123"
    
    print(f"Attempting to register user: {email}")
    # Register
    try:
        reg_res = requests.post(f"{API_BASE}/users/register", json={
            "email": email, "password": password, "username": username
        })
        print(f"Register Response: {reg_res.status_code} - {reg_res.text}")
    except Exception as e:
        print(f"Register Exception: {e}")
        pass # Maybe already exists
        
    # Login
    print(f"Attempting to login...")
    res = requests.post(f"{API_BASE}/users/login", json={"email": email, "password": password})
    if res.status_code != 200:
        print(f"{Color.RED}Login failed: {res.status_code} {res.text}{Color.ENDC}")
        sys.exit(1)
        
    data = res.json().get('data', {})
    return data.get('token'), data.get('user', {}).get('id')

def setup_profile(token):
    requests.put(f"{API_BASE}/users/profile", 
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "native_language": "Chinese",
                    "target_language": "English",
                    "proficiency": 30,
                    "interests": "Business, Travel"
                })

def setup_goal(token):
    requests.post(f"{API_BASE}/users/goal",
                 headers={"Authorization": f"Bearer {token}"},
                 json={
                     "type": "business_meeting",
                     "description": "Practice leading a meeting",
                     "target_level": "Intermediate"
                 })

class AudioHandler:
    def __init__(self, ws):
        self.ws = ws
        self.p = pyaudio.PyAudio()
        self.recording = False
        self.keep_running = True
        self.stream_lock = threading.Lock()
        self.muted = False # Mute flag for interruption
        
        # Output Stream
        self._open_output_stream()

    def _open_output_stream(self):
        try:
            self.out_stream = self.p.open(
                format=pyaudio.paInt16,
                channels=CHANNELS,
                rate=SAMPLE_RATE,
                output=True
            )
        except Exception as e:
            print(f"Error opening output stream: {e}")
            self.out_stream = None

    def start_input_stream(self):
        """Starts the microphone capture thread."""
        def capture_loop():
            stream = self.p.open(
                format=pyaudio.paInt16,
                channels=CHANNELS,
                rate=SAMPLE_RATE,
                input=True,
                frames_per_buffer=CHUNK_SIZE
            )
            
            silence_frame = b'\x00' * (CHUNK_SIZE * 2) # 16-bit silence
            
            print(f"{Color.GREEN}[Audio] Microphone initialized.{Color.ENDC}")
            
            while self.keep_running:
                try:
                    if self.recording:
                        data = stream.read(CHUNK_SIZE, exception_on_overflow=False)
                        self.ws.send(data, opcode=websocket.ABNF.OPCODE_BINARY)
                    else:
                        # Send silence for keep-alive (reduced frequency)
                        self.ws.send(silence_frame, opcode=websocket.ABNF.OPCODE_BINARY)
                        time.sleep(2.0)
                except Exception as e:
                    if self.keep_running:
                        print(f"{Color.RED}[Audio] Error: {e}{Color.ENDC}")
                    break
            
            stream.stop_stream()
            stream.close()
            
        threading.Thread(target=capture_loop, daemon=True).start()

    def play_audio(self, data):
        """Plays received audio data."""
        if self.muted:
            return # Skip playback if muted

        with self.stream_lock:
            if self.out_stream:
                try:
                    self.out_stream.write(data)
                except Exception as e:
                    # print(f"Playback error: {e}")
                    pass

    def stop_playback(self):
        """Mutes playback to simulate stopping."""
        self.muted = True

    def reset_playback(self):
        """Unmutes playback."""
        self.muted = False

    def cleanup(self):
        self.keep_running = False
        with self.stream_lock:
            if self.out_stream:
                try:
                    self.out_stream.stop_stream()
                    self.out_stream.close()
                except:
                    pass
        self.p.terminate()

class InteractiveClient:
    def __init__(self, token, scenario):
        self.token = token
        self.scenario = scenario
        self.ws = None
        self.audio_handler = None
        self.role = None
        self.running = True
        self.is_playing = False # Track if AI is speaking
        self.interrupted_turn = False # Track if we are in an interrupted state

    def on_message(self, ws, message):
        # Binary = Audio Response
        if isinstance(message, bytes):
            if not self.interrupted_turn:
                self.is_playing = True
            if self.audio_handler:
                self.audio_handler.play_audio(message)
            return

        # Text = JSON
        try:
            data = json.loads(message)
            m_type = data.get('type')
            payload = data.get('payload')

            if m_type == 'text_response' or m_type == 'ai_response':
                if not self.interrupted_turn:
                    self.is_playing = True
                txt = payload if isinstance(payload, str) else data.get('text', '')
                print(f"{Color.YELLOW}{txt}{Color.ENDC}", end="", flush=True)
            
            elif m_type == 'response.audio.done':
                self.is_playing = False
                print("") # Newline after streaming text

            elif m_type == 'transcription':
                print(f"\r{Color.BLUE}You: {data.get('text')}{Color.ENDC}")
                
            elif m_type == 'connection_established':
                role = payload.get('role', 'Unknown')
                print(f"\n{Color.HEADER}>>> Connected. AI Role: {role} <<<{Color.ENDC}")
                print(f"{Color.GREEN}Instructions:{Color.ENDC}")
                print("1. Press [Enter] to start talking.")
                print("2. Press [Enter] again to stop talking and send (Manual Commit).")
                print("3. Press [Enter] while AI is speaking to INTERRUPT & RECORD.")
                print("4. Type 'q' and Enter to quit.")
                
            elif m_type == 'role_switch':
                print(f"\n{Color.HEADER}>>> Role Switched to: {payload.get('role')} <<<{Color.ENDC}")

        except Exception as e:
            print(f"{Color.RED}Msg Error: {e}{Color.ENDC}")

    def on_error(self, ws, error):
        print(f"{Color.RED}WS Error: {error}{Color.ENDC}")

    def on_close(self, ws, status, msg):
        print(f"{Color.HEADER}Disconnected.{Color.ENDC}")
        self.running = False

    def on_open(self, ws):
        print("WebSocket Connection Opened.")
        if AUDIO_AVAILABLE:
            self.audio_handler = AudioHandler(ws)
            self.audio_handler.start_input_stream()

    def input_loop(self):
        # Wait for connection
        while not self.ws or not self.ws.sock or not self.ws.sock.connected:
            time.sleep(0.1)
            if not self.running: return

        while self.running:
            cmd = input()
            if cmd.lower() == 'q':
                self.running = False
                self.ws.close()
                break
            
            if self.audio_handler:
                if self.is_playing:
                    # Interruption Logic
                    print(f"{Color.RED}>>> ✋ Interrupted AI. Starting Recording immediately...{Color.ENDC}")
                    self.is_playing = False
                    self.interrupted_turn = True # Flag to ignore trailing audio state updates
                    self.audio_handler.stop_playback() # Mute
                    self.ws.send(json.dumps({"type": "user_interruption"}))
                    
                    # Start Recording Immediately
                    self.audio_handler.recording = True
                elif not self.audio_handler.recording:
                    # Start Recording
                    print(f"{Color.GREEN}>>> 🔴 Recording... (Press Enter to Stop){Color.ENDC}")
                    self.audio_handler.recording = True
                    self.audio_handler.reset_playback() # Unmute for next turn
                    self.interrupted_turn = False # Reset interruption flag
                else:
                    # Stop Recording & Commit
                    print(f"{Color.BLUE}>>> ⏹️ Stopped. Sending Commit...{Color.ENDC}")
                    self.audio_handler.recording = False
                    self.audio_handler.reset_playback() # Unmute to hear response
                    self.interrupted_turn = False # Reset interruption flag
                    # Send commit signal
                    self.ws.send(json.dumps({"type": "user_audio_ended"}))

    def run(self):
        session_id = str(uuid.uuid4())
        url = f"{WS_URL}?token={self.token}&sessionId={session_id}"
        
        self.ws = websocket.WebSocketApp(url,
                                       header=[f"Authorization: Bearer {self.token}"],
                                       on_open=self.on_open,
                                       on_message=self.on_message,
                                       on_error=self.on_error,
                                       on_close=self.on_close)
        
        # Run WS in separate thread
        ws_thread = threading.Thread(target=self.ws.run_forever)
        ws_thread.daemon = True
        ws_thread.start()
        
        try:
            self.input_loop()
        except KeyboardInterrupt:
            pass
        finally:
            if self.audio_handler:
                self.audio_handler.cleanup()
            self.ws.close()
            print("Exiting...")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("scenario", choices=['info', 'goal', 'tutor', 'summary'], default='tutor')
    args = parser.parse_args()

    print("Logging in...")
    token, uid = register_and_login()
    
    # Setup context based on scenario
    if args.scenario != 'info': 
        setup_profile(token)
    if args.scenario in ['tutor', 'summary']: 
        setup_goal(token)
    
    print(f"Starting Interactive Client for scenario: {args.scenario}")
    client = InteractiveClient(token, args.scenario)
    client.run()
