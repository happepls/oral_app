"""
Integration Test Runner for Oral AI Application

This module orchestrates the execution of all integration tests for the Oral AI application.
It handles service startup/shutdown, test execution, and reporting.
"""

import os
import sys
import unittest
import subprocess
import time
import signal
import requests
from pathlib import Path


class IntegrationTestRunner:
    def __init__(self):
        self.project_root = Path(__file__).parent.parent
        self.services_process = None
        self.test_results = []
        
    def start_services(self):
        """Start all required services using docker-compose"""
        print("Starting services using docker-compose...")
        try:
            # Start all services in detached mode
            self.services_process = subprocess.Popen(
                ["docker", "compose", "up", "-d", "--build"],
                cwd=self.project_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Wait for services to be ready
            print("Waiting for services to start...")
            time.sleep(30)  # Wait for services to initialize
            
            # Check if key services are running
            if not self.check_service_health():
                raise Exception("Services failed to start properly")
                
            print("All services started successfully!")
            return True
        except Exception as e:
            print(f"Error starting services: {e}")
            return False
    
    def check_service_health(self):
        """Check if key services are healthy"""
        services_to_check = [
            ("http://localhost:8080", "API Gateway"),
            ("http://localhost:3002", "User Service"),
            ("http://localhost:3001", "Comms Service"),
            ("http://localhost:8082", "AI Omni Service"),
            ("http://localhost:3004", "History Analytics Service"),
            ("http://localhost:3005", "Media Processing Service"),
        ]
        
        for url, name in services_to_check:
            try:
                response = requests.get(f"{url}/health", timeout=10)
                if response.status_code in [200, 404]:  # 404 is OK if health endpoint doesn't exist
                    print(f"✓ {name} is reachable")
                else:
                    print(f"✗ {name} returned status {response.status_code}")
                    return False
            except Exception as e:
                print(f"✗ {name} is not reachable: {e}")
                return False
        return True
    
    def stop_services(self):
        """Stop all services"""
        print("Stopping services...")
        try:
            subprocess.run(["docker", "compose", "down"], cwd=self.project_root, check=True)
            print("Services stopped successfully!")
        except Exception as e:
            print(f"Error stopping services: {e}")
    
    def run_tests(self, test_pattern="*_test.py"):
        """Run all integration tests matching the pattern"""
        print(f"Running integration tests matching pattern: {test_pattern}")
        
        # Discover and run tests
        loader = unittest.TestLoader()
        start_dir = self.project_root / "integration_tests"
        suite = loader.discover(start_dir, pattern=test_pattern)
        
        # Run tests and collect results
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        
        # Store results
        self.test_results = result
        
        return result.wasSuccessful()
    
    def run(self):
        """Main method to run the integration test suite"""
        success = False
        try:
            # Start services
            if not self.start_services():
                print("Failed to start services. Exiting.")
                return False
            
            # Run tests
            success = self.run_tests()
            
        except KeyboardInterrupt:
            print("\nTest execution interrupted by user.")
        except Exception as e:
            print(f"Error during test execution: {e}")
        finally:
            # Always stop services
            self.stop_services()
        
        print(f"\nIntegration test execution {'completed successfully' if success else 'failed'}!")
        return success


if __name__ == "__main__":
    runner = IntegrationTestRunner()
    success = runner.run()
    sys.exit(0 if success else 1)