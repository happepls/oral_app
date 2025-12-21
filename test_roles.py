import asyncio
import websockets
import json
import time
import requests
import sys

# Configuration
API_BASE = "http://localhost:8080/api" # Via Gateway
WS_URI = "ws://localhost:8082/stream"

# Colors
GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"
BLUE = "\033[94m"

def log(msg, color=RESET):
    print(f"{color}{msg}{RESET}")

# --- Helper: User Management ---

def create_fresh_user():
    """Registers a new user and returns (user_id, token)."""
    ts = int(time.time())
    username = f"tester_{ts}"
    email = f"tester_{ts}@example.com"
    password = "password123"
    
    # 1. Register
    reg_url = f"{API_BASE}/users/register"
    try:
        resp = requests.post(reg_url, json={
            "username": username,
            "email": email,
            "password": password
        })
        if resp.status_code != 201:
            log(f"Registration failed: {resp.text}", RED)
            return None, None
    except Exception as e:
        log(f"API Error (Register): {e}", RED)
        return None, None

    # 2. Login
    login_url = f"{API_BASE}/users/login"
    try:
        resp = requests.post(login_url, json={
            "email": email,
            "password": password
        })
        if resp.status_code != 200:
            log(f"Login failed: {resp.text}", RED)
            return None, None
        
        data = resp.json().get('data', {})
        token = data.get('token')
        user_id = data.get('user', {}).get('id')
        log(f"Created User: {username} (ID: {user_id})", GREEN)
        return user_id, token
    except Exception as e:
        log(f"API Error (Login): {e}", RED)
        return None, None

def update_user_profile(token, data):
    """Manually updates user profile via API."""
    url = f"{API_BASE}/users/profile"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.put(url, json=data, headers=headers)
    if resp.status_code == 200:
        log("Profile updated successfully via API.", BLUE)
        log(f"Update Response Data: {json.dumps(resp.json(), indent=2)}", BLUE)
        return True
    else:
        log(f"Profile update failed: {resp.text}", RED)
        return False

def set_user_goal(token, data):
    """Manually sets user goal via API."""
    url = f"{API_BASE}/users/goals"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(url, json=data, headers=headers)
    if resp.status_code == 201:
        log("Goal set successfully via API.", BLUE)
        return True
    else:
        log(f"Goal set failed: {resp.text}", RED)
        return False

# --- Helper: WebSocket Interaction ---

async def connect_and_check_role(user_id, token, expected_role):
    log(f"\n--- Testing Expectation: Role = {expected_role} ---", BLUE)
    async with websockets.connect(WS_URI) as websocket:
        # 1. Session Start
        await websocket.send(json.dumps({
            "type": "session_start",
            "userId": user_id,
            "sessionId": f"sess-{int(time.time())}",
            "token": token
        }))

        # 2. Check Welcome Message
        try:
            msg = await asyncio.wait_for(websocket.recv(), timeout=10)
            data = json.loads(msg)
            
            if data.get('type') == 'connection_established':
                payload = data.get('payload', {})
                actual_role = payload.get('role')
                
                if actual_role == expected_role:
                    log(f"SUCCESS: Role matches '{actual_role}'", GREEN)
                    return True
                else:
                    log(f"FAILURE: Expected '{expected_role}', got '{actual_role}'", RED)
                    return False
            else:
                log(f"Unexpected first message: {data}", RED)
                return False
        except asyncio.TimeoutError:
            log("Timeout waiting for welcome message.", RED)
            return False

# --- Main Test Flow ---

async def run_tests():
    # Step 1: Create User
    user_id, token = create_fresh_user()
    if not user_id: return

    # Step 2: Test InfoCollector (Default state: No Target Language)
    # Note: user-service registration might not set target_language.
    success = await connect_and_check_role(user_id, token, "InfoCollector")
    if not success: return

    # Step 3: Simulate 'Action' -> Update Profile
    # We manually update the profile to 'become' a user who has passed the Info Collection phase.
    profile_data = {
        "native_language": "English",
        "target_language": "Spanish", # Setting this should trigger transition out of InfoCollector
        "proficiency_level": "Beginner"
    }
    if not update_user_profile(token, profile_data): return

    # Step 4: Test GoalPlanner (Has Profile, No Goal)
    success = await connect_and_check_role(user_id, token, "GoalPlanner")
    if not success: return

    # Step 5: Simulate 'Action' -> Set Goal
    goal_data = {
        "target_language": "Spanish",
        "target_level": "Intermediate",
        "completion_time_days": 60,
        "interests": "Travel, Food"
    }
    if not set_user_goal(token, goal_data): return

    # Step 6: Test OralTutor (Has Profile & Goal)
    success = await connect_and_check_role(user_id, token, "OralTutor")
    if not success: return

    log("\nAll Role Transition Tests Passed!", GREEN)

if __name__ == "__main__":
    try:
        asyncio.run(run_tests())
    except KeyboardInterrupt:
        print("\nTest stopped.")
