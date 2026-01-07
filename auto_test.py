import websocket
import threading
import time
import json
import sys
import requests
import uuid

# Configuration
API_BASE = "http://localhost:8080/api"
WS_URL = "ws://localhost:8080/api/ws/"

class Color:
    GREEN = '\033[92m'
    RED = '\033[91m'
    ENDC = '\033[0m'

def register_and_login():
    timestamp = int(time.time())
    email = f"auto_{timestamp}@example.com"
    username = f"AutoTest_{timestamp}"
    password = "password123"
    
    print(f"1. Registering user: {email}")
    try:
        requests.post(f"{API_BASE}/users/register", json={
            "email": email, "password": password, "username": username
        })
    except Exception as e:
        print(f"Register Exception: {e}")
        
    print(f"2. Logging in...")
    res = requests.post(f"{API_BASE}/users/login", json={"email": email, "password": password})
    if res.status_code != 200:
        print(f"{Color.RED}Login failed: {res.status_code} {res.text}{Color.ENDC}")
        sys.exit(1)
        
    data = res.json().get('data', {})
    return data.get('token'), data.get('user', {}).get('id')

def setup_profile_and_goal(token):
    print("3. Setting up Profile & Goal...")
    requests.put(f"{API_BASE}/users/profile", 
                headers={"Authorization": f"Bearer {token}"},
                json={"native_language": "Chinese", "target_language": "English", "points": 50})
    
    requests.post(f"{API_BASE}/users/goals",
                 headers={"Authorization": f"Bearer {token}"},
                 json={"type": "daily_conversation", "target_language": "English", "target_level": "Intermediate", "completion_time_days": 30})

class AutoClient:
    def __init__(self, token):
        self.token = token
        self.ws = None
        self.connected = False
        self.received_role = False
        self.received_audio_done = False
        
    def on_open(self, ws):
        print(f"{Color.GREEN}4. WebSocket Connected.{Color.ENDC}")
        self.connected = True

    def on_message(self, ws, message):
        if isinstance(message, bytes):
            # Audio received
            return

        try:
            data = json.loads(message)
            m_type = data.get('type')
            
            if m_type == 'connection_established':
                role = data.get('payload', {}).get('role')
                print(f"   > Role assigned: {role}")
                self.received_role = True
                
                # Send a text message to trigger AI response
                print("5. Sending text message: 'Hello AI'")
                ws.send(json.dumps({"type": "text_message", "payload": {"text": "Hello AI"}}))
                
            elif m_type == 'ai_response' or m_type == 'text_response':
                content = data.get('payload') or data.get('text')
                print(f"   > AI Response: {content}")
                
            elif m_type == 'response.audio.done':
                print(f"{Color.GREEN}6. AI Finished speaking.{Color.ENDC}")
                self.received_audio_done = True
                ws.close()
                
        except Exception as e:
            print(f"Msg Error: {e}")

    def on_error(self, ws, error):
        print(f"{Color.RED}WS Error: {error}{Color.ENDC}")

    def on_close(self, ws, status, msg):
        print("WS Closed.")

    def run(self):
        session_id = str(uuid.uuid4())
        url = f"{WS_URL}?token={self.token}&sessionId={session_id}"
        self.ws = websocket.WebSocketApp(url,
                                       header=[f"Authorization: Bearer {self.token}"],
                                       on_open=self.on_open,
                                       on_message=self.on_message,
                                       on_error=self.on_error,
                                       on_close=self.on_close)
        self.ws.run_forever()

if __name__ == "__main__":
    try:
        token, uid = register_and_login()
        setup_profile_and_goal(token)
        
        client = AutoClient(token)
        client.run()
        
        if client.connected and client.received_role and client.received_audio_done:
            print(f"\n{Color.GREEN}SUCCESS: Full flow verified!{Color.ENDC}")
            sys.exit(0)
        else:
            print(f"\n{Color.RED}FAILURE: Verification incomplete.{Color.ENDC}")
            sys.exit(1)
            
    except Exception as e:
        print(f"Test Exception: {e}")
        sys.exit(1)
