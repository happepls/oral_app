#!/usr/bin/env python3
"""
Quick test for login functionality via API Gateway
"""

import requests
import json
import time

def quick_login_test():
    base_url = "http://localhost:8080/api"
    
    print("🚀 Quick Login Test via API Gateway")
    print("=" * 50)
    
    # Test 1: Direct user service (bypass gateway)
    print("\n📋 Test 1: Direct user service")
    try:
        resp = requests.post(
            "http://localhost:3002/login",
            json={"email": "test_integration_1771035166@example.com", "password": "SecurePassword123!"},
            headers={"Content-Type": "application/json"}
        )
        print(f"Direct login status: {resp.status_code}")
        if resp.status_code == 200:
            print("✅ Direct login successful")
        else:
            print(f"❌ Direct login failed: {resp.text}")
    except Exception as e:
        print(f"❌ Direct login error: {e}")
    
    # Test 2: Check API gateway routes
    print("\n📋 Test 2: Check API gateway routes")
    routes = [
        "/api/users/login",
        "/api/users/register",
        "/api/health"
    ]
    
    for route in routes:
        try:
            resp = requests.get(f"http://localhost:8080{route}")
            print(f"GET {route}: {resp.status_code}")
            if resp.status_code == 404:
                print(f"  ⚠️  Route not found")
            elif resp.status_code == 405:
                print(f"  ℹ️  Method not allowed (expected for POST routes)")
            else:
                print(f"  Response: {resp.text[:100]}...")
        except Exception as e:
            print(f"❌ Route check error for {route}: {e}")
    
    # Test 3: Test registration via gateway
    print("\n📋 Test 3: Registration via API gateway")
    timestamp = int(time.time())
    test_user = {
        "email": f"quick_test_{timestamp}@example.com",
        "username": f"quickuser_{timestamp}",
        "password": "SecurePassword123!"
    }
    
    try:
        resp = requests.post(
            f"{base_url}/users/register",
            json=test_user,
            headers={"Content-Type": "application/json"}
        )
        print(f"Gateway register status: {resp.status_code}")
        if resp.status_code == 201:
            print("✅ Gateway registration successful")
            result = resp.json()
            return result['data']['token']
        else:
            print(f"❌ Gateway registration failed: {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Gateway registration error: {e}")
        return None

if __name__ == "__main__":
    token = quick_login_test()
    
    if token:
        print(f"\n🎉 Success! Token: {token[:50]}...")
    else:
        print("\n⚠️  Issues found - need to fix API gateway routing")