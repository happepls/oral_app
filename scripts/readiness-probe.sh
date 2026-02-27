#!/bin/bash

# Readiness Probe Script for Oral AI Application
# This script checks if the application is ready to serve traffic

set -e

SERVICE_NAME=$1
HEALTH_URL=$2

if [ -z "$SERVICE_NAME" ] || [ -z "$HEALTH_URL" ]; then
    echo "Usage: $0 <service-name> <health-url>"
    echo "Example: $0 user-service http://localhost:3000/api/health"
    exit 1
fi

echo "Checking readiness of $SERVICE_NAME at $HEALTH_URL..."

# Try to reach the health endpoint
if curl -sf --connect-timeout 5 --max-time 10 "$HEALTH_URL" > /dev/null 2>&1; then
    echo "$SERVICE_NAME is ready"
    exit 0
else
    echo "$SERVICE_NAME is not ready"
    exit 1
fi