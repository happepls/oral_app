"""
Utilities and helper functions for integration tests in the Oral AI application.

These utilities provide common functionality used across multiple test files,
including service health checks, user management, WebSocket utilities, and
test data generation.
"""

import requests
import json
import time
import websocket
import threading
import uuid
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple


class TestUtilities:
    """Collection of utility functions for integration tests"""
    
    def __init__(self, base_url: str = "http://localhost:8080/api"):
        self.base_url = base_url
        self.users_created = []
    
    def create_test_user(self, prefix: str = "test") -> Tuple[str, str, str]:
        """Create a unique test user and return email, username, password"""
        timestamp = int(time.time())
        uuid_short = str(uuid.uuid4())[:8]  # Use only first 8 chars of UUID
        
        email = f"{prefix}_{timestamp}_{uuid_short}@example.com"
        username = f"{prefix}_user_{timestamp}_{uuid_short}"
        
        # Ensure username is within 30 character limit
        if len(username) > 30:
            username = f"{prefix}_u_{timestamp}_{uuid_short}"[:30]
        
        password = "SecurePassword123!"
        
        response = requests.post(
            f"{self.base_url}/users/register",
            json={
                "email": email,
                "username": username,
                "password": password
            }
        )
        
        if response.status_code == 201:
            self.users_created.append({
                "email": email,
                "username": username,
                "password": password
            })
        
        return email, username, password
    
    def authenticate_user(self, email: str, password: str) -> Tuple[Optional[str], Optional[str]]:
        """Authenticate a user and return token and user ID"""
        response = requests.post(
            f"{self.base_url}/users/login",
            json={
                "email": email,
                "password": password
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            return data['data']['token'], data['data']['user']['id']
        
        return None, None
    
    def create_authenticated_session(self, email: str, password: str) -> Optional[Dict]:
        """Create an authenticated session with token and user info"""
        token, user_id = self.authenticate_user(email, password)
        
        if token and user_id:
            return {
                "token": token,
                "user_id": user_id,
                "headers": {"Authorization": f"Bearer {token}"}
            }
        
        return None
    
    def cleanup_users(self):
        """Clean up all created test users"""
        for user_data in self.users_created:
            try:
                # Authenticate as the user to clean up
                token, _ = self.authenticate_user(user_data['email'], user_data['password'])
                if token:
                    headers = {"Authorization": f"Bearer {token}"}
                    requests.delete(
                        f"{self.base_url}/users/profile",
                        headers=headers
                    )
            except:
                pass  # Ignore cleanup errors
    
    def check_service_health(self, service_urls: List[str]) -> Dict[str, bool]:
        """Check the health of multiple services"""
        results = {}
        for url in service_urls:
            try:
                response = requests.get(f"{url}/health", timeout=10)
                results[url] = response.status_code in [200, 404]  # 404 means service is reachable
            except:
                results[url] = False
        return results
    
    def wait_for_services(self, service_urls: List[str], timeout: int = 60) -> bool:
        """Wait for services to become available"""
        start_time = time.time()
        while time.time() - start_time < timeout:
            health_status = self.check_service_health(service_urls)
            if all(health_status.values()):
                return True
            time.sleep(2)
        return False
    
    def generate_test_profile(self) -> Dict:
        """Generate a random test user profile"""
        profiles = [
            {
                "nickname": "Language Learner",
                "native_language": "Chinese",
                "target_language": "English",
                "proficiency": 25,
                "interests": ["Travel", "Culture"]
            },
            {
                "nickname": "Business Professional",
                "native_language": "Chinese",
                "target_language": "English",
                "proficiency": 60,
                "interests": ["Business", "Negotiation"]
            },
            {
                "nickname": "Student",
                "native_language": "Chinese",
                "target_language": "Spanish",
                "proficiency": 30,
                "interests": ["Education", "Technology"]
            }
        ]
        import random
        return random.choice(profiles)
    
    def update_user_profile(self, session: Dict, profile_data: Dict) -> bool:
        """Update user profile with provided data"""
        response = requests.put(
            f"{self.base_url}/users/profile",
            headers=session['headers'],
            json=profile_data
        )
        return response.status_code == 200
    
    def create_user_goal(self, session: Dict, goal_data: Dict) -> Optional[str]:
        """Create a user learning goal and return its ID"""
        response = requests.post(
            f"{self.base_url}/users/goals",
            headers=session['headers'],
            json=goal_data
        )
        
        if response.status_code == 201:
            return response.json()['data']['id']
        return None


class WebSocketTestClient:
    """WebSocket client wrapper for testing purposes"""
    
    def __init__(self, ws_url: str, token: str, session_id: str, scenario: str = "tutor"):
        self.ws_url = ws_url
        self.token = token
        self.session_id = session_id
        self.scenario = scenario
        self.ws = None
        self.messages_received = []
        self.errors_received = []
        self.connection_established = False
        self.connection_thread = None
    
    def on_message(self, ws, message):
        """Handle incoming WebSocket messages"""
        try:
            # Try to parse as JSON first
            parsed_msg = json.loads(message)
            self.messages_received.append(parsed_msg)
        except json.JSONDecodeError:
            # If not JSON, treat as binary/audio data
            self.messages_received.append({'type': 'binary_data', 'data': message})
    
    def on_error(self, ws, error):
        """Handle WebSocket errors"""
        self.errors_received.append(str(error))
    
    def on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket close"""
        self.connection_established = False
    
    def on_open(self, ws):
        """Handle WebSocket open"""
        # Send handshake
        handshake = {
            "type": "session_start",
            "token": self.token,
            "userId": "",  # Will be filled by backend
            "sessionId": self.session_id,
            "scenario": self.scenario
        }
        ws.send(json.dumps(handshake))
        self.connection_established = True
    
    def connect(self):
        """Establish WebSocket connection"""
        self.ws = websocket.WebSocketApp(
            f"{self.ws_url}?token={self.token}&sessionId={self.session_id}&scenario={self.scenario}",
            header=[f"Authorization: Bearer {self.token}"],
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close
        )
        
        # Run WebSocket in separate thread
        self.connection_thread = threading.Thread(target=self.ws.run_forever)
        self.connection_thread.daemon = True
        self.connection_thread.start()
        
        # Wait a bit for connection to establish
        time.sleep(2)
        return self.connection_thread
    
    def send_text_message(self, text: str):
        """Send a text message via WebSocket"""
        if self.ws and self.connection_established:
            message = {
                "type": "text_message",
                "payload": {"text": text}
            }
            self.ws.send(json.dumps(message))
    
    def send_audio_data(self, audio_bytes: bytes):
        """Send audio data via WebSocket"""
        if self.ws and self.connection_established:
            self.ws.send(audio_bytes, websocket.ABNF.OPCODE_BINARY)
    
    def send_interruption(self):
        """Send user interruption signal"""
        if self.ws and self.connection_established:
            interruption_msg = {"type": "user_interruption"}
            self.ws.send(json.dumps(interruption_msg))
    
    def disconnect(self):
        """Close WebSocket connection"""
        if self.ws:
            self.ws.close()
            if self.connection_thread:
                self.connection_thread.join(timeout=5)
    
    def get_messages_by_type(self, msg_type: str):
        """Get all messages of a specific type"""
        return [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') == msg_type
        ]
    
    def wait_for_message_type(self, msg_type: str, timeout: int = 10):
        """Wait for a specific message type with timeout"""
        start_time = time.time()
        while time.time() - start_time < timeout:
            msgs = self.get_messages_by_type(msg_type)
            if len(msgs) > 0:
                return msgs
            time.sleep(0.5)
        return []


class TestDataGenerator:
    """Generate test data for various scenarios"""
    
    @staticmethod
    def generate_conversation_topics(language: str = "English") -> List[str]:
        """Generate conversation topics for testing"""
        topics = {
            "English": [
                "Introduce yourself and your hobbies",
                "Describe your daily routine",
                "Talk about your travel experiences",
                "Discuss your career goals",
                "Explain a cultural tradition from your country",
                "Debate the pros and cons of technology",
                "Describe your dream vacation",
                "Discuss environmental issues",
                "Talk about your favorite book or movie",
                "Explain how to cook your favorite dish"
            ],
            "Spanish": [
                "Habla sobre tu familia",
                "Describe tu ciudad natal",
                "Cuenta sobre tus vacaciones favoritas",
                "Explica tus pasatiempos favoritos",
                "Habla sobre tus planes para el futuro",
                "Describe una tradiciÃ³n de tu paÃ­s",
                "Debate sobre la educaciÃ³n",
                "Discute temas ambientales",
                "Cuenta sobre tu pelÃ­cula favorita",
                "Explica cÃ³mo cocinar un plato tÃ­pico"
            ]
        }
        return topics.get(language, topics["English"])
    
    @staticmethod
    def generate_grammar_exercises(language: str = "English") -> List[Dict]:
        """Generate grammar exercises for testing"""
        exercises = {
            "English": [
                {
                    "type": "tense_conjugation",
                    "prompt": "Convert the verb 'go' to past tense",
                    "expected": ["went"]
                },
                {
                    "type": "question_formation",
                    "prompt": "Form a question from 'She likes apples'",
                    "expected": ["Does she like apples?"]
                },
                {
                    "type": "vocabulary",
                    "prompt": "What is the opposite of 'happy'?",
                    "expected": ["sad", "unhappy", "miserable"]
                }
            ],
            "Spanish": [
                {
                    "type": "tense_conjugation",
                    "prompt": "Conjugate 'hablar' in first person singular present",
                    "expected": ["hablo"]
                },
                {
                    "type": "question_formation",
                    "prompt": "Forma una pregunta de 'Ã‰l estudia espaÃ±ol'",
                    "expected": ["Â¿Ã‰l estudia espaÃ±ol?", "Â¿Estudia Ã©l espaÃ±ol?"]
                },
                {
                    "type": "vocabulary",
                    "prompt": "Â¿CuÃ¡l es el opuesto de 'grande'?",
                    "expected": ["pequeÃ±o", "chico"]
                }
            ]
        }
        return exercises.get(language, exercises["English"])
    
    @staticmethod
    def generate_user_profiles(count: int = 5) -> List[Dict]:
        """Generate multiple user profiles for testing"""
        profiles = []
        for i in range(count):
            profile = {
                "nickname": f"Test User {i+1}",
                "native_language": "Chinese",
                "target_language": "English" if i % 2 == 0 else "Spanish",
                "proficiency": (i + 1) * 15,  # 15, 30, 45, 60, 75
                "interests": ["Travel", "Business", "Education"][i % 3:]
            }
            profiles.append(profile)
        return profiles


def run_health_check(base_url: str = "http://localhost:8080/api") -> bool:
    """Perform a basic health check of the system"""
    try:
        # Check API gateway
        response = requests.get(f"{base_url}/health", timeout=10)
        gateway_ok = response.status_code in [200, 404]
        
        # Check if we can access user registration
        test_email = f"health_check_{int(time.time())}@example.com"
        test_username = f"health_check_user_{int(time.time())}"
        test_password = "SecurePassword123!"
        
        register_resp = requests.post(
            f"{base_url}/users/register",
            json={
                "email": test_email,
                "username": test_username,
                "password": test_password
            }
        )
        
        registration_ok = register_resp.status_code in [201, 400]  # 400 means service is working but user exists
        
        return gateway_ok and registration_ok
    except:
        return False


# Example usage and testing
if __name__ == "__main__":
    # Example of how to use the utilities
    utils = TestUtilities()
    
    # Create a test user
    email, username, password = utils.create_test_user()
    print(f"Created user: {email}")
    
    # Authenticate
    session = utils.create_authenticated_session(email, password)
    if session:
        print("Authentication successful")
        
        # Update profile
        profile_data = utils.generate_test_profile()
        if utils.update_user_profile(session, profile_data):
            print("Profile updated successfully")
    
    # Clean up
    utils.cleanup_users()
    print("Cleanup completed")