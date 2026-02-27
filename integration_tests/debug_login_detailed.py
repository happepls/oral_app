#!/usr/bin/env python3
"""
Debug login issue in testing guide
"""

import requests
import json

def debug_login():
    base_url = "http://localhost:8080/api"
    
    print("🔍 Debugging Login Issue")
    print("=" * 50)
    
    # Step 1: Create a test user (same as testing guide)
    print("\n📋 Step 1: Creating test user")
    
    # Use the same method as testing guide
    test_data = {
        "email": "guide_test_123@example.com",
        "username": "guide_test_123",
        "password": "SecurePassword123!"
    }
    
    print(f"Register data: {json.dumps(test_data, indent=2)}")
    
    try:
        register_resp = requests.post(
            f"{base_url}/users/register",
            json=test_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Register status: {register_resp.status_code}")
        print(f"Register response: {register_resp.text}")
        
        if register_resp.status_code == 201:
            print("✅ Registration successful")
            register_result = register_resp.json()
            print(f"Token: {register_result['data']['token'][:50]}...")
        else:
            print("❌ Registration failed")
            return
            
    except Exception as e:
        print(f"❌ Registration error: {e}")
        return
    
    # Step 2: Test login with same credentials
    print("\n📋 Step 2: Testing login with same credentials")
    login_data = {
        "email": test_data["email"],
        "password": test_data["password"]
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
            return login_result['data']['token'], login_result['data']['user']['id']
        else:
            print("❌ Login failed")
            return None, None
            
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None, None

def test_existing_users():
    """Test with existing users from database"""
    base_url = "http://localhost:8080/api"
    
    print("\n🔄 Testing with existing users")
    print("-" * 30)
    
    # Test users from database
    test_users = [
        {"email": "test@qq.com", "password": "Zpepc001@"},
        {"email": "test1@qq.com", "password": "Zpepc001@"}
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
    token, user_id = debug_login()
    
    if token and user_id:
        print(f"\n🎉 Success! Token: {token[:50]}...")
        print(f"User ID: {user_id}")
    else:
        print("\n⚠️  Issues found - need to investigate further")