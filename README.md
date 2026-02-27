# Oral AI - 24/7 AI Oral Practice Application

Repository for the Oral AI application - a 24/7 AI-powered platform for oral practice with deep personalization and real-time feedback.

## Architecture: SROP (Scalable Real-time Oral Practice)
- **Frontend**: React 19.2.0, Tailwind CSS, Material Symbols.
- **Backend**: Node.js Microservices (Express).
  - `api-gateway`: Nginx/Express (Port 8080)
  - `user-service`: User Auth/Management (Port 3002, Postgres)
  - `comms-service`: WebSocket Real-time comms (Port 3001 internal, 8080 external via WS)
  - `ai-omni-service`: Python Qwen3-Omni integration (Port 8082)
  - `history-analytics-service`: History storage (MongoDB) & Analytics
  - `conversation-service`: Conversation management (Port 8083, Redis/Postgres)
  - `media-processing-service`: Audio transcoding/storage (COS)
- **Database**: PostgreSQL (User data), MongoDB (Chat history), Redis (Cache).
- **AI**: Qwen3-Omni via DashScope SDK.

## CI/CD Pipeline
This project features a comprehensive CI/CD pipeline with:
- Automated testing (unit, integration, security)
- Docker image building and publishing
- Multi-environment deployments (dev, staging, production)
- Security scanning at multiple levels
- Health checks and monitoring
- Automated rollbacks

See [CI/CD Documentation](docs/cicd_pipeline.md) for detailed information.

## Key Features
- Proficiency Scoring
- Scenario-based Training
- Dynamic Curriculum
- Real-time Task Tracking
- Deep Personalization
- Real-time Feedback

## Development Setup
- **Start Services**: `docker compose up -d --build`
- **Frontend Dev**: `cd client && npm start` (Port 5001)
- **Test Scenarios**: `source .venv/bin/activate && python test_client_scenario.py`

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