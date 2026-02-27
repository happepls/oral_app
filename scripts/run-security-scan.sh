#!/bin/bash

# Security Scan Script for Oral AI Application
# This script performs security scans on the application

set -e

echo "Starting security scans for Oral AI Application..."

# Run npm audit for dependency vulnerabilities
echo "Running npm audit on root project..."
npm audit --audit-level moderate

echo "Running npm audit on client..."
cd client
npm audit --audit-level moderate
cd ..

echo "Running npm audit on services..."
for service_dir in services/*/; do
    if [ -f "$service_dir/package.json" ]; then
        echo "Auditing $(basename $service_dir)..."
        cd "$service_dir"
        npm audit --audit-level moderate
        cd -
    fi
done

# If Docker is available, run container scans
if command -v docker &> /dev/null; then
    echo "Docker is available. Building and scanning images..."
    
    # Build images
    docker build -t oral-app-client ./client
    docker build -t oral-app-user-service ./services/user-service
    docker build -t oral-app-comms-service ./services/comms-service
    docker build -t oral-app-ai-omni-service ./services/ai-omni-service
    docker build -t oral-app-history-analytics-service ./services/history-analytics-service
    docker build -t oral-app-conversation-service ./services/conversation-service
    docker build -t oral-app-media-processing-service ./services/media-processing-service
    docker build -t oral-app-api-gateway ./api-gateway
    
    # Run Trivy scan if available
    if command -v trivy &> /dev/null; then
        echo "Trivy is available. Scanning Docker images..."
        
        trivy image oral-app-client
        trivy image oral-app-user-service
        trivy image oral-app-comms-service
        trivy image oral-app-ai-omni-service
        trivy image oral-app-history-analytics-service
        trivy image oral-app-conversation-service
        trivy image oral-app-media-processing-service
        trivy image oral-app-api-gateway
    else
        echo "Trivy not found. Skipping container vulnerability scans."
    fi
else
    echo "Docker not available. Skipping container scans."
fi

echo "Security scans completed."