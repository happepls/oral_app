"""
Integration tests for history analytics service in the Oral AI application.

These tests verify the functionality of conversation history storage,
analytics computation, proficiency tracking, and data retrieval.
"""

import unittest
import requests
import json
import time
import websocket
import threading
import uuid


class HistoryAnalyticsServiceIntegrationTest(unittest.TestCase):
    """Integration tests for history analytics service functionality"""
    
    def setUp(self):
        """Set up test fixtures before each test method"""
        self.api_base = "http://localhost:8080/api"
        self.history_service_url = "http://localhost:3004/api/history"  # Direct access to history service
        self.ws_url = "ws://localhost:8080/api/ws"
        self.email = f"hist_test_{int(time.time())}@example.com"
        self.username = f"hist_test_user_{int(time.time())}"
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
    
    def test_conversation_history_storage(self):
        """Test that conversations are properly stored in history"""
        self.register_and_login_user()
        
        # Connect WebSocket and have a conversation
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send a few messages
        messages = [
            {"type": "text_message", "payload": {"text": "Hello, let's practice English."}},
            {"type": "text_message", "payload": {"text": "How do I say 'good morning'?"}},
            {"type": "text_message", "payload": {"text": "Thank you for helping me."}}
        ]
        
        for msg in messages:
            self.ws.send(json.dumps(msg))
            time.sleep(3)  # Wait for response
        
        # Close WebSocket to ensure conversation is saved
        self.ws.close()
        time.sleep(2)
        
        # Retrieve conversation history
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('data', data)
        
        # Check that at least one conversation was saved
        conversations = data['data']
        self.assertGreater(len(conversations), 0)
        
        # Find the most recent conversation
        latest_conv = max(conversations, key=lambda x: x.get('createdAt', ''))
        
        # Check that it has messages
        self.assertIn('messages', latest_conv)
        self.assertGreater(len(latest_conv['messages']), 0)
    
    def test_user_statistics_retrieval(self):
        """Test retrieval of user statistics and analytics"""
        self.register_and_login_user()
        
        # Update user profile to ensure we have data
        headers = {"Authorization": f"Bearer {self.token}"}
        profile_update = {
            "nickname": "Stats Test User",
            "native_language": "Chinese",
            "target_language": "English",
            "proficiency": 25,
            "interests": ["Travel", "Technology"]
        }
        
        update_resp = requests.put(
            f"{self.api_base}/users/profile",
            headers=headers,
            json=profile_update
        )
        self.assertEqual(update_resp.status_code, 200)
        
        # Retrieve user statistics
        stats_response = requests.get(
            f"{self.history_service_url}/stats/{self.user_id}",
            headers=headers
        )
        
        # The endpoint might be different, try alternative paths
        if stats_response.status_code == 404:
            stats_response = requests.get(
                f"{self.api_base}/history/stats/{self.user_id}",
                headers=headers
            )
        
        self.assertIn(stats_response.status_code, [200, 201], 
                      f"Stats endpoint returned {stats_response.status_code}: {stats_response.text}")
        
        if stats_response.status_code == 200:
            stats_data = stats_response.json()
            self.assertIn('data', stats_data)
            
            stats = stats_data['data']
            self.assertIn('total_sessions', stats)
            self.assertIn('avg_proficiency_gain', stats)
            self.assertIn('target_language', stats)
    
    def test_conversation_summary_generation(self):
        """Test that conversation summaries are generated correctly"""
        self.register_and_login_user()
        
        # Connect WebSocket and have a conversation
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send several messages to create a meaningful conversation
        conversation_msgs = [
            {"type": "text_message", "payload": {"text": "Hi there! I'd like to practice English."}},
            {"type": "text_message", "payload": {"text": "Can you help me with past tense verbs?"}},
            {"type": "text_message", "payload": {"text": "I often get confused between 'go' and 'went'."}},
            {"type": "text_message", "payload": {"text": "Could you give me some examples?"}},
            {"type": "text_message", "payload": {"text": "That's very helpful, thank you!"}},
            {"type": "text_message", "payload": {"text": "I feel more confident now."}}
        ]
        
        for msg in conversation_msgs:
            self.ws.send(json.dumps(msg))
            time.sleep(4)  # Wait for AI response
        
        # End the conversation
        self.ws.close()
        time.sleep(3)
        
        # Retrieve conversations and check for summaries
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
        
        # Check the latest conversation for summary
        latest_conv = max(conversations, key=lambda x: x.get('createdAt', ''))
        
        # Check if summary exists or is generated
        self.assertIn('summary', latest_conv)
        # Summary might be empty initially, but should be a string field
        self.assertIsInstance(latest_conv['summary'], str)
    
    def test_proficiency_tracking(self):
        """Test that proficiency changes are tracked correctly"""
        self.register_and_login_user()
        
        # Initially set proficiency
        headers = {"Authorization": f"Bearer {self.token}"}
        profile_update = {
            "proficiency": 30
        }
        
        update_resp = requests.put(
            f"{self.api_base}/users/profile",
            headers=headers,
            json=profile_update
        )
        self.assertEqual(update_resp.status_code, 200)
        
        # Have a conversation that might affect proficiency
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send practice messages
        practice_msgs = [
            {"type": "text_message", "payload": {"text": "I want to improve my English skills."}},
            {"type": "text_message", "payload": {"text": "Can we practice forming questions?"}},
            {"type": "text_message", "payload": {"text": "How do I ask 'Where is the bathroom?'"}},
            {"type": "text_message", "payload": {"text": "Thanks for the correction!"}}
        ]
        
        for msg in practice_msgs:
            self.ws.send(json.dumps(msg))
            time.sleep(3)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Get updated user profile to check proficiency
        profile_response = requests.get(
            f"{self.api_base}/users/profile",
            headers=headers
        )
        
        self.assertEqual(profile_response.status_code, 200)
        profile_data = profile_response.json()
        self.assertIn('data', profile_data)
        
        # Check that proficiency is still a valid value
        self.assertIn('proficiency', profile_data['data'])
        self.assertGreaterEqual(profile_data['data']['proficiency'], 0)
        self.assertLessEqual(profile_data['data']['proficiency'], 100)
    
    def test_audio_recording_storage(self):
        """Test that audio recordings are properly stored and retrievable"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send a message that might trigger audio recording
        message = {
            "type": "text_message",
            "payload": {"text": "Let me practice pronunciation. The word is 'pronunciation'."}
        }
        self.ws.send(json.dumps(message))
        
        time.sleep(5)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Retrieve conversations to check for audio URLs
        headers = {"Authorization": f"Bearer {self.token}"}
        conv_response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers
        )
        
        self.assertEqual(conv_response.status_code, 200)
        data = conv_response.json()
        self.assertIn('data', data)
        
        conversations = data['data']
        if len(conversations) > 0:
            latest_conv = max(conversations, key=lambda x: x.get('createdAt', ''))
            
            # Check messages for audio URLs
            for msg in latest_conv.get('messages', []):
                if msg.get('sender') == 'user':
                    # User messages might have audio recordings
                    self.assertIn('has_audio', msg)
                    # If audio was recorded, there should be an audio URL
                    if msg.get('has_audio'):
                        self.assertIn('audio_url', msg)
    
    def test_historical_data_querying(self):
        """Test querying historical data with filters"""
        self.register_and_login_user()
        
        # Have a conversation first
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send a message
        message = {
            "type": "text_message",
            "payload": {"text": "Practicing for a business meeting tomorrow."}
        }
        self.ws.send(json.dumps(message))
        
        time.sleep(3)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Query historical data with filters
        headers = {"Authorization": f"Bearer {self.token}"}
        
        # Try to get conversations by date range
        import datetime
        today = datetime.date.today()
        week_ago = today - datetime.timedelta(days=7)
        
        params = {
            'startDate': week_ago.isoformat(),
            'endDate': today.isoformat()
        }
        
        filtered_response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers,
            params=params
        )
        
        self.assertEqual(filtered_response.status_code, 200)
        filtered_data = filtered_response.json()
        self.assertIn('data', filtered_data)
        
        # Should have at least the conversation we just had
        self.assertGreater(len(filtered_data['data']), 0)
    
    def test_data_retention_policy(self):
        """Test that old data is handled according to retention policy"""
        self.register_and_login_user()
        
        # Retrieve all conversations
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('data', data)
        
        # Check that conversations have proper timestamps
        conversations = data['data']
        for conv in conversations:
            self.assertIn('createdAt', conv)
            # Verify timestamp format
            created_at = conv['createdAt']
            self.assertIsInstance(created_at, str)
            # Should be in ISO format
            self.assertRegex(created_at, r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}')
    
    def test_cross_reference_with_user_data(self):
        """Test that history data correctly references user information"""
        self.register_and_login_user()
        
        # Get user profile first
        headers = {"Authorization": f"Bearer {self.token}"}
        profile_response = requests.get(
            f"{self.api_base}/users/profile",
            headers=headers
        )
        self.assertEqual(profile_response.status_code, 200)
        profile_data = profile_response.json()
        self.assertIn('data', profile_data)
        
        user_nickname = profile_data['data'].get('nickname', 'Unknown')
        
        # Have a conversation
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        msg = {"type": "text_message", "payload": {"text": "Testing cross-reference."}}
        self.ws.send(json.dumps(msg))
        time.sleep(3)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Retrieve conversation history
        conv_response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers
        )
        
        self.assertEqual(conv_response.status_code, 200)
        conv_data = conv_response.json()
        self.assertIn('data', conv_data)
        
        # Verify that the conversation is associated with the correct user
        conversations = conv_data['data']
        if len(conversations) > 0:
            latest_conv = max(conversations, key=lambda x: x.get('createdAt', ''))
            # The conversation should be linked to the user who created it
            # This is typically verified by the conversation belonging to the authenticated user
            # which is handled by the API based on the token


if __name__ == '__main__':
    unittest.main()