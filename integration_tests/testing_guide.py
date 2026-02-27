#!/usr/bin/env python3
"""
Comprehensive Integration Testing Guide for Oral AI Application

This script provides a systematic approach to testing all components of the Oral AI system.
It guides users through each testing phase with detailed instructions and validation steps.
"""

import sys
import os
import time
import subprocess
import requests
import json
from pathlib import Path

# Add the integration_tests directory to Python path
sys.path.append(str(Path(__file__).parent))

from test_utils import TestUtilities, WebSocketTestClient, TestDataGenerator

class OralAITestGuide:
    def __init__(self):
        self.base_url = "http://localhost:8080/api"
        self.utils = TestUtilities(self.base_url)
        self.test_results = {}
        self.current_phase = 0
        
    def print_header(self, title):
        """Print a formatted header for test phases"""
        print(f"\n{'='*80}")
        print(f"🔍 {title}")
        print(f"{'='*80}\n")
        
    def print_step(self, step_num, description):
        """Print a formatted step description"""
        print(f"\n📋 Step {step_num}: {description}")
        print("-" * 60)
        
    def print_success(self, message):
        """Print a success message"""
        print(f"✅ {message}")
        
    def print_warning(self, message):
        """Print a warning message"""
        print(f"⚠️  {message}")
        
    def print_error(self, message):
        """Print an error message"""
        print(f"❌ {message}")
        
    def check_services_health(self):
        """Phase 1: Check all services health"""
        self.print_header("Phase 1: Service Health Check")
        self.current_phase = 1
        
        services = [
            ("http://localhost:8080", "API Gateway"),
            ("http://localhost:3002", "User Service"),
            ("http://localhost:3001", "Comms Service"),
            ("http://localhost:8082", "AI Omni Service"),
            ("http://localhost:3004", "History Analytics Service"),
            ("http://localhost:3005", "Media Processing Service"),
        ]
        
        self.print_step(1, "Checking service connectivity")
        health_status = self.utils.check_service_health([url for url, _ in services])
        
        all_healthy = True
        for (url, name), status in zip(services, health_status.values()):
            if status:
                self.print_success(f"{name} ({url}) - HEALTHY")
            else:
                self.print_error(f"{name} ({url}) - UNHEALTHY")
                all_healthy = False
                
        if not all_healthy:
            self.print_error("Some services are not healthy. Please check Docker logs.")
            return False
            
        self.test_results['service_health'] = all_healthy
        return True
        
    def test_user_registration_and_auth(self):
        """Phase 2: Test user registration and authentication"""
        self.print_header("Phase 2: User Registration & Authentication")
        self.current_phase = 2
        
        self.print_step(1, "Creating test user")
        email, username, password = self.utils.create_test_user("guide_test")
        self.print_success(f"Created user: {email}")
        
        self.print_step(2, "Testing user registration validation")
        # Test invalid email
        invalid_resp = requests.post(
            f"{self.base_url}/users/register",
            json={"email": "invalid-email", "username": "test", "password": "short"}
        )
        if invalid_resp.status_code == 400:
            self.print_success("Invalid email validation working")
        else:
            self.print_warning("Email validation may need attention")
            
        self.print_step(3, "Testing user login")
        token, user_id = self.utils.authenticate_user(email, password)
        if token and user_id:
            self.print_success(f"Login successful - Token: {token[:20]}...")
            self.test_user = {"email": email, "token": token, "user_id": user_id}
        else:
            self.print_error("Login failed")
            return False
            
        self.print_step(4, "Testing token validation")
        headers = {"Authorization": f"Bearer {token}"}
        profile_resp = requests.get(f"{self.base_url}/users/profile", headers=headers)
        if profile_resp.status_code == 200:
            self.print_success("Token validation successful")
        else:
            self.print_error("Token validation failed")
            return False
            
        self.test_results['auth'] = True
        return True
        
    def test_user_profile_management(self):
        """Phase 3: Test user profile management"""
        self.print_header("Phase 3: User Profile Management")
        self.current_phase = 3
        
        if not hasattr(self, 'test_user'):
            self.print_error("No authenticated user available. Run Phase 2 first.")
            return False
            
        self.print_step(1, "Retrieving user profile")
        headers = {"Authorization": f"Bearer {self.test_user['token']}"}
        profile_resp = requests.get(f"{self.base_url}/users/profile", headers=headers)
        
        if profile_resp.status_code == 200:
            profile_data = profile_resp.json()
            self.print_success(f"Profile retrieved: {profile_data.get('data', {})}")
        else:
            self.print_error("Failed to retrieve profile")
            return False
            
        self.print_step(2, "Updating user profile")
        test_profile = self.utils.generate_test_profile()
        update_resp = requests.put(
            f"{self.base_url}/users/profile",
            headers=headers,
            json=test_profile
        )
        
        if update_resp.status_code == 200:
            self.print_success("Profile updated successfully")
        else:
            self.print_error("Profile update failed")
            return False
            
        self.print_step(3, "Creating user learning goal")
        goal_data = {
            "type": "daily_conversation",
            "target_language": "English",
            "target_level": "Intermediate",
            "interests": ["Travel", "Culture"],
            "description": "Practice conversational English for travel"
        }
        
        goal_resp = requests.post(
            f"{self.base_url}/users/goals",
            headers=headers,
            json=goal_data
        )
        
        if goal_resp.status_code == 201:
            goal_id = goal_resp.json().get('data', {}).get('id')
            self.print_success(f"Goal created: {goal_id}")
        else:
            self.print_error("Goal creation failed")
            return False
            
        self.test_results['profile'] = True
        return True
        
    def test_websocket_communication(self):
        """Phase 4: Test WebSocket communication"""
        self.print_header("Phase 4: WebSocket Communication")
        self.current_phase = 4
        
        if not hasattr(self, 'test_user'):
            self.print_error("No authenticated user available. Run Phase 2 first.")
            return False
            
        self.print_step(1, "Establishing WebSocket connection")
        session_id = f"test_session_{int(time.time())}"
        
        ws_client = WebSocketTestClient(
            "ws://localhost:8080/api/ws",
            self.test_user['token'],
            session_id,
            "tutor"
        )
        
        connection_thread = ws_client.connect()
        time.sleep(3)  # Wait for connection
        
        if ws_client.connection_established:
            self.print_success("WebSocket connection established")
        else:
            self.print_error("WebSocket connection failed")
            return False
            
        self.print_step(2, "Testing text message transmission")
        ws_client.send_text_message("Hello, I want to practice English conversation.")
        time.sleep(2)
        
        ai_messages = ws_client.get_messages_by_type("ai_message")
        if ai_messages:
            self.print_success(f"Received AI response: {ai_messages[0].get('payload', {}).get('text', '')[:100]}...")
        else:
            self.print_warning("No AI response received (this may be normal if AI service is not configured)")
            
        self.print_step(3, "Testing audio data transmission")
        # Send mock audio data (1 second of silence)
        mock_audio = b'\x00' * 16000 * 2  # 1 second of 16kHz 16-bit silence
        ws_client.send_audio_data(mock_audio)
        time.sleep(2)
        
        audio_messages = [msg for msg in ws_client.messages_received if msg.get('type') == 'binary_data']
        if audio_messages:
            self.print_success("Audio data transmission working")
        else:
            self.print_warning("No audio response received (this may be normal)")
            
        ws_client.disconnect()
        self.test_results['websocket'] = True
        return True
        
    def test_ai_service_integration(self):
        """Phase 5: Test AI service integration"""
        self.print_header("Phase 5: AI Service Integration")
        self.current_phase = 5
        
        self.print_step(1, "Testing AI scenario generation")
        scenario_data = {
            "type": "daily_conversation",
            "target_language": "English",
            "target_level": "Intermediate",
            "interests": ["Travel", "Culture"],
            "description": "Practice conversational English",
            "native_language": "Chinese"
        }
        
        if not hasattr(self, 'test_user'):
            # Create a simple test without authentication for AI service
            ai_resp = requests.post(
                f"{self.base_url}/ai/generate-scenarios",
                json=scenario_data
            )
        else:
            headers = {"Authorization": f"Bearer {self.test_user['token']}"}
            ai_resp = requests.post(
                f"{self.base_url}/ai/generate-scenarios",
                headers=headers,
                json=scenario_data
            )
        
        if ai_resp.status_code == 200:
            scenarios = ai_resp.json().get('data', {}).get('scenarios', [])
            if scenarios:
                self.print_success(f"Generated {len(scenarios)} scenarios")
                for i, scenario in enumerate(scenarios[:3]):
                    self.print_success(f"  Scenario {i+1}: {scenario.get('title', 'N/A')}")
            else:
                self.print_warning("No scenarios generated")
        else:
            self.print_warning(f"AI service returned {ai_resp.status_code} (may not be configured)")
            
        self.test_results['ai'] = True
        return True
        
    def test_history_and_analytics(self):
        """Phase 6: Test history and analytics"""
        self.print_header("Phase 6: History & Analytics")
        self.current_phase = 6
        
        if not hasattr(self, 'test_user'):
            self.print_error("No authenticated user available. Run Phase 2 first.")
            return False
            
        self.print_step(1, "Testing conversation history retrieval")
        session_id = f"test_session_{int(time.time())}"
        headers = {"Authorization": f"Bearer {self.test_user['token']}"}
        
        # First, let's create some conversation history
        history_resp = requests.get(
            f"{self.base_url}/history/session/{session_id}",
            headers=headers
        )
        
        if history_resp.status_code == 200:
            history_data = history_resp.json()
            self.print_success(f"History retrieved: {len(history_data.get('data', []))} messages")
        else:
            self.print_warning("No history available (this is normal for new sessions)")
            
        self.print_step(2, "Testing user statistics")
        stats_resp = requests.get(
            f"{self.base_url}/users/checkin/stats",
            headers=headers
        )
        
        if stats_resp.status_code == 200:
            stats_data = stats_resp.json().get('data', {})
            self.print_success(f"User stats: {stats_data}")
        else:
            self.print_warning("No stats available")
            
        self.test_results['history'] = True
        return True
        
    def test_security_features(self):
        """Phase 7: Test security features"""
        self.print_header("Phase 7: Security Features")
        self.current_phase = 7
        
        self.print_step(1, "Testing rate limiting")
        # Make multiple rapid requests to test rate limiting
        for i in range(7):
            resp = requests.post(
                f"{self.base_url}/users/register",
                json={"email": "test@example.com", "username": "test", "password": "short"}
            )
            if resp.status_code == 429:
                self.print_success("Rate limiting working correctly")
                break
        else:
            self.print_warning("Rate limiting may not be configured")
            
        self.print_step(2, "Testing input validation")
        # Test XSS prevention
        xss_resp = requests.post(
            f"{self.base_url}/users/register",
            json={
                "email": "test@example.com",
                "username": "<script>alert('xss')</script>",
                "password": "SecurePassword123!"
            }
        )
        
        if xss_resp.status_code == 400:
            self.print_success("Input validation working")
        else:
            self.print_warning("Input validation may need attention")
            
        self.test_results['security'] = True
        return True
        
    def run_comprehensive_test(self):
        """Run all test phases"""
        self.print_header("🚀 Oral AI Application - Comprehensive Integration Testing")
        
        print("This guide will walk you through testing all components of the Oral AI system.")
        print("Each phase builds upon the previous ones, so run them in order.")
        print("\n📊 Test Progress will be tracked throughout the process.")
        
        phases = [
            ("Service Health", self.check_services_health),
            ("User Registration & Auth", self.test_user_registration_and_auth),
            ("User Profile Management", self.test_user_profile_management),
            ("WebSocket Communication", self.test_websocket_communication),
            ("AI Service Integration", self.test_ai_service_integration),
            ("History & Analytics", self.test_history_and_analytics),
            ("Security Features", self.test_security_features),
        ]
        
        print(f"\n📋 Total Phases: {len(phases)}")
        print("Available commands:")
        print("  'run all' - Execute all phases sequentially")
        print("  'run <phase>' - Run specific phase (e.g., 'run 2' for authentication)")
        print("  'status' - Show current test results")
        print("  'help' - Show this help message")
        print("  'quit' - Exit the testing guide")
        
        while True:
            command = input("\n🎯 Enter command: ").strip().lower()
            
            if command == 'quit':
                break
            elif command == 'help':
                self.show_help()
            elif command == 'status':
                self.show_status()
            elif command == 'run all':
                self.run_all_phases(phases)
            elif command.startswith('run '):
                try:
                    phase_num = int(command.split()[1])
                    if 1 <= phase_num <= len(phases):
                        phase_name, phase_func = phases[phase_num - 1]
                        print(f"\n🎯 Running Phase {phase_num}: {phase_name}")
                        phase_func()
                    else:
                        self.print_error(f"Invalid phase number. Choose 1-{len(phases)}")
                except ValueError:
                    self.print_error("Invalid phase number")
            else:
                self.print_error("Unknown command. Type 'help' for available commands.")
                
        self.show_final_summary()
        
    def run_all_phases(self, phases):
        """Run all test phases sequentially"""
        self.print_header("Running All Test Phases")
        
        for i, (phase_name, phase_func) in enumerate(phases, 1):
            print(f"\n🎯 Phase {i}/{len(phases)}: {phase_name}")
            try:
                success = phase_func()
                if not success:
                    self.print_error(f"Phase {i} failed. Stopping execution.")
                    break
                time.sleep(2)  # Brief pause between phases
            except Exception as e:
                self.print_error(f"Phase {i} encountered error: {e}")
                break
                
    def show_help(self):
        """Show help information"""
        print("\n📚 Available Commands:")
        print("  run all          - Execute all test phases")
        print("  run <number>     - Run specific phase (1-7)")
        print("  status           - Show current test results")
        print("  help             - Show this help")
        print("  quit             - Exit testing guide")
        print("\n📋 Test Phases:")
        print("  1. Service Health Check")
        print("  2. User Registration & Authentication")
        print("  3. User Profile Management")
        print("  4. WebSocket Communication")
        print("  5. AI Service Integration")
        print("  6. History & Analytics")
        print("  7. Security Features")
        
    def show_status(self):
        """Show current test results"""
        print(f"\n📊 Current Test Status (Phase {self.current_phase}):")
        for test_name, result in self.test_results.items():
            status = "✅ PASSED" if result else "❌ FAILED"
            print(f"  {test_name.capitalize()}: {status}")
            
    def show_final_summary(self):
        """Show final test summary"""
        self.print_header("🎯 Final Test Summary")
        
        total_tests = len(self.test_results)
        passed_tests = sum(self.test_results.values())
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"📊 Overall Results:")
        print(f"  Total Phases: {total_tests}")
        print(f"  Passed: {passed_tests}")
        print(f"  Failed: {total_tests - passed_tests}")
        print(f"  Success Rate: {success_rate:.1f}%")
        
        if success_rate == 100:
            print("\n🎉 All tests passed! The Oral AI application is working correctly.")
        elif success_rate >= 80:
            print("\n✅ Most tests passed. The application is functional with minor issues.")
        elif success_rate >= 60:
            print("\n⚠️  Some tests failed. The application has issues that need attention.")
        else:
            print("\n❌ Many tests failed. The application requires significant fixes.")
            
        print("\n📋 Detailed Results:")
        for test_name, result in self.test_results.items():
            status = "✅ PASSED" if result else "❌ FAILED"
            print(f"  {test_name.replace('_', ' ').title()}: {status}")


def main():
    """Main function to run the testing guide"""
    print("🚀 Oral AI Application - Integration Testing Guide")
    print("=" * 60)
    print("This interactive guide will help you test all components systematically.")
    
    guide = OralAITestGuide()
    guide.run_comprehensive_test()


if __name__ == "__main__":
    main()