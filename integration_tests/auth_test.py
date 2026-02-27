"""
Integration tests for authentication functionality in the Oral AI application.

These tests verify JWT token generation, validation, expiration, and security aspects
across the microservice architecture.
"""

import unittest
import requests
import json
import time
import jwt
from datetime import datetime, timedelta


class AuthenticationIntegrationTest(unittest.TestCase):
    """Integration tests for authentication functionality"""
    
    def setUp(self):
        """Set up test fixtures before each test method"""
        self.base_url = "http://localhost:8080/api"
        self.email = f"auth_test_{int(time.time())}@example.com"
        self.username = f"auth_test_user_{int(time.time())}"
        self.password = "SecurePassword123!"
        self.token = None
        self.user_id = None
    
    def tearDown(self):
        """Clean up after each test method"""
        # Clean up created user if needed
        if hasattr(self, 'token') and self.token:
            try:
                headers = {"Authorization": f"Bearer {self.token}"}
                response = requests.delete(
                    f"{self.base_url}/users/profile",
                    headers=headers
                )
            except:
                pass  # Ignore cleanup errors
    
    def register_and_login_user(self):
        """Helper method to register and login a user"""
        # Register user
        register_resp = requests.post(
            f"{self.base_url}/users/register",
            json={
                "email": self.email,
                "username": self.username,
                "password": self.password
            }
        )
        self.assertEqual(register_resp.status_code, 201)
        
        # Login user
        login_resp = requests.post(
            f"{self.base_url}/users/login",
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
    
    def test_jwt_token_generation(self):
        """Test that JWT tokens are properly generated upon login"""
        self.register_and_login_user()
        
        # Decode the token to verify its structure
        try:
            decoded = jwt.decode(self.token, options={"verify_signature": False})
            self.assertIn('user_id', decoded)
            self.assertIn('exp', decoded)
            self.assertIn('iat', decoded)
            self.assertEqual(decoded['user_id'], self.user_id)
        except jwt.DecodeError:
            self.fail("Token could not be decoded as JWT")
    
    def test_protected_endpoint_access_with_valid_token(self):
        """Test accessing protected endpoints with valid JWT token"""
        self.register_and_login_user()
        
        # Access a protected endpoint
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.get(
            f"{self.base_url}/users/profile",
            headers=headers
        )
        
        self.assertEqual(response.status_code, 200)
    
    def test_protected_endpoint_access_without_token(self):
        """Test accessing protected endpoints without JWT token"""
        # Try to access a protected endpoint without token
        response = requests.get(f"{self.base_url}/users/profile")
        
        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertIn('error', data)
    
    def test_protected_endpoint_access_with_invalid_token(self):
        """Test accessing protected endpoints with invalid JWT token"""
        # Try to access a protected endpoint with invalid token
        headers = {"Authorization": "Bearer invalid_token_here"}
        response = requests.get(
            f"{self.base_url}/users/profile",
            headers=headers
        )
        
        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertIn('error', data)
    
    def test_token_expiration(self):
        """Test JWT token expiration behavior"""
        self.register_and_login_user()
        
        # Manually decode token to check expiration
        try:
            decoded = jwt.decode(self.token, options={"verify_signature": False})
            exp_timestamp = decoded['exp']
            current_timestamp = int(time.time())
            
            # Check that token hasn't expired yet
            self.assertGreater(exp_timestamp, current_timestamp)
            
            # The token should be valid for at least 1 hour from now
            expected_min_exp = current_timestamp + (59 * 60)  # 59 minutes from now
            self.assertGreaterEqual(exp_timestamp, expected_min_exp)
        except jwt.DecodeError:
            self.fail("Token could not be decoded as JWT")
    
    def test_token_revocation_or_logout(self):
        """Test token revocation or logout functionality if implemented"""
        self.register_and_login_user()
        
        # If there's a logout endpoint, test it
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.post(
            f"{self.base_url}/users/logout",
            headers=headers
        )
        
        # If logout endpoint exists, it should return success
        if response.status_code != 404:
            self.assertIn(response.status_code, [200, 204])
            
            # Try to use the token after logout
            profile_response = requests.get(
                f"{self.base_url}/users/profile",
                headers=headers
            )
            self.assertEqual(profile_response.status_code, 401)
        else:
            # If no logout endpoint, skip this test
            self.skipTest("Logout endpoint not implemented")
    
    def test_refresh_token_if_available(self):
        """Test refresh token functionality if implemented"""
        # First register and login
        self.register_and_login_user()
        
        # Check if refresh token is provided
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.post(
            f"{self.base_url}/users/refresh",
            headers=headers
        )
        
        if response.status_code != 404:
            # Refresh endpoint exists, test it
            self.assertIn(response.status_code, [200, 401])
            
            if response.status_code == 200:
                data = response.json()
                self.assertIn('data', data)
                self.assertIn('token', data['data'])
                new_token = data['data']['token']
                
                # Verify the new token works
                new_headers = {"Authorization": f"Bearer {new_token}"}
                profile_response = requests.get(
                    f"{self.base_url}/users/profile",
                    headers=new_headers
                )
                self.assertEqual(profile_response.status_code, 200)
        else:
            # If no refresh endpoint, skip this test
            self.skipTest("Refresh token endpoint not implemented")
    
    def test_cross_service_token_validation(self):
        """Test that JWT tokens work across different services"""
        self.register_and_login_user()
        
        headers = {"Authorization": f"Bearer {self.token}"}
        
        # Test access to different services using the same token
        services_to_test = [
            f"{self.base_url}/users/profile",
            f"{self.base_url}/users/goals",
        ]
        
        for service_url in services_to_test:
            response = requests.get(service_url, headers=headers)
            # All should be accessible with valid token
            self.assertIn(response.status_code, [200, 201, 404])  # 404 means endpoint exists but no data
    
    def test_concurrent_requests_with_same_token(self):
        """Test that the same token can be used for concurrent requests"""
        import threading
        import queue
        
        self.register_and_login_user()
        headers = {"Authorization": f"Bearer {self.token}"}
        
        # Queue to store results from threads
        result_queue = queue.Queue()
        
        def make_request():
            response = requests.get(
                f"{self.base_url}/users/profile",
                headers=headers
            )
            result_queue.put(response.status_code)
        
        # Create multiple threads making requests simultaneously
        threads = []
        num_threads = 5
        
        for _ in range(num_threads):
            thread = threading.Thread(target=make_request)
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        # Check that all requests succeeded
        for _ in range(num_threads):
            status_code = result_queue.get()
            self.assertEqual(status_code, 200)


if __name__ == '__main__':
    unittest.main()