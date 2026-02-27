# Oral AI Application - Integration Test Suite Documentation

## Overview

This document describes the comprehensive integration test suite for the Oral AI application. The test suite validates the functionality of the complete microservice architecture, ensuring all components work together seamlessly.

## Architecture Context

The Oral AI application follows the SROP (Scalable Real-time Oral Practice) architecture with the following key services:
- **Frontend**: React 19.2.0 with Tailwind CSS
- **API Gateway**: Nginx/Express (Port 8080)
- **User Service**: User Auth/Management (Port 3002)
- **Comms Service**: WebSocket Real-time communications (Port 3001 internal, 8080 external)
- **AI Omni Service**: Python Qwen3-Omni integration (Port 8082)
- **History Analytics Service**: Chat history & Analytics (Port 3004)
- **Media Processing Service**: Audio transcoding/storage (Port 3005)
- **Databases**: PostgreSQL (User data), MongoDB (Chat history), Redis (Cache)

## Test Suite Structure

The integration test suite is organized into the following categories:

### 1. User Service Integration Tests (`user_service_test.py`)
- User registration and login functionality
- Profile management operations
- User goal creation and retrieval
- Cross-service user data consistency

### 2. Authentication Integration Tests (`auth_test.py`)
- JWT token generation and validation
- Token expiration handling
- Cross-service token validation
- Concurrent request handling with same token

### 3. WebSocket Communication Tests (`websocket_test.py`)
- WebSocket connection establishment
- Session handshake with authentication
- Text and binary audio data transmission
- Ping/pong heartbeat mechanism
- Session persistence across reconnects
- User interruption handling

### 4. AI Service Integration Tests (`ai_service_test.py`)
- AI model availability and responsiveness
- Response quality for different scenarios
- Role adaptation based on context
- Context preservation across exchanges
- Personalization based on user profile
- Multilingual capability
- Response timing validation

### 5. History Analytics Service Tests (`history_analytics_test.py`)
- Conversation history storage
- User statistics and analytics retrieval
- Conversation summary generation
- Proficiency tracking
- Audio recording storage and retrieval
- Historical data querying with filters

### 6. Media Processing Service Tests (`media_processing_test.py`)
- Audio upload and transcoding
- Audio format conversion
- Media metadata storage
- Real-time audio streaming
- Error handling for media processing

### 7. End-to-End Scenario Tests (`e2e_scenario_test.py`)
- Complete user journey validation
- Multi-scenario learning flows
- Interruption and recovery flows
- Audio practice sessions
- Goal achievement workflows
- Session continuation across connections

### 8. Test Utilities (`test_utils.py`)
- Common utility functions
- WebSocket test client wrapper
- Test data generators
- Service health checks

## Running the Tests

### Prerequisites
- Docker and Docker Compose installed
- Python 3.8+ with required packages
- All services running in containers

### Setup
1. Ensure all services are running:
   ```bash
   docker-compose up -d --build
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Execution Methods

#### Method 1: Run All Tests
```bash
cd integration_tests
python -m pytest
```

#### Method 2: Run Specific Test File
```bash
python user_service_test.py
```

#### Method 3: Run with Test Runner
```bash
python test_runner.py
```

#### Method 4: Run Individual Test Classes
```bash
python -m unittest integration_tests.auth_test.AuthenticationIntegrationTest
```

## Test Coverage

The integration test suite provides coverage for:

### Functional Areas
- User lifecycle (registration → profile setup → goal setting → practice → analytics)
- Real-time communication (WebSocket connections, audio streaming)
- AI interaction (responses, context management, personalization)
- Data persistence (user profiles, conversation history, analytics)
- Authentication and authorization across services

### Quality Attributes
- Reliability: Error handling and recovery scenarios
- Performance: Response time validation
- Scalability: Concurrent user simulation
- Security: Authentication and authorization validation

### Edge Cases
- Service unavailability and fallbacks
- Network interruptions and reconnections
- Invalid input handling
- Session persistence across failures

## Test Data Management

### User Data
- Unique test users are created for each test run
- Users are cleaned up after test completion
- Profile data is randomized to test different scenarios

### Conversation Data
- Conversations are simulated with realistic dialogues
- Audio data is mocked where necessary
- Session IDs are managed to test continuity

## Expected Test Results

### Success Criteria
- All tests should pass in a healthy system
- Response times should meet defined SLAs
- No memory leaks or resource accumulation
- Proper error handling without system crashes

### Failure Indicators
- HTTP 5xx errors in service communication
- WebSocket connection failures
- Timeout errors in AI responses
- Data inconsistency across services

## Maintenance Guidelines

### Adding New Tests
1. Follow the existing test structure and naming conventions
2. Use the provided test utilities where applicable
3. Ensure tests are isolated and don't depend on each other
4. Clean up resources after test execution

### Updating Tests
1. Update tests when service APIs change
2. Maintain backward compatibility where possible
3. Update documentation when test scope changes

### Troubleshooting
1. Check service logs if tests fail
2. Verify Docker containers are running
3. Ensure proper network connectivity between services
4. Validate environment configuration

## Continuous Integration

The test suite is designed to run in CI/CD pipelines:
- Fast execution with parallelizable tests
- Clear failure reporting
- Minimal external dependencies
- Idempotent test execution

## Performance Benchmarks

The following benchmarks are validated by the test suite:
- WebSocket connection establishment: < 2 seconds
- AI response time: < 5 seconds for simple queries
- User registration/login: < 1 second
- Profile update: < 1 second

## Security Considerations

Tests validate:
- Proper JWT token validation across services
- Input sanitization
- Rate limiting effectiveness
- Secure communication between services

## Conclusion

This integration test suite provides comprehensive validation of the Oral AI application's microservice architecture, ensuring all components work together reliably and efficiently. Regular execution of these tests helps maintain system quality and catch regressions early in the development cycle.