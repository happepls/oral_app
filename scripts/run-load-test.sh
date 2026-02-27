#!/bin/bash

# Load Test Script for Oral AI Application
# This script performs basic load testing on the application

set -e

echo "Starting load tests for Oral AI Application..."

# Check if artillery is installed
if ! command -v artillery &> /dev/null; then
    echo "Artillery not found. Installing..."
    npm install -g artillery
fi

# Create a basic load test scenario
cat > /tmp/load-test.yaml << EOF
config:
  target: 'http://localhost:8080'
  phases:
    - duration: 60
      arrivalRate: 5
      name: Warm up phase
    - duration: 120
      arrivalRate: 10
      name: Sustained load
    - duration: 60
      arrivalRate: 20
      name: Spike phase
scenarios:
  - name: "Health check"
    weight: 2
    flow:
      - get:
          url: "/health"
  - name: "User registration simulation"
    weight: 1
    flow:
      - post:
          url: "/api/users/register"
          json:
            email: "{{ profile.email }}"
            username: "{{ profile.username }}"
            password: "{{ profile.password }}"
          capture:
            - json: "$.data.token"
              as: "token"
        # Only proceed if registration is successful
        - get:
            url: "/api/users/profile"
            headers:
              Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: 200
  - name: "API endpoint check"
    weight: 3
    flow:
      - get:
          url: "/api/users/health"
EOF

# Run the load test
echo "Running load test..."
artillery run /tmp/load-test.yaml

# Clean up
rm /tmp/load-test.yaml

echo "Load testing completed."