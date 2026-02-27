"""
Integration tests for the user service in the Oral AI application.

These tests verify the functionality of user registration, login, profile management,
and other user-related operations across the microservice architecture.
"""

import unittest
import requests
import json
import time
import uuid
from datetime import datetime, timedelta


class UserServiceIntegrationTest(unittest.TestCase):
    """Integration tests for user service functionality"""
    
    @classmethod
    def setUpClass(cls):
        """Set up class-level test fixtures"""
        cls.base_url = "http://localhost:8080/api"
        cls.users_created = []
    
    def setUp(self):
        """Set up test fixtures before each test method"""
        self.email = f"test_{uuid.uuid4()}@example.com"
        self.username = f"test_user_{uuid.uuid4()}"
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
    
    def register_user(self, email=None, username=None, password=None):
        """Helper method to register a new user"""
        email = email or self.email
        username = username or self.username
        password = password or self.password
        
        response = requests.post(
            f"{self.base_url}/users/register",
            json={
                "email": email,
                "username": username,
                "password": password
            }
        )
        
        if response.status_code == 201:
            self.users_created.append(response.json().get('data', {}).get('id'))
        
        return response
    
    def login_user(self, email=None, password=None):
        """Helper method to log in a user"""
        email = email or self.email
        password = password or self.password
        
        response = requests.post(
            f"{self.base_url}/users/login",
            json={
                "email": email,
                "password": password
            }
        )
        
        if response.status_code == 200:
            data = response.json().get('data', {})
            self.token = data.get('token')
            self.user_id = data.get('user', {}).get('id')
        
        return response
    
    def test_user_registration_success(self):
        """Test successful user registration"""
        response = self.register_user()
        
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn('data', data)
        self.assertIn('token', data['data'])
        self.assertIsNotNone(data['data']['token'])
    
    def test_user_registration_duplicate_email(self):
        """Test user registration with duplicate email"""
        # Register first user
        response1 = self.register_user()
        self.assertEqual(response1.status_code, 201)
        
        # Try to register with same email
        response2 = self.register_user()
        self.assertEqual(response2.status_code, 400)
    
    def test_user_login_success(self):
        """Test successful user login"""
        # First register a user
        register_resp = self.register_user()
        self.assertEqual(register_resp.status_code, 201)
        
        # Then log in
        login_resp = self.login_user()
        self.assertEqual(login_resp.status_code, 200)
        
        data = login_resp.json()
        self.assertIn('data', data)
        self.assertIn('token', data['data'])
        self.assertIsNotNone(data['data']['token'])
    
    def test_user_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        # Register a user first
        register_resp = self.register_user()
        self.assertEqual(register_resp.status_code, 201)
        
        # Try to log in with wrong password
        login_resp = requests.post(
            f"{self.base_url}/users/login",
            json={
                "email": self.email,
                "password": "wrong_password"
            }
        )
        self.assertEqual(login_resp.status_code, 401)
    
    def test_get_user_profile_authenticated(self):
        """Test getting user profile with valid authentication"""
        # Register and login
        register_resp = self.register_user()
        self.assertEqual(register_resp.status_code, 201)
        
        login_resp = self.login_user()
        self.assertEqual(login_resp.status_code, 200)
        
        # Get profile
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.get(
            f"{self.base_url}/users/profile",
            headers=headers
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('data', data)
        self.assertEqual(data['data']['email'], self.email)
    
    def test_get_user_profile_unauthenticated(self):
        """Test getting user profile without authentication"""
        response = requests.get(f"{self.base_url}/users/profile")
        self.assertEqual(response.status_code, 401)
    
    def test_update_user_profile(self):
        """Test updating user profile"""
        # Register and login
        register_resp = self.register_user()
        self.assertEqual(register_resp.status_code, 201)
        
        login_resp = self.login_user()
        self.assertEqual(login_resp.status_code, 200)
        
        # Update profile
        headers = {"Authorization": f"Bearer {self.token}"}
        update_data = {
            "nickname": "Updated Name",
            "native_language": "Chinese",
            "target_language": "English",
            "proficiency": 50,
            "interests": ["Technology", "Travel"]
        }
        
        response = requests.put(
            f"{self.base_url}/users/profile",
            headers=headers,
            json=update_data
        )
        
        self.assertEqual(response.status_code, 200)
        
        # Verify update
        get_response = requests.get(
            f"{self.base_url}/users/profile",
            headers=headers
        )
        
        self.assertEqual(get_response.status_code, 200)
        data = get_response.json()
        self.assertEqual(data['data']['nickname'], "Updated Name")
        self.assertEqual(data['data']['native_language'], "Chinese")
        self.assertEqual(data['data']['target_language'], "English")
        self.assertEqual(data['data']['proficiency'], 50)
        self.assertIn("Technology", data['data']['interests'])
    
    def test_create_user_goal(self):
        """Test creating a user learning goal"""
        # Register and login
        register_resp = self.register_user()
        self.assertEqual(register_resp.status_code, 201)
        
        login_resp = self.login_user()
        self.assertEqual(login_resp.status_code, 200)
        
        # Create a goal
        headers = {"Authorization": f"Bearer {self.token}"}
        goal_data = {
            "type": "business_meeting",
            "description": "Practice leading a meeting",
            "target_level": "Intermediate",
            "target_language": "English",
            "current_proficiency": 30
        }
        
        response = requests.post(
            f"{self.base_url}/users/goals",
            headers=headers,
            json=goal_data
        )
        
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn('data', data)
        self.assertEqual(data['data']['type'], "business_meeting")
        self.assertEqual(data['data']['description'], "Practice leading a meeting")
    
    def test_get_user_goals(self):
        """Test retrieving user goals"""
        # Register and login
        register_resp = self.register_user()
        self.assertEqual(register_resp.status_code, 201)
        
        login_resp = self.login_user()
        self.assertEqual(login_resp.status_code, 200)
        
        # Create a goal first
        headers = {"Authorization": f"Bearer {self.token}"}
        goal_data = {
            "type": "business_meeting",
            "description": "Practice leading a meeting",
            "target_level": "Intermediate",
            "target_language": "English",
            "current_proficiency": 30
        }
        
        create_resp = requests.post(
            f"{self.base_url}/users/goals",
            headers=headers,
            json=goal_data
        )
        self.assertEqual(create_resp.status_code, 201)
        
        # Retrieve goals
        response = requests.get(
            f"{self.base_url}/users/goals",
            headers=headers
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('data', data)
        self.assertIsInstance(data['data'], list)
        self.assertGreater(len(data['data']), 0)
        self.assertEqual(data['data'][0]['type'], "business_meeting")
    
    @classmethod
    def tearDownClass(cls):
        """Clean up class-level test fixtures"""
        # Clean up created users
        for user_id in cls.users_created:
            try:
                # Attempt to delete user (if endpoint exists)
                pass
            except:
                pass  # Ignore cleanup errors


if __name__ == '__main__':
    unittest.main()