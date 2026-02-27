#!/bin/bash

# CI Test Suite for Oral AI Application
# This script runs all tests as part of the CI pipeline

set -e

echo "Starting CI test suite for Oral AI Application..."

# Run linting
echo "Running linting checks..."
npm run lint || echo "Linting issues found, please fix them"

cd client
npm run lint || echo "Client linting issues found, please fix them"
cd ..

# Run unit tests
echo "Running unit tests..."
npm test
cd client
npm test -- --passWithNoTests
cd ..

# Run security scan
echo "Running security scan..."
./scripts/run-security-scan.sh

# Run integration tests
echo "Running integration tests..."
./scripts/run-integration-tests.sh

echo "CI test suite completed successfully!"