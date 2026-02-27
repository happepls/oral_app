#!/bin/bash

# Troubleshooting script for WebSocket connection issues in Oral AI application

echo "==========================================="
echo "Oral AI WebSocket Connection Troubleshooting"
echo "==========================================="

echo
echo "1. Checking if all services are running..."
docker ps | grep oral_app

echo
echo "2. Checking service logs for errors..."

echo
echo "AI Omni Service logs:"
docker logs oral_app_ai_omni_service 2>&1 | tail -20

echo
echo "Comms Service logs:"
docker logs oral_app_comms_service 2>&1 | tail -20

echo
echo "API Gateway logs:"
docker logs oral_app_api_gateway 2>&1 | tail -20

echo
echo "3. Testing internal service connectivity..."

# Create a temporary container to test connectivity
docker run --network oral_app_oral_app_net --rm -it busybox sh -c "
  echo 'Testing connectivity to ai-omni-service:8082...'
  echo -e 'GET /health HTTP/1.1\r\nHost: ai-omni-service:8082\r\nConnection: close\r\n\r\n' | nc ai-omni-service 8082
  
  echo
  echo 'Testing connectivity to comms-service:8080...'
  echo -e 'GET /health HTTP/1.1\r\nHost: comms-service:8080\r\nConnection: close\r\n\r\n' | nc comms-service 8080
"

echo
echo "4. Checking environment variables in comms service..."
docker exec oral_app_comms_service env | grep AI_SERVICE

echo
echo "5. Checking if the AI service has a valid API key configured..."
API_KEY_EXISTS=$(docker exec oral_app_ai_omni_service bash -c "env | grep QWEN3_OMNI_API_KEY" | wc -l)
if [ $API_KEY_EXISTS -gt 0 ]; then
    echo "✓ AI API key is configured"
else
    echo "✗ AI API key is not configured"
fi

echo
echo "==========================================="
echo "Troubleshooting complete"
echo "==========================================="