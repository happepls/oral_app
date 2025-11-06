## In Progress

- [ ] [Frontend] Fix ASR text not displaying in conversation history.

## To Do

- [ ] [AI Engine] Implement multi-language speech recognition.
- [ ] [AI Engine] Integrate and refine the detailed 'Ava' persona and instructional strategies into the LLM prompt via `prompt/manager.js`.

## Backlog

- [ ] **Phase 4: Advanced Features & Optimization**
- [ ] 16. [Backend] Create History & Analytics Service: Implement asynchronous storage of conversations.
- [ ] 17. [Backend] Create Media Processing Service: Implement audio stream transcoding and storage to S3/OSS.
- [ ] 19. [Optimization] Performance testing and refinement of the end-to-end audio stream latency.
- [ ] [Backend] Complete API Endpoint Testing for User Service (Login, Update, etc.)
- [ ] [Docs] Update user_service/docs/schema.md documentation to align with the database table structure.

## Done

- [x] [AI Engine] Implement real-time TTS (Text-to-Speech) audio streaming from Azure AI to the client via comms-service.
- [x] **Phase 1: Foundation & Core Services**
- [x] 5. [Backend] Create Real-time Comms Layer: Setup WebSocket server.
- [x] 4. [Backend] Setup API Gateway: Configure routing for User Service.
- [x] [Architecture] Redesign AI Engine to support both pipelined (ASR+LLM+TTS) and unified multimodal models.
- [x] 1. [Data Persistence] Setup PostgreSQL/MongoDB and Redis instances.
- [x] 2. [Data Persistence] Define database schemas for User, Conversation, etc.
- [x] 3. [Backend] Create User Service: Implement user registration, login, JWT auth.
- [x] [Test] Verify JWT end-to-end authentication and session creation flow via temporary HTTP endpoint.
- [x] [Debug] Fixed 'ws' server 'connection' event not firing by changing base image to node:18-slim.
- [x] **Phase 2: AI Integration & Core Logic**
- [x] 6. [Backend] Create AI Service Layer (AI Engine): Abstract ASR/LLM/TTS interfaces.
- [x] 7. [AI Engine] Design and implement a Prompt Management module to dynamically construct prompts using user profile, conversation history, and learning goals.
- [x] 8.[Backend] Integrate a mocked or preliminary AI service for initial testing.
- [x] 9.[Backend] Create Conversation Service: Manage conversation state and orchestrate calls between Comms Layer and AI Layer.
- [x] 10.[API Gateway] Add routing for WebSocket connections and Conversation Service.
- [x] 11. [Frontend] Scaffold React/Mobile client application.
- [x] 12. [Frontend] Implement user authentication flow (login/register pages).
- [x] [Debug] Resolve persistent HMR WebSocket connection issue in proxy environment.
- [x] **Phase 3: Client-side Development**
- [x] 13. [Frontend] Implement real-time audio capture using AudioWorklet.
- [x] 14. [Frontend] Implement WebSocket connection to the backend.
- [x] 15. [Frontend] Implement audio streaming to the backend and playback of received audio.
- [x] [AI Engine] Create a new `azureAiService.js` in `ai-service` to manage the Azure AI Voice Live API connection.
- [x] [AI Engine] Implement WebSocket connection logic to the Azure AI endpoint within `azureAiService.js`.
- [x] [AI Engine] Handle the real-time audio stream from `comms-service` and forward it to the Azure AI service.
- [x] [AI Engine] Integrate `azureAiService.js` into the main `ai-service` logic to replace the mock service.
- [x] [AI Engine] Process real-time responses (audio and text) from Azure AI and forward them back to the client via `comms-service`.

