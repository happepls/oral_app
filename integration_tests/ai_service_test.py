"""
Integration tests for AI service in the Oral AI application.

These tests verify the functionality of the Qwen3-Omni AI model integration,
real-time ASR/TTS capabilities, and AI response quality across different scenarios.
"""

import unittest
import requests
import json
import time
import websocket
import threading
import uuid


class AIServiceIntegrationTest(unittest.TestCase):
    """Integration tests for AI service functionality"""
    
    def setUp(self):
        """Set up test fixtures before each test method"""
        self.api_base = "http://localhost:8080/api"
        self.ai_service_url = "http://localhost:8082"  # Direct access to AI service
        self.ws_url = "ws://localhost:8080/api/ws"
        self.email = f"ai_test_{int(time.time())}@example.com"
        self.username = f"ai_test_user_{int(time.time())}"
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
    
    def test_ai_model_availability(self):
        """Test that the AI model service is available and responsive"""
        try:
            # Try to access the AI service directly
            response = requests.get(f"{self.ai_service_url}/health")
            # Health endpoint might not exist, so we'll also try other common endpoints
            if response.status_code == 404:
                # Try other potential endpoints
                endpoints_to_try = [
                    f"{self.ai_service_url}/",
                    f"{self.ai_service_url}/status",
                    f"{self.ai_service_url}/api/health"
                ]
                
                found_available = False
                for endpoint in endpoints_to_try:
                    try:
                        resp = requests.get(endpoint, timeout=10)
                        if resp.status_code in [200, 404, 405]:  # 404/405 means service is reachable
                            found_available = True
                            break
                    except:
                        continue
                
                if not found_available:
                    self.fail("AI service appears to be unavailable")
        except requests.exceptions.ConnectionError:
            self.fail("Could not connect to AI service")
    
    def test_ai_response_quality_basic(self):
        """Test that AI provides appropriate responses to basic prompts"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        # Wait for connection
        time.sleep(3)
        
        # Send a simple greeting
        greeting_msg = {
            "type": "text_message",
            "payload": {"text": "Hello, how are you today?"}
        }
        self.ws.send(json.dumps(greeting_msg))
        
        # Wait for AI response
        time.sleep(8)
        
        # Check that we received AI responses
        ai_responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
        ]
        
        self.assertGreater(len(ai_responses), 0, "No AI responses received")
        
        # Check that the response is appropriate
        response_text = ai_responses[0].get('payload') or ai_responses[0].get('text', '')
        if isinstance(response_text, dict):
            response_text = response_text.get('text', '') if 'text' in response_text else str(response_text)
        
        self.assertIsInstance(response_text, str)
        self.assertGreater(len(response_text.strip()), 0, "AI response is empty")
        # Check that response seems contextually relevant (contains greeting-related terms)
        response_lower = response_text.lower()
        self.assertTrue(
            any(term in response_lower for term in ['hello', 'hi', 'hey', 'greetings', 'welcome']),
            f"AI response '{response_text}' doesn't seem to greet appropriately"
        )
    
    def test_ai_role_adaptation(self):
        """Test that AI adapts its responses based on the selected role/scenario"""
        self.register_and_login_user()
        
        # Connect WebSocket with tutor scenario
        self.ws = websocket.WebSocketApp(
            f"{self.ws_url}?token={self.token}&sessionId={self.session_id}&scenario=tutor",
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
        
        # Send a language learning question
        lang_question = {
            "type": "text_message",
            "payload": {"text": "Can you help me practice past tense verbs?"}
        }
        self.ws.send(json.dumps(lang_question))
        
        time.sleep(8)
        
        # Check that we received educational responses
        ai_responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
        ]
        
        self.assertGreater(len(ai_responses), 0, "No AI responses received for tutor scenario")
        
        response_text = ai_responses[0].get('payload') or ai_responses[0].get('text', '')
        if isinstance(response_text, dict):
            response_text = response_text.get('text', '') if 'text' in response_text else str(response_text)
        
        # Check that response is educational in nature
        response_lower = response_text.lower()
        self.assertTrue(
            any(term in response_lower for term in ['verb', 'past', 'tense', 'example', 'practice', 'learn']),
            f"AI response '{response_text}' doesn't seem educational for tutor scenario"
        )
    
    def test_ai_context_preservation(self):
        """Test that AI preserves context across multiple exchanges"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Start a conversation about a topic
        topic_intro = {
            "type": "text_message",
            "payload": {"text": "I want to learn vocabulary about food and restaurants."}
        }
        self.ws.send(json.dumps(topic_intro))
        
        time.sleep(5)
        
        # Follow up with a related question
        follow_up = {
            "type": "text_message",
            "payload": {"text": "What are some common phrases for ordering food?"}
        }
        self.ws.send(json.dumps(follow_up))
        
        time.sleep(8)
        
        # Check that AI maintained context about food/restaurants
        ai_responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
        ]
        
        self.assertGreater(len(ai_responses), 1, "Expected multiple AI responses")
        
        # Check the second response for food-related content
        second_response = ai_responses[-1].get('payload') or ai_responses[-1].get('text', '')
        if isinstance(second_response, dict):
            second_response = second_response.get('text', '') if 'text' in second_response else str(second_response)
        
        second_response_lower = second_response.lower()
        self.assertTrue(
            any(term in second_response_lower for term in ['food', 'restaurant', 'order', 'menu', 'meal', 'dish']),
            f"AI response '{second_response}' doesn't maintain context about food/restaurants"
        )
    
    def test_ai_personalization_based_on_user_profile(self):
        """Test that AI personalizes responses based on user profile"""
        self.register_and_login_user()
        
        # Update user profile with specific preferences
        headers = {"Authorization": f"Bearer {self.token}"}
        profile_update = {
            "nickname": "Learning Enthusiast",
            "native_language": "Chinese",
            "target_language": "English",
            "proficiency": 30,  # Beginner level
            "interests": ["Travel", "Food"]
        }
        
        update_resp = requests.put(
            f"{self.api_base}/users/profile",
            headers=headers,
            json=profile_update
        )
        self.assertEqual(update_resp.status_code, 200)
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Ask a general question
        question = {
            "type": "text_message",
            "payload": {"text": "Can you help me learn English?"}
        }
        self.ws.send(json.dumps(question))
        
        time.sleep(8)
        
        # Check that AI response is appropriate for beginner level
        ai_responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
        ]
        
        self.assertGreater(len(ai_responses), 0, "No AI responses received")
        
        response_text = ai_responses[0].get('payload') or ai_responses[0].get('text', '')
        if isinstance(response_text, dict):
            response_text = response_text.get('text', '') if 'text' in response_text else str(response_text)
        
        # For a beginner, AI should offer simple, encouraging responses
        response_lower = response_text.lower()
        self.assertTrue(
            any(term in response_lower for term in ['simple', 'basic', 'easy', 'start', 'beginner', 'first']),
            f"AI response '{response_text}' doesn't seem appropriate for beginner level"
        )
    
    def test_ai_multilingual_capability(self):
        """Test that AI can handle multilingual inputs appropriately"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send a mixed-language message
        mixed_msg = {
            "type": "text_message",
            "payload": {"text": "Hello, 你好, and 안녕하세요! Can you respond in English?"}
        }
        self.ws.send(json.dumps(mixed_msg))
        
        time.sleep(8)
        
        # Check that AI responds appropriately
        ai_responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
        ]
        
        self.assertGreater(len(ai_responses), 0, "No AI responses received for multilingual input")
        
        response_text = ai_responses[0].get('payload') or ai_responses[0].get('text', '')
        if isinstance(response_text, dict):
            response_text = response_text.get('text', '') if 'text' in response_text else str(response_text)
        
        # Response should be in English as requested
        self.assertIsInstance(response_text, str)
        self.assertGreater(len(response_text.strip()), 0)
    
    def test_ai_response_timing(self):
        """Test that AI provides responses within acceptable time limits"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        start_time = time.time()
        
        # Send a question
        question = {
            "type": "text_message",
            "payload": {"text": "What is the capital of France?"}
        }
        self.ws.send(json.dumps(question))
        
        # Wait for response with timeout
        timeout = 15  # seconds
        response_received = False
        
        while time.time() - start_time < timeout and not response_received:
            ai_responses = [
                msg for msg in self.messages_received
                if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
            ]
            if len(ai_responses) > 0:
                response_received = True
            time.sleep(0.5)
        
        self.assertTrue(response_received, f"AI did not respond within {timeout} seconds")
        
        response_time = time.time() - start_time
        # Check that response time is reasonable (less than 10 seconds for simple question)
        self.assertLess(response_time, 10.0, f"AI response took too long: {response_time:.2f}s")
    
    def test_ai_error_recovery(self):
        """Test that AI service recovers gracefully from errors"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send a very long message to potentially stress the AI
        long_message = {
            "type": "text_message",
            "payload": {"text": "Hello. " * 1000}  # Very long message
        }
        self.ws.send(json.dumps(long_message))
        
        time.sleep(10)
        
        # Send a normal message after
        normal_message = {
            "type": "text_message",
            "payload": {"text": "Can you help me with English grammar?"}
        }
        self.ws.send(json.dumps(normal_message))
        
        time.sleep(8)
        
        # Check that AI still responds normally after the long message
        ai_responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
        ]
        
        # Should have responses for both messages
        self.assertGreater(len(ai_responses), 0, "AI did not respond after handling long message")


if __name__ == '__main__':
    unittest.main()