# Tasks - TODO

## In Progress


## To Do


## Backlog
- [ ] **Phase 2: AI Integration & Core Logic**
- [x] 6. [Backend] Create AI Service Layer (AI Engine): Abstract ASR/LLM/TTS interfaces.
- [x] 7. [AI Engine] Design and implement a Prompt Management module to dynamically construct prompts using user profile, conversation history, and learning goals.
- [x] 8.[Backend] Integrate a mocked or preliminary AI service for initial testing.
- [ ] 9.[Backend] Create Conversation Service: Manage conversation state and orchestrate calls between Comms Layer and AI Layer.
- [ ] 10.[API Gateway] Add routing for WebSocket connections and Conversation Service.
- [ ] **Phase 3: Client-side Development**
- [ ] 11. [Frontend] Scaffold React/Mobile client application.
- [ ] 12. [Frontend] Implement user authentication flow (login/register pages).
- [ ] 13. [Frontend] Implement real-time audio capture using AudioWorklet.
- [ ] 14. [Frontend] Implement WebSocket connection to the backend.
- [ ] 15. [Frontend] Implement audio streaming to the backend and playback of received audio.
- [ ] **Phase 4: Advanced Features & Optimization**
- [ ] 16. [Backend] Create History & Analytics Service: Implement asynchronous storage of conversations.
- [ ] 17. [Backend] Create Media Processing Service: Implement audio stream transcoding and storage to S3/OSS.
- [ ] 18. [AI Engine] Research and integrate production-ready streaming ASR/LLM/TTS services.
- [ ] 19. [Optimization] Performance testing and refinement of the end-to-end audio stream latency.

- [ ] [Backend] Complete API Endpoint Testing for User Service (Login, Update, etc.)
- [ ] [Docs] Update user_service/docs/schema.md documentation to align with the database table structure.

## Done
- [ ] **Phase 1: Foundation & Core Services**
- [x] 5. [Backend] Create Real-time Comms Layer: Setup WebSocket server.
- [x] 4. [Backend] Setup API Gateway: Configure routing for User Service.
- [x] [Architecture] Redesign AI Engine to support both pipelined (ASR+LLM+TTS) and unified multimodal models.
- [x] 1. [Data Persistence] Setup PostgreSQL/MongoDB and Redis instances.
- [x] 2. [Data Persistence] Define database schemas for User, Conversation, etc.
- [x] 3. [Backend] Create User Service: Implement user registration, login, JWT auth.
