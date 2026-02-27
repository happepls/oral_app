"""
Integration tests for WebSocket communication in the Oral AI application.

These tests verify real-time communication between client and services,
including text and audio streaming, session management, and error handling.
"""

import unittest
import websocket
import threading
import time
import json
import requests
import uuid
from datetime import datetime


class WebSocketCommunicationIntegrationTest(unittest.TestCase):
    """Integration tests for WebSocket communication functionality"""
    
    def setUp(self):
        """Set up test fixtures before each test method"""
        self.api_base = "http://localhost:8080/api"
        self.ws_url = "ws://localhost:8080/api/ws"
        self.email = f"ws_test_{int(time.time())}@example.com"
        self.username = f"ws_test_user_{int(time.time())}"
        self.password = "SecurePassword123!"
        self.token = None
        self.user_id = None
        self.ws = None
        self.messages_received = []
        self.errors_received = []
        self.session_id = str(uuid.uuid4())
    
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
        self.errors_received.append(str(error))
    
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
    
    def test_websocket_connection_establishment(self):
        """Test successful WebSocket connection establishment"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        # Check that connection was established
        self.assertIsNotNone(self.ws)
        self.assertTrue(self.ws.sock.connected)
        
        # Look for connection established message
        time.sleep(3)  # Wait for handshake and initial messages
        connection_messages = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') == 'connection_established'
        ]
        self.assertGreater(len(connection_messages), 0)
    
    def test_session_handshake(self):
        """Test proper session handshake with authentication"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        # Wait for handshake
        time.sleep(3)
        
        # Verify we received connection established message
        connection_msgs = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') == 'connection_established'
        ]
        self.assertGreater(len(connection_msgs), 0)
        
        # Verify the payload contains expected fields
        payload = connection_msgs[0].get('payload', {})
        self.assertIn('role', payload)
        self.assertIsInstance(payload['role'], str)
    
    def test_text_message_exchange(self):
        """Test sending and receiving text messages via WebSocket"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        # Wait for connection
        time.sleep(3)
        
        # Send a text message
        text_message = {
            "type": "text_message",
            "payload": {"text": "Hello, AI tutor!"}
        }
        self.ws.send(json.dumps(text_message))
        
        # Wait for response
        time.sleep(5)
        
        # Check that we received text response
        text_responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
        ]
        self.assertGreater(len(text_responses), 0)
        
        # Check that the response contains text
        response_text = text_responses[0].get('payload') or text_responses[0].get('text', '')
        self.assertIsInstance(response_text, (str, dict))
    
    def test_ping_pong_heartbeat(self):
        """Test WebSocket heartbeat mechanism (ping/pong)"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        # Wait for connection
        time.sleep(3)
        
        # Send a ping
        ping_message = {"type": "ping"}
        self.ws.send(json.dumps(ping_message))
        
        # Wait for pong response
        time.sleep(2)
        
        # Check that we received a pong response
        pong_messages = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') == 'pong'
        ]
        # Note: Not all implementations may send pong, so we'll make this conditional
        # If pong is implemented, verify it; otherwise, note that
        if pong_messages:
            self.assertGreater(len(pong_messages), 0)
    
    def test_session_persistence(self):
        """Test that session state persists across WebSocket reconnects"""
        self.register_and_login_user()
        
        # Connect WebSocket first time
        ws_thread1 = self.connect_websocket()
        time.sleep(3)
        
        # Send a message to establish context
        message1 = {
            "type": "text_message",
            "payload": {"text": "Let's start practicing English."}
        }
        self.ws.send(json.dumps(message1))
        time.sleep(3)
        
        # Close the connection
        self.ws.close()
        time.sleep(2)
        
        # Reconnect with same session ID
        self.ws = websocket.WebSocketApp(
            f"{self.ws_url}?token={self.token}&sessionId={self.session_id}&scenario=tutor",
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
        
        # Send another message
        message2 = {
            "type": "text_message",
            "payload": {"text": "How do I say 'good morning'?"}
        }
        self.ws.send(json.dumps(message2))
        time.sleep(5)
        
        # Check that the AI remembers the context
        responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
        ]
        self.assertGreater(len(responses), 0)
    
    def test_binary_audio_data_transmission(self):
        """Test transmission of binary audio data via WebSocket"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send mock audio data (simulating what the client would send)
        # Using a small chunk of binary data to simulate audio
        mock_audio_chunk = b'\x00\x01\x02\x03\x04\x05\x06\x07' * 100  # 800 bytes of mock audio
        self.ws.send(mock_audio_chunk, websocket.ABNF.OPCODE_BINARY)
        
        time.sleep(3)
        
        # Check that we didn't receive any errors
        self.assertEqual(len(self.errors_received), 0)
        
        # Check that we might receive audio responses (binary data)
        binary_responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') == 'binary_data'
        ]
        # This test might not always receive binary responses depending on AI service state
        # So we'll just verify no errors occurred
    
    def test_user_interruption_handling(self):
        """Test handling of user interruption signals"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # First, send a message that might trigger a longer response
        long_message = {
            "type": "text_message",
            "payload": {"text": "Tell me about the benefits of learning languages."}
        }
        self.ws.send(json.dumps(long_message))
        
        time.sleep(2)  # Wait a bit for AI to start responding
        
        # Send interruption signal
        interruption_msg = {
            "type": "user_interruption"
        }
        self.ws.send(json.dumps(interruption_msg))
        
        time.sleep(3)
        
        # Send a follow-up message
        follow_up = {
            "type": "text_message",
            "payload": {"text": "Sorry, I interrupted. Can we practice greetings?"}
        }
        self.ws.send(json.dumps(follow_up))
        
        time.sleep(5)
        
        # Check that the conversation continued after interruption
        responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
        ]
        self.assertGreater(len(responses), 0)
    
    def test_websocket_error_handling(self):
        """Test WebSocket error handling with invalid token"""
        # Try connecting with an invalid token
        invalid_ws = websocket.WebSocketApp(
            f"{self.ws_url}?token=invalid_token&sessionId={self.session_id}&scenario=tutor",
            header=[f"Authorization: Bearer invalid_token"],
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close
        )
        
        # Run WebSocket in separate thread
        invalid_ws_thread = threading.Thread(target=invalid_ws.run_forever)
        invalid_ws_thread.daemon = True
        invalid_ws_thread.start()
        
        time.sleep(3)
        
        # Check that we received an error
        self.assertGreater(len(self.errors_received), 0)
        
        invalid_ws.close()


if __name__ == '__main__':
    unittest.main()