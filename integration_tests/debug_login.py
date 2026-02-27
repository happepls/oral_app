#!/usr/bin/env python3
"""
Debug script for login functionality
"""

import requests
import json
import time

def test_login_debug():
    base_url = "http://localhost:8080/api"
    
    print("🚀 Testing Login Functionality")
    print("=" * 50)
    
    # Step 1: Create a test user
    print("\n📋 Step 1: Creating test user")
    timestamp = int(time.time())
    email = f"debug_test_{timestamp}@example.com"
    username = f"debuguser_{timestamp}"
    password = "SecurePassword123!"
    
    register_data = {
        "email": email,
        "username": username,
        "password": password
    }
    
    print(f"Register data: {json.dumps(register_data, indent=2)}")
    
    try:
        register_resp = requests.post(
            f"{base_url}/users/register",
            json=register_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Register status: {register_resp.status_code}")
        print(f"Register response: {register_resp.text}")
        
        if register_resp.status_code == 201:
            register_result = register_resp.json()
            print("✅ Registration successful")
            print(f"Token: {register_result['data']['token'][:50]}...")
        else:
            print("❌ Registration failed")
            return False
            
    except Exception as e:
        print(f"❌ Registration error: {e}")
        return False
    
    # Step 2: Test login
    print("\n📋 Step 2: Testing login")
    login_data = {
        "email": email,
        "password": password
    }
    
    print(f"Login data: {json.dumps(login_data, indent=2)}")
    
    try:
        login_resp = requests.post(
            f"{base_url}/users/login",
            json=login_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Login status: {login_resp.status_code}")
        print(f"Login response: {login_resp.text}")
        
        if login_resp.status_code == 200:
            login_result = login_resp.json()
            print("✅ Login successful")
            print(f"Token: {login_result['data']['token'][:50]}...")
            print(f"User: {login_result['data']['user']['email']}")
            return True
        else:
            print("❌ Login failed")
            return False
            
    except Exception as e:
        print(f"❌ Login error: {e}")
        return False

def test_existing_users():
    """Test login with existing users from database"""
    base_url = "http://localhost:8080/api"
    
    print("\n🔄 Testing with existing users")
    print("-" * 30)
    
    # Test users from database
    test_users = [
        {"email": "test_1767337104@example.com", "password": "SecurePassword123!"},
        {"email": "test_integration_1771035166@example.com", "password": "SecurePassword123!"}
    ]
    
    for i, user_data in enumerate(test_users, 1):
        print(f"\n🧪 Testing user {i}: {user_data['email']}")
        
        try:
            resp = requests.post(
                f"{base_url}/users/login",
                json=user_data,
                headers={"Content-Type": "application/json"}
            )
            
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                result = resp.json()
                print(f"✅ Success - Token: {result['data']['token'][:30]}...")
            else:
                print(f"❌ Failed - Response: {resp.text}")
                
        except Exception as e:
            print(f"❌ Error: {e}")

def test_api_endpoints():
    """Test basic API endpoints"""
    base_url = "http://localhost:8080/api"
    
    print("\n🔍 Testing API endpoints")
    print("-" * 30)
    
    endpoints = [
        ("/users/health", "GET"),
        ("/users/register", "POST"),
        ("/users/login", "POST"),
    ]
    
    for endpoint, method in endpoints:
        url = f"{base_url}{endpoint}"
        print(f"\n🧪 {method} {url}")
        
        try:
            if method == "GET":
                resp = requests.get(url)
            elif method == "POST":
                resp = requests.post(url, json={"test": "data"})
            
            print(f"Status: {resp.status_code}")
            if resp.status_code >= 400:
                print(f"Response: {resp.text}")
                
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("🔧 Login Debug Script")
    print("=" * 50)
    
    # Test API endpoints first
    test_api_endpoints()
    
    # Test with existing users
    test_existing_users()
    
    # Test full registration and login flow
    test_login_debug()
    
    print("\n✅ Debug complete!")