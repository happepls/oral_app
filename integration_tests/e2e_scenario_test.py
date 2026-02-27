"""
End-to-end integration tests for complete user scenarios in the Oral AI application.

These tests simulate complete user journeys from registration to conversation completion,
validating the entire flow across all microservices.
"""

import unittest
import requests
import json
import time
import websocket
import threading
import uuid


class EndToEndScenarioIntegrationTest(unittest.TestCase):
    """End-to-end integration tests for complete user scenarios"""
    
    def setUp(self):
        """Set up test fixtures before each test method"""
        self.api_base = "http://localhost:8080/api"
        self.ws_url = "ws://localhost:8080/api/ws"
        self.email = f"e2e_test_{int(time.time())}@example.com"
        self.username = f"e2e_test_user_{int(time.time())}"
        self.password = "SecurePassword123!"
        self.token = None
        self.user_id = None
        self.session_id = str(uuid.uuid4())
        self.messages_received = []
        self.ws = None
    
    def tearDown(self):
        """Clean up after each test method"""
        if self.ws:
            self.ws.close()
        
        # Clean up created user if needed
        if hasattr(self, 'token') and self.token:
            try:
                headers = {"Authorization": f"Bearer {self.token}"}
                response = requests.delete(
                    f"{self.api_base}/users/profile",
                    headers=headers
                )
            except:
                pass  # Ignore cleanup errors
    
    def register_and_login_user(self):
        """Helper method to register and login a user"""
        # Register user
        register_resp = requests.post(
            f"{self.api_base}/users/register",
            json={
                "email": self.email,
                "username": self.username,
                "password": self.password
            }
        )
        self.assertEqual(register_resp.status_code, 201)
        
        # Login user
        login_resp = requests.post(
            f"{self.api_base}/users/login",
            json={
                "email": self.email,
                "password": self.password
            }
        )
        self.assertEqual(login_resp.status_code, 200)
        
        data = login_resp.json()
        self.token = data['data']['token']
        self.user_id = data['data']['user']['id']
        self.assertIsNotNone(self.token)
    
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
        pass
    
    def on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket close"""
        pass
    
    def on_open(self, ws):
        """Handle WebSocket open"""
        # Send handshake
        handshake = {
            "type": "session_start",
            "token": self.token,
            "userId": self.user_id,
            "sessionId": self.session_id,
            "scenario": "tutor"
        }
        ws.send(json.dumps(handshake))
    
    def connect_websocket(self):
        """Establish WebSocket connection"""
        self.ws = websocket.WebSocketApp(
            f"{self.ws_url}?token={self.token}&sessionId={self.session_id}&scenario=tutor",
            header=[f"Authorization: Bearer {self.token}"],
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close
        )
        
        # Run WebSocket in separate thread
        ws_thread = threading.Thread(target=self.ws.run_forever)
        ws_thread.daemon = True
        ws_thread.start()
        
        # Wait a bit for connection to establish
        time.sleep(2)
        return ws_thread
    
    def complete_user_onboarding_flow(self):
        """Complete the full user onboarding flow"""
        # 1. Register user
        register_resp = requests.post(
            f"{self.api_base}/users/register",
            json={
                "email": self.email,
                "username": self.username,
                "password": self.password
            }
        )
        self.assertEqual(register_resp.status_code, 201)
        
        # 2. Login user
        login_resp = requests.post(
            f"{self.api_base}/users/login",
            json={
                "email": self.email,
                "password": self.password
            }
        )
        self.assertEqual(login_resp.status_code, 200)
        
        data = login_resp.json()
        self.token = data['data']['token']
        self.user_id = data['data']['user']['id']
        self.assertIsNotNone(self.token)
        
        # 3. Update profile
        headers = {"Authorization": f"Bearer {self.token}"}
        profile_update = {
            "nickname": "E2E Test User",
            "native_language": "Chinese",
            "target_language": "English",
            "proficiency": 25,
            "interests": ["Travel", "Business"]
        }
        
        update_resp = requests.put(
            f"{self.api_base}/users/profile",
            headers=headers,
            json=profile_update
        )
        self.assertEqual(update_resp.status_code, 200)
        
        # 4. Set a learning goal
        goal_resp = requests.post(
            f"{self.api_base}/users/goals",
            headers=headers,
            json={
                "type": "business_meeting",
                "description": "Practice leading a meeting",
                "target_level": "Intermediate",
                "target_language": "English",
                "current_proficiency": 25
            }
        )
        self.assertEqual(goal_resp.status_code, 201)
    
    def test_complete_learning_session_flow(self):
        """Test complete flow: registration → profile setup → conversation → history"""
        # Complete onboarding
        self.complete_user_onboarding_flow()
        
        # Start a conversation
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Engage in a learning session
        conversation_steps = [
            {"type": "text_message", "payload": {"text": "Hello! I'd like to practice English."}},
            {"type": "text_message", "payload": {"text": "Can we work on business vocabulary?"}},
            {"type": "text_message", "payload": {"text": "How do I say 'schedule a meeting' in English?"}},
            {"type": "text_message", "payload": {"text": "What's the difference between 'meeting' and 'appointment'?"}},
            {"type": "text_message", "payload": {"text": "Thank you for your help today!"}},
            {"type": "text_message", "payload": {"text": "Goodbye!"}}
        ]
        
        for step in conversation_steps:
            self.ws.send(json.dumps(step))
            time.sleep(4)  # Wait for AI response
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Verify conversation was saved
        headers = {"Authorization": f"Bearer {self.token}"}
        conv_response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers
        )
        
        self.assertEqual(conv_response.status_code, 200)
        data = conv_response.json()
        self.assertIn('data', data)
        
        conversations = data['data']
        self.assertGreater(len(conversations), 0)
        
        # Check that the conversation contains our messages
        latest_conv = max(conversations, key=lambda x: x.get('createdAt', ''))
        self.assertGreater(len(latest_conv['messages']), 0)
        
        # Verify that user messages are present
        user_messages = [msg for msg in latest_conv['messages'] if msg['sender'] == 'user']
        self.assertGreater(len(user_messages), 0)
    
    def test_proficiency_progression_flow(self):
        """Test flow that demonstrates proficiency progression"""
        # Complete onboarding with low proficiency
        register_resp = requests.post(
            f"{self.api_base}/users/register",
            json={
                "email": self.email,
                "username": self.username,
                "password": self.password
            }
        )
        self.assertEqual(register_resp.status_code, 201)
        
        login_resp = requests.post(
            f"{self.api_base}/users/login",
            json={
                "email": self.email,
                "password": self.password
            }
        )
        self.assertEqual(login_resp.status_code, 200)
        
        data = login_resp.json()
        self.token = data['data']['token']
        self.user_id = data['data']['user']['id']
        
        # Set initial low proficiency
        headers = {"Authorization": f"Bearer {self.token}"}
        profile_update = {
            "nickname": "Progression Test User",
            "native_language": "Chinese",
            "target_language": "English",
            "proficiency": 15,  # Low proficiency
            "interests": ["Education"]
        }
        
        update_resp = requests.put(
            f"{self.api_base}/users/profile",
            headers=headers,
            json=profile_update
        )
        self.assertEqual(update_resp.status_code, 200)
        
        # Start a conversation
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Engage in practice that should improve proficiency
        practice_messages = [
            {"type": "text_message", "payload": {"text": "I want to improve my English skills."}},
            {"type": "text_message", "payload": {"text": "Can we practice forming questions?"}},
            {"type": "text_message", "payload": {"text": "How do I ask for directions?"}},
            {"type": "text_message", "payload": {"text": "What's the past tense of 'go'?"}},
            {"type": "text_message", "payload": {"text": "I think I'm getting better!"}}
        ]
        
        for msg in practice_messages:
            self.ws.send(json.dumps(msg))
            time.sleep(3)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Check updated proficiency
        profile_resp = requests.get(
            f"{self.api_base}/users/profile",
            headers=headers
        )
        
        self.assertEqual(profile_resp.status_code, 200)
        profile_data = profile_resp.json()
        
        # Proficiency might have increased
        new_proficiency = profile_data['data']['proficiency']
        self.assertGreaterEqual(new_proficiency, 15)  # Should be >= initial value
        self.assertLessEqual(new_proficiency, 100)    # Should not exceed max
    
    def test_multi_scenario_learning_flow(self):
        """Test flow involving multiple learning scenarios"""
        self.complete_user_onboarding_flow()
        
        headers = {"Authorization": f"Bearer {self.token}"}
        
        # First scenario: Tutor mode
        self.ws = websocket.WebSocketApp(
            f"{self.ws_url}?token={self.token}&sessionId={self.session_id}_tutor&scenario=tutor",
            header=[f"Authorization: Bearer {self.token}"],
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close
        )
        
        ws_thread = threading.Thread(target=self.ws.run_forever)
        ws_thread.daemon = True
        ws_thread.start()
        
        time.sleep(3)
        
        tutor_messages = [
            {"type": "text_message", "payload": {"text": "Let's practice English grammar."}},
            {"type": "text_message", "payload": {"text": "Can you explain modal verbs?"}}
        ]
        
        for msg in tutor_messages:
            self.ws.send(json.dumps(msg))
            time.sleep(4)
        
        self.ws.close()
        time.sleep(2)
        
        # Second scenario: Grammar guide mode
        self.session_id = str(uuid.uuid4())  # New session ID
        self.ws = websocket.WebSocketApp(
            f"{self.ws_url}?token={self.token}&sessionId={self.session_id}_grammar&scenario=grammar_guide",
            header=[f"Authorization: Bearer {self.token}"],
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close
        )
        
        ws_thread2 = threading.Thread(target=self.ws.run_forever)
        ws_thread2.daemon = True
        ws_thread2.start()
        
        time.sleep(3)
        
        grammar_messages = [
            {"type": "text_message", "payload": {"text": "I need help with present perfect tense."}},
            {"type": "text_message", "payload": {"text": "When do I use 'have' vs 'has'?"}}
        ]
        
        for msg in grammar_messages:
            self.ws.send(json.dumps(msg))
            time.sleep(4)
        
        self.ws.close()
        time.sleep(2)
        
        # Verify both conversations were saved
        conv_response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers
        )
        
        self.assertEqual(conv_response.status_code, 200)
        data = conv_response.json()
        self.assertIn('data', data)
        
        conversations = data['data']
        self.assertGreater(len(conversations), 1)  # Should have multiple conversations
    
    def test_interruption_and_recovery_flow(self):
        """Test conversation flow with interruptions and recovery"""
        self.complete_user_onboarding_flow()
        
        # Start a conversation
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send a message that might trigger a longer response
        long_response_msg = {
            "type": "text_message",
            "payload": {"text": "Tell me about the history of the English language."}
        }
        self.ws.send(json.dumps(long_response_msg))
        
        time.sleep(2)  # Wait for AI to start responding
        
        # Interrupt the AI
        interruption_msg = {
            "type": "user_interruption"
        }
        self.ws.send(json.dumps(interruption_msg))
        
        time.sleep(1)
        
        # Send a follow-up
        follow_up_msg = {
            "type": "text_message",
            "payload": {"text": "Sorry, I need to focus on basic vocabulary first."}
        }
        self.ws.send(json.dumps(follow_up_msg))
        
        time.sleep(4)
        
        # Continue with more focused questions
        focused_msgs = [
            {"type": "text_message", "payload": {"text": "What are some basic greetings?"}},
            {"type": "text_message", "payload": {"text": "How do I introduce myself?"}}
        ]
        
        for msg in focused_msgs:
            self.ws.send(json.dumps(msg))
            time.sleep(3)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Verify conversation was handled properly despite interruption
        headers = {"Authorization": f"Bearer {self.token}"}
        conv_response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers
        )
        
        self.assertEqual(conv_response.status_code, 200)
        data = conv_response.json()
        self.assertIn('data', data)
        
        conversations = data['data']
        self.assertGreater(len(conversations), 0)
    
    def test_audio_practice_session_flow(self):
        """Test complete audio practice session flow"""
        self.complete_user_onboarding_flow()
        
        # Start a conversation
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send text messages that encourage audio practice
        messages = [
            {"type": "text_message", "payload": {"text": "I want to practice my pronunciation."}},
            {"type": "text_message", "payload": {"text": "Can you help me with the 'th' sound?"}},
            {"type": "text_message", "payload": {"text": "How do I pronounce 'think' correctly?"}}
        ]
        
        for msg in messages:
            self.ws.send(json.dumps(msg))
            time.sleep(3)
        
        # Simulate sending audio data
        for i in range(3):
            audio_chunk = b'\x00\x01\x02\x03' * 100  # Mock audio data
            self.ws.send(audio_chunk, websocket.ABNF.OPCODE_BINARY)
            time.sleep(1)
        
        # Send follow-up
        follow_up = {"type": "text_message", "payload": {"text": "How did I do?"}}
        self.ws.send(json.dumps(follow_up))
        
        time.sleep(4)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Verify audio was processed and conversation saved
        headers = {"Authorization": f"Bearer {self.token}"}
        conv_response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers
        )
        
        self.assertEqual(conv_response.status_code, 200)
        data = conv_response.json()
        self.assertIn('data', data)
        
        conversations = data['data']
        self.assertGreater(len(conversations), 0)
        
        # Check for audio-related metadata
        latest_conv = max(conversations, key=lambda x: x.get('createdAt', ''))
        self.assertIn('has_audio', latest_conv)
    
    def test_goal_achievement_flow(self):
        """Test flow where user works toward achieving a learning goal"""
        # Complete onboarding
        self.complete_user_onboarding_flow()
        
        headers = {"Authorization": f"Bearer {self.token}"}
        
        # Set a specific learning goal
        goal_resp = requests.post(
            f"{self.api_base}/users/goals",
            headers=headers,
            json={
                "type": "presentation_skills",
                "description": "Deliver a 5-minute presentation in English",
                "target_level": "Advanced",
                "target_language": "English",
                "current_proficiency": 30
            }
        )
        self.assertEqual(goal_resp.status_code, 201)
        
        goal_id = goal_resp.json()['data']['id']
        
        # Start a conversation focused on the goal
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Practice toward the goal
        goal_practice = [
            {"type": "text_message", "payload": {"text": "I'm preparing a presentation."}},
            {"type": "text_message", "payload": {"text": "Can you help me with opening statements?"}},
            {"type": "text_message", "payload": {"text": "What are transition phrases for presentations?"}},
            {"type": "text_message", "payload": {"text": "How do I conclude effectively?"}}
        ]
        
        for msg in goal_practice:
            self.ws.send(json.dumps(msg))
            time.sleep(4)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Check if goal progress was updated
        goals_resp = requests.get(
            f"{self.api_base}/users/goals",
            headers=headers
        )
        
        self.assertEqual(goals_resp.status_code, 200)
        goals_data = goals_resp.json()
        self.assertIn('data', goals_data)
        
        # Verify the goal still exists
        goal_exists = any(goal['id'] == goal_id for goal in goals_data['data'])
        self.assertTrue(goal_exists)
    
    def test_session_continuation_flow(self):
        """Test continuing a conversation across multiple sessions"""
        self.complete_user_onboarding_flow()
        
        headers = {"Authorization": f"Bearer {self.token}"}
        
        # First session
        session1_id = str(uuid.uuid4())
        self.ws = websocket.WebSocketApp(
            f"{self.ws_url}?token={self.token}&sessionId={session1_id}&scenario=tutor",
            header=[f"Authorization: Bearer {self.token}"],
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close
        )
        
        ws_thread1 = threading.Thread(target=self.ws.run_forever)
        ws_thread1.daemon = True
        ws_thread1.start()
        
        time.sleep(3)
        
        # First session conversation
        session1_msgs = [
            {"type": "text_message", "payload": {"text": "Let's start learning English."}},
            {"type": "text_message", "payload": {"text": "I want to learn about daily routines."}}
        ]
        
        for msg in session1_msgs:
            self.ws.send(json.dumps(msg))
            time.sleep(3)
        
        self.ws.close()
        time.sleep(2)
        
        # Second session with same session ID to continue
        self.ws = websocket.WebSocketApp(
            f"{self.ws_url}?token={self.token}&sessionId={session1_id}&scenario=tutor",
            header=[f"Authorization: Bearer {self.token}"],
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close
        )
        
        ws_thread2 = threading.Thread(target=self.ws.run_forever)
        ws_thread2.daemon = True
        ws_thread2.start()
        
        time.sleep(3)
        
        # Continue conversation
        session2_msgs = [
            {"type": "text_message", "payload": {"text": "Can we continue with daily routines?"}},
            {"type": "text_message", "payload": {"text": "What about evening activities?"}}
        ]
        
        for msg in session2_msgs:
            self.ws.send(json.dumps(msg))
            time.sleep(3)
        
        self.ws.close()
        time.sleep(2)
        
        # Verify conversation continuity was handled
        conv_response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers
        )
        
        self.assertEqual(conv_response.status_code, 200)
        data = conv_response.json()
        self.assertIn('data', data)
        
        conversations = data['data']
        self.assertGreater(len(conversations), 0)


if __name__ == '__main__':
    unittest.main()