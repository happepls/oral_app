# Oral AI Project Context for Qwen Code

## Project Overview
Oral AI is a 24/7 AI oral practice application aiming to provide deep personalization and real-time feedback.
Repository: `git@github.com:sjx1943/oral_app.git` (master branch)

## Architecture: SROP (Scalable Real-time Oral Practice)
- **Frontend**: React 19.2.0, Tailwind CSS, Material Symbols.
- **Backend**: Node.js Microservices (Express).
  - `api-gateway`: Nginx/Express (Port 8080)
  - `user-service`: User Auth/Management (Port 3002, Postgres)
  - `comms-service`: WebSocket Real-time comms (Port 3001 internal, 8080 external via WS)
  - `ai-omni-service`: Python Qwen3-Omni integration (Port 8082)
  - `history-analytics-service`: History storage (MongoDB) & Analytics
  - `media-processing-service`: Audio transcoding/storage (COS)
- **Database**: PostgreSQL (User data), MongoDB (Chat history), Redis (Cache).
- **AI**: Qwen3-Omni via DashScope SDK.

## Key Directories
- `client/`: React App
- `services/`: Microservices source code
- `api-gateway/`: Gateway config
- `docker-compose.yml`: Local dev orchestration

## Development Setup
- **Start Services**: `docker compose up -d --build`
- **Frontend Dev**: `cd client && npm start` (Port 5001)
- **Test Scenarios**: `source .venv/bin/activate && python test_client_scenario.py`

## Current Status (Feb 2026)
- **Features**: Proficiency Scoring, Scenario-based Training, Dynamic Curriculum, Real-time Task Tracking.
- **AI Integration**: Qwen3-Omni with streaming ASR/TTS.
- **Recent Fixes**: Scoring loop, Scenario logic, Interruption handling (barge-in), Bilingual strategy.

## Recent Issues and Solutions
- **WebSocket Connection Issue**: Fixed by updating the API Gateway WebSocket configuration and ensuring proper routing from frontend to comms-service to ai-omni-service
- **JWT Token Validation Issue**: Resolved by standardizing JWT_SECRET across all services and ensuring consistent token validation
- **Service Communication Issue**: Fixed by configuring correct USER_SERVICE_URL in ai-omni-service to allow proper user context fetching
- **Environment Configuration**: Ensured all services use consistent environment variables and network configurations
- **AI Response Persistence**: Fixed issue where AI responses disappeared after page refresh by modifying save logic in `Conversation.js` to include non-final AI messages in conversation history

## MCP Tools Configuration
- **Filesystem**: Configured for project root access.
- **Postgres**: Configured for local docker instance (`postgresql://user:password@localhost:5432/oral_app`).
- **Memory**: Enabled for maintaining session context.

## Guidelines
- Use `docker compose` (not `docker-compose`).
- Follow "Service-Oriented & Decoupled" architecture.
- Frontend uses WebSocket for both text and audio streaming.

## Security Enhancements (Feb 2026)
- **API Security**: Implemented comprehensive security middleware including rate limiting, JWT validation, input sanitization, CORS protection, and security headers
- **User Data Protection**: Added data encryption utilities for sensitive user information, password security enhancements, and session management
- **Authentication**: Enhanced JWT authentication with refresh tokens, token blacklisting, and role-based authorization
- **Input Validation**: Comprehensive input validation using express-validator with strict validation rules for registration, login, and API endpoints
- **Rate Limiting**: Multi-tier rate limiting for different endpoints (auth: 5/15min, general: 100/15min, API: 1000/15min)
- **Security Headers**: Implemented security headers including CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **Data Encryption**: AES-256-GCM encryption for sensitive user data with secure key management
- **Security Monitoring**: Request tracking, security logging, and automated security event detection
- **Docker Security**: Updated Docker configurations to use non-root users and secure defaults
- **Security Audit**: Created automated security audit script to identify vulnerabilities and track security improvements