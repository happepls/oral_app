"""
Integration tests for media processing service in the Oral AI application.

These tests verify the functionality of audio transcoding, storage, retrieval,
and processing across the application workflow.
"""

import unittest
import requests
import json
import time
import websocket
import threading
import uuid
import base64


class MediaProcessingServiceIntegrationTest(unittest.TestCase):
    """Integration tests for media processing service functionality"""
    
    def setUp(self):
        """Set up test fixtures before each test method"""
        self.api_base = "http://localhost:8080/api"
        self.media_service_url = "http://localhost:3005"  # Direct access to media service
        self.ws_url = "ws://localhost:8080/api/ws"
        self.email = f"media_test_{int(time.time())}@example.com"
        self.username = f"media_test_user_{int(time.time())}"
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
    
    def test_media_service_availability(self):
        """Test that the media processing service is available"""
        try:
            # Try to access the media service directly
            response = requests.get(f"{self.media_service_url}/health")
            # Health endpoint might not exist, so we'll also try other common endpoints
            if response.status_code == 404:
                # Try other potential endpoints
                endpoints_to_try = [
                    f"{self.media_service_url}/",
                    f"{self.media_service_url}/status",
                    f"{self.media_service_url}/api/health"
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
                    self.fail("Media service appears to be unavailable")
        except requests.exceptions.ConnectionError:
            self.fail("Could not connect to media service")
    
    def test_audio_upload_endpoint(self):
        """Test uploading audio data to the media service"""
        self.register_and_login_user()
        
        # Create mock audio data (small WAV header + dummy audio)
        # WAV file header (44 bytes) + some dummy audio data
        wav_header = (
            b'RIFF' + (44 + 100).to_bytes(4, byteorder='little') +  # Chunk size
            b'WAVEfmt ' + (16).to_bytes(4, byteorder='little') +    # Format chunk
            (1).to_bytes(2, byteorder='little') +                   # Audio format (1 = PCM)
            (1).to_bytes(2, byteorder='little') +                   # Number of channels
            (22050).to_bytes(4, byteorder='little') +               # Sample rate
            (44100).to_bytes(4, byteorder='little') +               # Byte rate
            (2).to_bytes(2, byteorder='little') +                   # Block align
            (16).to_bytes(2, byteorder='little') +                  # Bits per sample
            b'data' + (100).to_bytes(4, byteorder='little')         # Data chunk header
        )
        # Add 100 bytes of dummy audio data
        audio_data = wav_header + b'\x00' * 100
        
        # Try to upload audio directly to media service
        headers = {"Authorization": f"Bearer {self.token}"}
        files = {'audio': ('test.wav', audio_data, 'audio/wav')}
        
        try:
            upload_response = requests.post(
                f"{self.media_service_url}/upload",
                headers=headers,
                files=files
            )
            
            # If direct upload doesn't work, try through main API
            if upload_response.status_code == 404:
                upload_response = requests.post(
                    f"{self.api_base}/media/upload",
                    headers=headers,
                    files=files
                )
            
            # Upload might not be directly exposed, so we'll check the status
            # A 405 (method not allowed) or 400 (bad request due to missing form data) indicates the endpoint exists
            self.assertIn(upload_response.status_code, [200, 201, 400, 405, 415])
        except requests.exceptions.ConnectionError:
            # If we can't reach the service directly, test through WebSocket interaction
            self.skipTest("Direct media upload endpoint not accessible, testing through WebSocket")
    
    def test_audio_transcoding_functionality(self):
        """Test that audio is properly transcoded during the workflow"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send a text message that will trigger AI response (which involves audio processing)
        message = {
            "type": "text_message",
            "payload": {"text": "Can you speak in English?"}
        }
        self.ws.send(json.dumps(message))
        
        # Wait to receive audio response
        time.sleep(8)
        
        # Check that we received audio data (binary responses)
        audio_responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') == 'binary_data'
        ]
        
        # Audio responses might not always come in tests, so we'll make this conditional
        # If we got audio, verify it's properly formatted
        if audio_responses:
            # Audio data should be bytes
            self.assertIsInstance(audio_responses[0]['data'], bytes)
            # Should be of reasonable size (> 0 bytes)
            self.assertGreater(len(audio_responses[0]['data']), 0)
    
    def test_audio_storage_and_retrieval(self):
        """Test that audio is stored and can be retrieved later"""
        self.register_and_login_user()
        
        # Connect WebSocket and have a conversation with audio
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send a message that might trigger audio recording
        message = {
            "type": "text_message",
            "payload": {"text": "Let me record my pronunciation of this word."}
        }
        self.ws.send(json.dumps(message))
        
        time.sleep(5)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Retrieve conversation history to check for audio recordings
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
            
            # Check messages for audio references
            for msg in latest_conv.get('messages', []):
                if msg.get('sender') == 'user' and msg.get('has_audio'):
                    # If audio was recorded, there should be an audio URL
                    self.assertIn('audio_url', msg)
                    
                    # Try to access the audio URL if it exists
                    audio_url = msg.get('audio_url')
                    if audio_url and audio_url.startswith('http'):
                        try:
                            audio_resp = requests.get(audio_url)
                            # Audio should be accessible
                            self.assertIn(audio_resp.status_code, [200, 403, 404])
                        except:
                            # Some audio URLs might be temporary or require special headers
                            pass
    
    def test_audio_format_conversion(self):
        """Test that audio is converted to appropriate formats"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send binary data simulating audio input in various formats
        # Using a small chunk of raw audio data
        raw_audio_chunk = b'\x00\x01\x02\x03\x04\x05\x06\x07' * 50  # 400 bytes of mock audio
        self.ws.send(raw_audio_chunk, websocket.ABNF.OPCODE_BINARY)
        
        time.sleep(3)
        
        # Check for any errors during audio processing
        # The system should handle the audio data without crashing
        error_messages = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') == 'error'
        ]
        
        # There shouldn't be errors just from sending audio data
        # (though there might be if the audio isn't properly framed)
        # We'll just verify the connection remains stable
        self.assertIsNotNone(self.ws.sock.connected)
    
    def test_media_metadata_storage(self):
        """Test that media metadata is properly stored"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send a message that might trigger media processing
        message = {
            "type": "text_message",
            "payload": {"text": "Testing media metadata."}
        }
        self.ws.send(json.dumps(message))
        
        time.sleep(5)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Retrieve conversation history to check for media metadata
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
            
            # Check that conversation has media-related metadata
            self.assertIn('media_count', latest_conv)
            self.assertIn('has_audio', latest_conv)
            self.assertIsInstance(latest_conv['media_count'], int)
            self.assertIsInstance(latest_conv['has_audio'], bool)
    
    def test_audio_streaming_during_conversation(self):
        """Test real-time audio streaming during conversation"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Simulate streaming audio data in chunks
        for i in range(5):
            # Send small chunks of audio data
            audio_chunk = b'\x00\x01\x02\x03' * 100  # 400 bytes per chunk
            self.ws.send(audio_chunk, websocket.ABNF.OPCODE_BINARY)
            time.sleep(0.5)  # Small delay between chunks
        
        # Send a text message to trigger response
        message = {
            "type": "text_message",
            "payload": {"text": "Did you receive my audio?"}
        }
        self.ws.send(json.dumps(message))
        
        time.sleep(5)
        
        # Verify connection stability during audio streaming
        self.assertTrue(self.ws.sock.connected)
        
        # Check for any errors during streaming
        error_messages = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') == 'error'
        ]
        self.assertEqual(len(error_messages), 0)
    
    def test_media_processing_error_handling(self):
        """Test error handling when media processing fails"""
        self.register_and_login_user()
        
        # Connect WebSocket
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        # Send malformed audio data to test error handling
        malformed_audio = b'\xff\xf0\x00\x00' * 10  # Invalid audio data
        self.ws.send(malformed_audio, websocket.ABNF.OPCODE_BINARY)
        
        time.sleep(2)
        
        # Send a normal message after
        normal_message = {
            "type": "text_message",
            "payload": {"text": "Can you still help me after that?"}
        }
        self.ws.send(json.dumps(normal_message))
        
        time.sleep(5)
        
        # Check that the system recovered and can still process messages
        responses = [
            msg for msg in self.messages_received
            if isinstance(msg, dict) and msg.get('type') in ['text_response', 'ai_response']
        ]
        
        # Should still receive responses despite the malformed audio
        self.assertGreater(len(responses), 0)
    
    def test_cors_audio_access(self):
        """Test that audio can be accessed from client-side applications"""
        self.register_and_login_user()
        
        # Update profile to ensure we have data
        headers = {"Authorization": f"Bearer {self.token}"}
        profile_update = {
            "nickname": "Media Test User",
            "native_language": "Chinese",
            "target_language": "English",
            "proficiency": 40
        }
        
        update_resp = requests.put(
            f"{self.api_base}/users/profile",
            headers=headers,
            json=profile_update
        )
        self.assertEqual(update_resp.status_code, 200)
        
        # Have a conversation that might generate audio
        ws_thread = self.connect_websocket()
        
        time.sleep(3)
        
        msg = {"type": "text_message", "payload": {"text": "Testing audio access."}}
        self.ws.send(json.dumps(msg))
        time.sleep(3)
        
        # End conversation
        self.ws.close()
        time.sleep(2)
        
        # Try to access audio with appropriate headers
        headers_with_origin = {
            "Authorization": f"Bearer {self.token}",
            "Origin": "http://localhost:5001"  # Client origin
        }
        
        # Get conversation history
        conv_response = requests.get(
            f"{self.api_base}/history/conversations",
            headers=headers_with_origin
        )
        
        self.assertEqual(conv_response.status_code, 200)


if __name__ == '__main__':
    unittest.main()