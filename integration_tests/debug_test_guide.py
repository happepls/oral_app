#!/usr/bin/env python3
"""
Debug test guide registration and login flow
"""

import requests
import json
import time
import uuid

def create_test_user_debug():
    """Replicate the exact test guide user creation"""
    base_url = "http://localhost:8080/api"
    
    print("🔍 Replicating Test Guide User Creation")
    print("=" * 60)
    
    # Step 1: Create user data (exactly like test guide)
    timestamp = str(int(time.time()))
    uuid_str = str(uuid.uuid4())[:8]
    
    email = f"guide_test_{timestamp}_{uuid_str}@example.com"
    username = f"guide_test_user_{timestamp}_{uuid_str}"
    password = "SecurePassword123!"
    
    print(f"Generated email: {email}")
    print(f"Generated username: {username}")
    print(f"Password: {password}")
    print(f"Email length: {len(email)}")
    print(f"Username length: {len(username)}")
    
    # Step 2: Test registration
    print(f"\n📋 Registering user...")
    register_data = {
        "email": email,
        "username": username,
        "password": password
    }
    
    print(f"Register payload: {json.dumps(register_data, indent=2)}")
    
    try:
        register_resp = requests.post(
            f"{base_url}/users/register",
            json=register_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Register status: {register_resp.status_code}")
        print(f"Register response: {register_resp.text}")
        
        if register_resp.status_code == 201:
            result = register_resp.json()
            print("✅ Registration successful")
            print(f"Token: {result['data']['token'][:50]}...")
            return email, password
        else:
            print("❌ Registration failed")
            return None, None
            
    except Exception as e:
        print(f"❌ Registration error: {e}")
        return None, None

def test_simpler_user():
    """Test with simpler username to avoid validation issues"""
    base_url = "http://localhost:8080/api"
    
    print(f"\n🔍 Testing with simpler username")
    print("-" * 40)
    
    timestamp = str(int(time.time()))
    
    email = f"simple_test_{timestamp}@example.com"
    username = f"simple_user_{timestamp}"
    password = "SecurePassword123!"
    
    print(f"Email: {email}")
    print(f"Username: {username}")
    print(f"Username length: {len(username)}")
    
    register_data = {
        "email": email,
        "username": username,
        "password": password
    }
    
    try:
        register_resp = requests.post(
            f"{base_url}/users/register",
            json=register_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Register status: {register_resp.status_code}")
        if register_resp.status_code == 201:
            print("✅ Registration successful")
            return email, password
        else:
            print(f"❌ Registration failed: {register_resp.text}")
            return None, None
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None, None

def test_login_flow(email, password):
    """Test login with given credentials"""
    base_url = "http://localhost:8080/api"
    
    print(f"\n📋 Testing login")
    print("-" * 30)
    
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
            result = login_resp.json()
            print("✅ Login successful")
            print(f"Token: {result['data']['token'][:50]}...")
            return result['data']['token'], result['data']['user']['id']
        else:
            print("❌ Login failed")
            return None, None
            
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None, None

def test_validation_limits():
    """Test username validation limits"""
    base_url = "http://localhost:8080/api"
    
    print(f"\n🔍 Testing username validation limits")
    print("-" * 50)
    
    test_cases = [
        {"username": "ab", "email": "test@example.com", "desc": "Too short (2 chars)"},
        {"username": "a" * 31, "email": "test@example.com", "desc": "Too long (31 chars)"},
        {"username": "valid_user_123", "email": "test@example.com", "desc": "Valid username"},
        {"username": "user@invalid", "email": "test@example.com", "desc": "Invalid chars (@)"},
        {"username": "user with space", "email": "test@example.com", "desc": "Invalid chars (space)"}
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n🧪 Test {i}: {test_case['desc']}")
        print(f"Username: '{test_case['username']}'")
        
        register_data = {
            "email": test_case["email"],
            "username": test_case["username"],
            "password": "SecurePassword123!"
        }
        
        try:
            resp = requests.post(
                f"{base_url}/users/register",
                json=register_data,
                headers={"Content-Type": "application/json"}
            )
            
            print(f"Status: {resp.status_code}")
            if resp.status_code != 201:
                print(f"Response: {resp.text}")
            else:
                print("✅ Success")
                
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("🔧 Test Guide Login Flow Debug")
    print("=" * 60)
    
    # Test 1: Replicate exact test guide flow
    print("\n🧪 Test 1: Exact test guide replication")
    email, password = create_test_user_debug()
    
    if email and password:
        test_login_flow(email, password)
    
    # Test 2: Simpler username
    print("\n\n🧪 Test 2: Simpler username test")
    email2, password2 = test_simpler_user()
    
    if email2 and password2:
        test_login_flow(email2, password2)
    
    # Test 3: Validation limits
    print("\n\n🧪 Test 3: Username validation limits")
    test_validation_limits()
    
    print("\n✅ Debug complete!")