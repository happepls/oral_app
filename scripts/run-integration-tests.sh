#!/bin/bash

# Integration Test Runner for Oral AI Application
# This script runs integration tests after deployment

set -e

echo "Starting integration tests for Oral AI Application..."

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 30

# Run health checks first
echo "Running health checks..."
./scripts/health-check.sh

if [ $? -ne 0 ]; then
    echo "Health checks failed. Aborting integration tests."
    exit 1
fi

echo "All services are healthy. Proceeding with integration tests..."

# Run integration tests
cd integration_tests

# Run all integration tests
python -m unittest discover -v

TEST_RESULT=$?

cd ..

if [ $TEST_RESULT -eq 0 ]; then
    echo "✓ All integration tests passed!"
    exit 0
else
    echo "✗ Some integration tests failed!"
    exit 1
fi