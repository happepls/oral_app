#!/bin/bash

# Health Check Script for Oral AI Application
# This script verifies that all services are running and responding to health checks

set -e

echo "Starting health checks for Oral AI Application..."

# Define service endpoints
declare -A SERVICES
SERVICES["api-gateway"]="http://localhost:8080/health"
SERVICES["user-service"]="http://localhost:3002/api/health"
SERVICES["comms-service"]="http://localhost:3001/health"
SERVICES["ai-omni-service"]="http://localhost:8082/health"
SERVICES["history-analytics-service"]="http://localhost:3004/health"
SERVICES["conversation-service"]="http://localhost:8083/health"
SERVICES["media-processing-service"]="http://localhost:3005/health"

# Function to check service health
check_service() {
    local name=$1
    local url=$2
    local status
    
    echo -n "Checking $name at $url... "
    
    status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$url")
    
    if [ "$status" -eq 200 ]; then
        echo "✓ Healthy (Status: $status)"
        return 0
    else
        echo "✗ Unhealthy (Status: $status)"
        return 1
    fi
}

# Check each service
all_healthy=true
for service in "${!SERVICES[@]}"; do
    if ! check_service "$service" "${SERVICES[$service]}"; then
        all_healthy=false
    fi
done

echo ""
if [ "$all_healthy" = true ]; then
    echo "✓ All services are healthy!"
    exit 0
else
    echo "✗ Some services are unhealthy"
    exit 1
fi