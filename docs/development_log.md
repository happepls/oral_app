# Development Log

## 2025-09-22

*   **Project Initialization & Planning:**
*   Finalized the SROP (Scalable Real-time Oral Practice) architecture as the core design.
*   Established a detailed, four-phase development plan in `docs/TODO.md`.
*   Added a critical task for a "Prompt Management Module" to ensure personalized AI interaction.
*   **Foundation & Data Persistence:**
*   Set up the local development environment using Docker.
*   Created a `docker-compose.yml` to manage PostgreSQL, MongoDB, and Redis services.
*   Successfully launched the required database and cache containers.
*   Defined the initial PostgreSQL database schema for the `user-service`, including support for third-party authentication (e.g., Google, Apple) and user-specific attributes like `native_language`.

## 2025-09-23

*   **User Service Implementation & Debugging:**
*   Completed the initial implementation of the `user-service` with registration and login logic.
*   Containerized the service using a `Dockerfile`.
*   **Intensive Docker Environment Troubleshooting:**
*   Diagnosed and resolved a persistent `Cannot find module 'dotenv'` error, which was caused by a corrupted local Docker cache that ignored `--no-cache` flags. The issue was bypassed by using a direct `docker build --no-cache` command.
*   Solved the subsequent `relation "users" does not exist` error by creating an `init.sql` script and configuring the `postgres` container to run it on startup.
*   Fixed a `password authentication failed` error by correcting a credentials mismatch between the `user-service`'s `.env` file and the `docker-compose.yml` configuration.
*   Resolved the final issue where configuration changes were not being applied on `docker compose restart` by performing a full `down` and `up` cycle to force a complete container recreation.
*   **Success & Verification:**
*   Successfully registered a new user via the `/api/users/register` endpoint, confirming the end-to-end functionality of the service.
*   Verified the user data was correctly written to the `users` and `user_ids` tables in the PostgreSQL database.
*   **Planning & Documentation:**
*   Updated the project `TODO.md` to mark the user service implementation as complete.
*   Added new backlog tasks for comprehensive API endpoint testing and for updating the `schema.md` documentation to match the current database structure.

## 2025-09-29

*   **Architecture Upgrade:**
*   Redesigned the AI Engine's architecture to support a flexible, hybrid model. The system can now accommodate both the traditional, pipelined approach (ASR -> LLM -> TTS) and a unified, end-to-end multimodal model (e.g., Qwen3-Omni).
*   Updated `GEMINI.md` and `docs/TODO.md` to reflect this key architectural decision.
*   **API Gateway Implementation:**
*   Successfully implemented and containerized an API Gateway using Nginx.
*   Configured the gateway to route all incoming traffic from `/api/users` to the `user-service`.
*   **Troubleshooting & Verification:**
*   Resolved a host port conflict by remapping the gateway's external port from `80` to `8080`.
*   Fine-tuned Nginx `location` and `proxy_pass` directives to ensure correct URL path rewriting.
*   Verified the end-to-end request flow (`curl -> api-gateway -> user-service`) is fully functional.
*   **Project Management:**
*   Marked the API Gateway setup task as complete in the project's `TODO.md`.

## 2025-09-30

*   **Real-time Communication Service:**
*   Created and containerized the new `comms-service` to handle WebSocket connections, laying the foundation for real-time interaction.
*   Updated `docker-compose.yml` to include the new service and configured the API Gateway to correctly route `/ws/` traffic.
*   **Intensive Network & Deployment Debugging:**
*   Resolved a critical Docker build failure (`EAI_AGAIN`) caused by DNS resolution issues within the build environment. The problem was definitively solved by configuring a fixed DNS for the Docker daemon.
*   Conducted extensive end-to-end testing of the WebSocket connection, troubleshooting a series of errors including `404 Not Found`, `ETIMOUT`, and `Client network socket disconnected`.
*   Successfully identified the root causes, which involved correcting a `depends_on` startup dependency in `docker-compose.yml` and fixing a typo in the external port mapping (28843 vs. 28443).
*   **Success & Verification:**
*   Achieved a successful WebSocket connection from an external server to the `comms-service`, confirming the entire communication path (WSS -> Host Nginx -> API Gateway -> Comms Service) is fully functional.
*   **Project Management:**
*   Marked the final task of Phase 1 as complete in `docs/TODO.md`. The project is now ready to proceed to Phase 2.

## 2025-10-10

*   **AI Service Implementation:**
*   Created the foundational structure for the new `ai-service`, including its Dockerfile, package.json, and basic Express server.
*   Added the new service to `docker-compose.yml` and configured the API Gateway to route `/api/ai/` traffic to it.
*   **Intensive Debugging & Verification:**
*   Diagnosed and resolved a complex routing and container update issue. The root cause was identified as `docker compose restart` not rebuilding images, which prevented code changes from being applied.
*   The issue was fixed by using `docker compose up -d --build`, which successfully updated the container with the latest code.
*   Verified the end-to-end connectivity from `curl` to the `api-gateway` and finally to the `ai-service`'s health check endpoint.
*   **Architecture & Interface Design:**
*   Based on the provided `voice_agent.py` example, designed and created abstract interfaces for the three core AI components: `StreamingAsrService`, `LlmService`, and `StreamingTtsService`. This establishes a clean, extensible architecture for future AI integrations.
*   **Project Management:**
*   Marked Task #6 as complete in `docs/TODO.md`, officially concluding the initial setup of the AI Service Layer.

## 2025-10-13

*   **Prompt Engineering Module:**
*   Designed and implemented a sophisticated `PromptManager` within the `ai-service`.
*   Based on critical user feedback, the module was refactored to be fully dynamic and multilingual. It now generates a `basePrompt` that establishes the AI's persona as a world-class language expert, tailored to the user's specific `targetLanguage`.
*   **Mock Service Integration:**
*   Created a `MockLlmService` to facilitate offline, cost-free testing of the AI service's internal logic.
*   This mock service successfully integrates with the `PromptManager` to build a complete, context-aware prompt.
*   **Verification & Testing:**
*   Conducted a unit test which confirmed that the `PromptManager` correctly constructs a detailed, personalized prompt using the user's profile, goals, and conversation history.
*   The test also verified that the `MockLlmService` correctly processes this data and returns a predictable, templated response.
*   **Project Management:**
*   Marked tasks #7 and #8 as complete in `docs/TODO.md`, signifying major progress in the AI Integration phase.


## 2025-10-14

*   **JWT End-to-End Test & Verification:**
*   **Strategy**: To circumvent a blocking WebSocket issue, a temporary HTTP endpoint (`/verify-and-init-session`) was implemented in the `comms-service`.
*   **Execution**: A full end-to-end test was performed, successfully creating a user, logging in to get a JWT, and using the token to create a session via the temporary endpoint.
*   **Success**: The test confirmed that the entire authentication and session creation flow (`api-gateway` -> `comms-service` -> `user-service` -> `conversation-service`) was working correctly.
*   **Issue Isolation**: The successful test definitively isolated the project's blocker to the WebSocket `connection` event handler not firing within the Docker environment.

*   **WebSocket `connection` Event Failure Resolution:**
*   **Goal**: Diagnose and fix the critical issue where the `ws` server in `comms-service` was not firing the `connection` event.
*   **Debugging Strategy & Execution:**
    *   **Code Minimization**: A minimal `debug.js` server confirmed the issue was environmental, not related to business logic.
    *   **Environment Analysis**: Hypothesized that the `node:18-alpine` base image had a compatibility issue with the `ws` library.
    *   **Solution**: Changed the `comms-service`'s `Dockerfile` base image from `node:18-alpine` to `node:18-slim`.
*   **Success & Verification**: The base image change immediately resolved the issue. The `connection` event now fires correctly for the main application.

*   **Conclusion**: The project's primary technical blocker is resolved. The real-time communication layer is fully functional, and all temporary test code has been reverted.

## 2025-10-17

*   **Client-side Development Kick-off (Phase 3):**
*   Initiated the first task of the client-side development phase.
*   **React Application Scaffolding:**
*   Successfully created the frontend application structure in the `client/` directory using `npx create-react-app`.
*   Updated the root `.gitignore` file to exclude the client's `node_modules` and `build` directories from version control.
*   **Verification:**
*   Launched the development server and confirmed that the default React application runs correctly on `http://localhost:3003`.
*   **Project Management:**
*   Marked task #11, "[Frontend] Scaffold React/Mobile client application," as complete in `docs/TODO.md`.

## 2025-10-20

*   **End-to-End User Authentication & Architecture Hardening:**
*   **Unified Ingress Architecture**: Solidified a robust, single-entry-point architecture using a host-level Nginx for SSL termination, which proxies all traffic to a containerized `api-gateway`. This gateway intelligently routes requests to the appropriate backend microservices or the frontend React server, completely eliminating CORS issues.
*   **Google SSO Implementation**: Successfully implemented and debugged the entire Google Sign-In flow. The final blocker was a `ReferenceError: pool is not defined` in the database model, which was resolved by aligning the Google sign-in logic with the existing database connection pattern.
*   **Traditional Authentication**: Implemented the full backend and frontend logic for traditional email/password registration and login, including API endpoint creation, frontend form handling, state management, and redirection.
*   **Verification**: Confirmed via end-to-end testing and direct database queries that both Google and traditional user registration/login flows are fully functional and correctly persist user data.
*   **HMR WebSocket Debugging & Resolution:**
*   **Problem**: Diagnosed a persistent WebSocket connection failure from the React development server's Hot Module Replacement (HMR) client when accessed through the Nginx reverse proxy. The client consistently tried to connect to the wrong port (`3000`) instead of the correct proxy port (e.g., `8443` or `28443`).
*   **Investigation & Failed Attempts**:
    1.  Identified that Nginx's `sub_filter` was the correct tool but was not working.
    2.  Hypothesized the `nginx:alpine` image was missing the necessary module. Created a `Dockerfile` to install `nginx-mod-http-subs-filter`, but the build failed as the package was not found in Alpine's repositories.
    3.  Switched the base image to `nginx:1.25-perl`, which includes the module statically. This caused a new error because the configuration tried to `load_module` for a module that was already built-in.
    4.  Removed the `load_module` directive, but the issue persisted. The `sub_filter` was still not rewriting the content.
*   **Root Cause & Solution**: Discovered that the `webpack-dev-server` was sending Gzip-compressed JavaScript files to the proxy. The `sub_filter` module cannot inspect or modify compressed content, so the rewrite rule was being silently ignored.
*   **Final Fix**: Added `proxy_set_header Accept-Encoding "";` to the Nginx configuration. This directive tells the upstream server (webpack) to send uncompressed content, allowing `sub_filter` to successfully find and replace the incorrect port number.
*   **Verification**: Confirmed that the WebSocket connection error is now fully resolved for both local (`localhost:8443`) and external (`ser74785.ddns.net:28443`) access.

## 2025-10-21

*   **Real-time Audio & Authenticated WebSocket Implementation (Tasks #13 & #14):**
*   **Audio Capture**: Successfully implemented real-time audio capture on the client-side using `AudioContext` and `AudioWorklet`. Added UI features to display live recording duration and verify PCM data content in the console.
*   **WebSocket Connection**: Established a WebSocket connection pipeline from the React client to the backend `comms-service`.
*   **Intensive End-to-End Debugging & Hardening:**
*   **Proxy & Routing**: Diagnosed and resolved a persistent WebSocket connection failure (Error 1006). After extensive testing, the root cause was determined to be an incorrect URL path. The issue was fixed by aligning the Nginx gateway configuration, frontend client code, and the official `GEMINI.md` specification to use the `/api/ws/` endpoint.
*   **Docker Build**: Solved a recurring Docker build failure where `npm install` would hang. The issue was bypassed by adopting a more robust strategy: installing dependencies on the host and copying the complete `node_modules` directory into the Docker image.
*   **JWT Authentication**: Implemented and fully debugged a temporary end-to-end JWT authentication mechanism for the WebSocket connection.
    *   Fixed a critical `invalid signature` error by synchronizing the `JWT_SECRET` environment variable between the `user-service` and `comms-service`.
    *   The final implementation passes the JWT from the client's `localStorage` as a URL query parameter to the `comms-service`, which now validates it internally.
*   **Frontend Stability**: Resolved a `Can't close an AudioContext twice` race condition by refactoring the `stopRecording` function to be idempotent, preventing application crashes during rapid start/stop operations.
*   **Success & Verification:**
*   Successfully verified that the client can establish a stable, authenticated WebSocket connection to the backend. The primary goals of tasks #13 and #14 are now complete. The project is fully prepared for implementing audio stream transmission.

## 2025-10-27

*   **End-to-End Audio Pipeline Verification (The "Echo Test"):**
*   **Goal**: Achieve and verify a complete, round-trip audio data flow from the client's microphone, through the entire backend infrastructure, and back to the client.
*   **Implementation & Debugging**:
    *   **Client-side Playback**: Implemented the `ws.onmessage` handler in the React client to receive binary audio data (`Blob`) from the server.
    *   **Local Loopback Disabled**: Removed the direct connection from the `AudioWorklet` to the local speakers (`audioContext.destination`) to ensure that any audible sound is a true echo from the server, not a local feedback loop.
    *   **Final Test**: Conducted a live test where spoken audio was captured, sent to the `ai-service` (acting as an echo server), and the same audio data was successfully received back in the client, confirmed by a `Blob` object appearing in the console logs.
*   **Success & Milestone**: This successful test confirms that the core real-time audio streaming pipeline is fully functional. This is a major project milestone and completes the final task of Phase 3. The project is now technically ready for the integration of actual ASR, LLM, and TTS services in the `ai-service`.
*   **Project Management**:
*   Marked the final client-side development task (#15) as complete in `docs/TODO.md`.
*   Replaced the generic AI integration task (#18) with a more detailed set of specific sub-tasks for integrating ASR, LLM, and TTS services, providing a clear roadmap for the next development phase.

## 2025-10-30

*   **Azure AI Voice Live API Integration (Phase 4 Kick-off):**
*   **Architectural Pivot**: Initiated a major architectural shift to integrate Microsoft Azure AI's real-time Voice Live API, replacing the previous plan for separate ASR, LLM, and TTS services. This aims for a more streamlined, low-latency, and integrated voice agent solution.
*   **Documentation Updates**:
    *   Updated `docs/TODO.md` to reflect the new Azure integration tasks, outlining the steps for creating a dedicated Azure AI service, managing WebSocket connections, handling data streams, and orchestrating the overall process.
    *   Updated `GEMINI.md` to document the architectural pivot, highlighting the benefits of the Azure Voice Live API and the new project status.
*   **`ai-service` Refactoring**:
    *   Modified `services/ai-service/package.json` to replace `assemblyai` with `microsoft-cognitiveservices-speech-sdk`.
    *   Created `services/ai-service/src/azure/azureAiService.js` to encapsulate the Azure AI Voice Live API logic.
    *   Refactored `services/ai-service/src/index.js` to integrate `AzureAiService`, replacing the mock ASR service and adapting to the asynchronous initialization and start/stop methods.
    *   Updated `azureAiService.js` to use `ConversationTranslator` for integrated ASR/LLM/TTS, handling `transcribed` and `synthesizing` events to send data back to the client via WebSocket.
*   **Environment Configuration**:
    *   Created `services/ai-service/.env.example` and `services/ai-service/.env` to manage Azure Speech API key and region.
*   **Cleanup**: Removed the obsolete `services/ai-service/src/asr` directory.
*   **Verification**: Confirmed `ai-service` is running via `docker ps` and logs, awaiting client connection for full Azure AI interaction verification.
*   **Real-time ASR & Frontend Display Achievement:**
*   **Problem Identification**: Diagnosed and resolved a critical `InvalidOperation: Payload must be ArrayBuffer` error in `ai-service` by implementing a `Buffer` to `ArrayBuffer` conversion for incoming audio data, ensuring Azure SDK compatibility.
*   **Communication Protocol Refinement**: Fixed `SyntaxError: Unexpected token 'W'` by standardizing `comms-service` welcome messages to JSON format and configuring `RealTimeRecorder.js` to handle `info` type messages gracefully.
*   **Robust Frontend Messaging**: Enhanced `RealTimeRecorder.js` to correctly distinguish and parse `Blob` (binary) messages from JSON messages, ensuring stable operation when both types of data are received.
*   **Successful ASR Integration & Echo TTS**: Achieved a major milestone: ASR recognition is fully functional, with real-time transcription displayed on the frontend. A temporary "echo" TTS mechanism is in place, where the AI service sends the recognized text back to the client as an AI response, providing immediate conversational feedback.
*   **End-to-End Flow Verified**: The complete real-time audio and text message flow from client microphone -> `ai-service` (ASR) -> `comms-service` -> `RealTimeRecorder.js` (display) has been successfully established and verified.

*   **Next Steps Identified:** The current focus will shift to implementing full real-time TTS audio streaming and developing a robust session management system.


## 2025-11-06

*   **Real-time ASR & TTS Pipeline Debugging and Refinement:**
*   **Initial Problem**: Frontend reported `NS_ERROR_WEBSOCKET_CONNECTION_REFUSED` and no conversation history.
*   **Diagnosis**: Identified that the `ai-service` was crashing due to an unhandled promise rejection in `azureAiService.js`.
*   **Fix**: Implemented proper error handling for the Azure SDK's `canceled` event, preventing crashes and providing informative logging.
*   **Further Issue**: Observed intermittent `conversationExpiry` events causing connection drops.
*   **Resolution**: Implemented automatic reconnection logic in `azureAiService.js` to handle conversation timeouts gracefully, ensuring a stable user experience.
*   **Verification**: Confirmed that the refined pipeline now maintains stable connections, handles errors gracefully, and provides continuous ASR and TTS functionality.

## 2025-11-13

*   **Omni Service Implementation & Mock Mode Development:**
*   **New Service Creation**: Created a new `omni-service` microservice to integrate with the Qwen3-Omni multimodal AI engine, following the SROP architecture principles.
*   **Core Functionality Implementation**:
    *   Implemented text processing API endpoint (`/api/process/text`)
    *   Implemented audio processing API endpoint (`/api/process/audio`)
    *   Implemented user context management endpoint (`/api/context`)
    *   Added health check endpoint (`/health`)
*   **Mock Mode Development**:
    *   Developed a comprehensive mock mode to simulate the Qwen3-Omni engine for development and testing
    *   Implemented simulated ASR results for audio processing
    *   Created mock text responses for text processing
    *   Added simulated voice synthesis capabilities
*   **Testing & Debugging**:
    *   Resolved issues with environment variable loading
    *   Fixed model initialization problems in containerized environments
    *   Implemented forced mock mode to bypass network-dependent model downloads
    *   Verified all API endpoints are functioning correctly with proper response formatting
*   **Documentation**:
    *   Created `GEMINI.md` to document project key points and architecture
    *   Updated development log with today's achievements
    *   Maintained TODO list for future tasks

*   **Next Steps Preparation**:
*   Prepared to integrate with actual Qwen3-Omni Docker image
*   Planned to disable mock mode for real functionality testing
*   Ready to conduct full end-to-end validation with real AI engine

## 2025-11-21

*   **AI Service Consolidation & Architecture Optimization**:
*   **Service Consolidation**: Successfully merged the separate `ai-service` and `omni-service` into a unified `ai-omni-service` to streamline the AI engine architecture and reduce operational complexity.
*   **Docker Compose Configuration**: Updated `docker-compose.yml` to replace the two separate services with the unified `ai-omni-service`, configuring it with appropriate port mappings (8081 for HTTP, 8082 for WebSocket) and dependencies.
*   **API Gateway Routing**: Refactored the `api-gateway/nginx.conf` to consolidate routing rules:
    *   Combined `/api/ai/` and `/api/omni/` routes to point to the unified `ai_omni_service`
    *   Updated WebSocket routing for both `/api/ai/ws/` and `/api/omni/ws/` endpoints
    *   Maintained backward compatibility while simplifying the routing configuration
*   **Communication Service Update**: Modified `comms-service/src/index.js` to update the AI service WebSocket connection URL from `ws://omni-service:8082/stream` to `ws://ai-omni-service:8082/stream`.
*   **Documentation Updates**:
    *   Updated `GEMINI.md` to reflect the consolidated service architecture
    *   Removed references to separate AI services and unified the documentation
    *   Updated directory structure and real-time communication flow descriptions
*   **Cleanup**: Removed the legacy `ai-service` and `omni-service` directories from the `services/` folder.
*   **Verification**: Confirmed that all configuration changes are consistent and the unified service architecture is ready for deployment.

*   **Architecture Benefits Achieved**:
*   **Simplified Deployment**: Single AI service instead of two separate services
*   **Reduced Resource Usage**: Consolidated container footprint
*   **Improved Maintainability**: Unified codebase and configuration
*   **Enhanced Scalability**: Single service can be scaled independently
*   **Streamlined Development**: Single codebase for all AI functionality

## 2025-11-25

*   **用户资料API修复与JWT认证优化**:
*   **问题诊断**: 发现前端调用`/api/user/profile`返回401错误，经检查确认API路径不匹配问题
*   **API路径修正**: 确认前端已使用正确的复数形式`/api/users/profile`，与后端路由配置匹配
*   **JWT认证问题定位**: 发现JWT token生成使用`{ id }`字段，而认证中间件和getProfile方法中尝试访问`{ userId }`字段的不一致问题
*   **认证中间件修复**: 修改`authMiddleware.js`，将注释和代码中的`userId`改为`id`，确保与JWT token字段一致
*   **用户控制器修复**: 修改`userController.js`中的getProfile方法，使用`req.user.id`而非`req.user.userId`
*   **服务重启与测试**: 重启user-service后，通过curl测试确认API正常工作，返回用户资料信息
*   **前端使用指导**: 确认用户应使用`userAPI.getProfile()`方法而非直接fetch调用，该方法已包含正确的认证头处理

## 2025-11-27

*   **Database Connection Fix & Verification:**
*   **Problem**: Diagnosed `getaddrinfo ENOTFOUND postgres` error in `user-service` logs, indicating a DNS resolution issue.
*   **Investigation**:
    *   Confirmed `user-service` environment variables (`DB_HOST`, `DB_USER`, etc.) were correctly set.
    *   PostgreSQL container logs showed it was ready for connections, but `user-service` reported "Connection terminated unexpectedly".
    *   Identified that `docker-compose.yml` was attempting to use environment variables (`${POSTGRES_DB}`) that were not explicitly defined in a project-level `.env` file or the shell environment.
*   **Solution**:
    *   Created a `.env` file at the project root (`./.env`) with `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` defined.
    *   Modified `docker-compose.yml` to explicitly load this root `.env` file for both the `postgres` and `user-service` containers.
    *   Restarted all Docker containers (`docker compose down && docker compose up -d --build`).
*   **Verification**: Executed a custom Node.js script (`check_postgres.js`) inside the `user-service` container, which successfully connected to PostgreSQL and logged "Successfully connected to PostgreSQL".
*   **Cleanup**: Removed the temporary `check_postgres.js` script.
*   **Outcome**: The database connection issue for the `user-service` has been fully resolved, and the application login should now function correctly.
*   **Session Management & Qwen3-Omni Integration:**
*   **Session Management**:
    *   Integrated Redis into `comms-service` for centralized session state management.
    *   Implemented logic to create session records in Redis with expiration times upon user WebSocket connection.
    *   Added cleanup mechanism to remove session data from Redis upon client disconnection.
    *   Updated `docker-compose.yml` to ensure `comms-service` depends on `redis`.
*   **Qwen3-Omni Integration**:
    *   Modified `ai-omni-service/src/index.js` to replace `MockAIService` with `Qwen3OmniService`.
    *   Configured `ai-omni-service` to use the real Qwen3-Omni engine for ASR, LLM, and TTS functionalities, replacing the mock implementation.
*   **Verification**: Docker containers restarted to apply new session management logic and Qwen3-Omni integration. End-to-end testing for Qwen3-Omni is the next step.
## 2025-12-09

*   **Qwen3-Omni Integration Progress:**
*   **Service Architecture**: Successfully consolidated ai-service and omni-service into unified ai-omni-service with proper WebSocket and HTTP endpoints
*   **Qwen3-Omni Client**: Implemented Qwen3OmniClient with DashScope SDK integration and fallback to local model loading
*   **Real-time Communication**: Established WebSocket streaming pipeline with proper audio/text message handling
*   **Conversation Management**: Implemented conversation history tracking and user context management
*   **Health Monitoring**: Added comprehensive health check endpoints showing service status and conversation history
*   **Testing**: Conducted end-to-end conversation tests, identified issues with DashScope SDK availability (package not accessible)
*   **Current Status**: Service running on port 8082 with health check on 8081, maintaining 4 conversation history entries but falling back to mock mode due to SDK access issues

## 2025-12-10

*   **AI Service Python Migration & Functionality Fixes (ai-omni-service):**
*   **Architecture Migration**: Successfully refactored `ai-omni-service` from Node.js to Python using FastAPI and Uvicorn.
*   **Dockerization & Dependencies**: Updated `Dockerfile` to `python:3.10-slim` base image, addressing `onnxruntime-node` glibc dependency issues. Cleaned up obsolete Node.js files (`package.json`, `src/`). Created `requirements.txt` and `app/` directory structure.
*   **DashScope SDK Integration**: Integrated `dashscope` Python SDK (`OmniRealtimeConversation`).
*   **Environment Variable Resolution**: Diagnosed and fixed the `TypeError: can only concatenate str (not "NoneType") to str` caused by `QWEN3_OMNI_API_KEY` not being correctly passed to the Docker container. Corrected `docker-compose.yml` to ensure proper environment variable loading.
*   **API/WebSocket Protocol Alignment**: Resolved port mismatch between `user-service` and Nginx API Gateway. Fixed WebSocket proxying in `api-gateway/nginx.conf` by correcting `proxy_pass` paths and consolidating CORS headers to the `http` block.
*   **SDK API Call Fixes**:
    *   Resolved `AttributeError: 'OmniRealtimeConversation' object has no attribute 'send_text'` by replacing `send_text` with `update_session` for System Prompt injection.
    *   Fixed `TypeError: OmniRealtimeConversation.update_session() missing 1 required positional argument: 'output_modalities'` and `NameError: name 'MultiModality' is not defined` by correctly importing `MultiModality` and providing required arguments.
    *   **Crucially, resolved the "答非所问" (off-topic replies) issue**: Discovered that DashScope's `OmniRealtimeConversation` was not correctly processing `conversation.item.create` for user text input in a way that influenced subsequent responses. Implemented a workaround by passing user input directly as `instructions` to `conversation.create_response()`. This ensures the AI model immediately receives and responds to the user's current input.
*   **Real-time Event Mapping**: Corrected `on_event` logic to accurately map DashScope's `response.audio.delta` (audio) and `response.audio_transcript.delta` (text) events to the client's expected `audio_response` and `text_response` formats.
*   **Robustness**: Implemented automatic reconnection logic for DashScope connection loss (`websocket.WebSocketConnectionClosedException`, `BrokenPipeError`).

*   **Prompt Engineering Enhancement**:
*   Refined `PromptManager` module to generate a dynamic System Prompt, ensuring the AI model adheres to the "Oral Language Tutor" persona and contextually relevant responses. Removed misleading "initialization" directives from the prompt template to prevent repetitive greetings.

*   **Testing Tools & Verification**:
*   Created and refined `test_client.py` Python script to simulate multi-turn WebSocket conversations, including sending text messages, receiving streaming text and audio, and saving audio to `.pcm` files. This script was instrumental in diagnosing and verifying fixes throughout the day.
*   Conducted end-to-end `wscat` and `test_client.py` tests to validate all fixes, confirming successful connection, message exchange, and context-aware AI responses.

*   **Current Status**: All core `ai-omni-service` functionalities are verified: reliable WebSocket communication, context-aware multi-turn conversations with DashScope Qwen3-Omni, streaming audio, and robust error handling (reconnection). The service is ready for integration with the frontend application.


## 2025-12-15

*   **Frontend Optimization & History Interface:**
*   **Empty Message Filtering:** Updated `client/src/pages/Conversation.js` to strictly filter out empty or whitespace-only messages from both the user (ASR transcription) and the AI response, ensuring a cleaner conversation history.
*   **Conversation History Interface:**
    *   Enhanced `client/src/pages/Profile.js` by adding a "Conversation History" navigation item, fully utilizing the existing template design.
    *   Created a new `client/src/pages/History.js` page to display a list of past conversation sessions (currently using mock data), completing the history management UI flow.
    *   Registered the new `/history` route in `client/src/App.js`.
*   **Documentation:** Updated `docs/TODO.md` to reflect the completion of these frontend optimization tasks.

*   **Backend Service Refinement:**
*   **User Service API Testing & Update:** Implemented the `updateProfile` functionality in `services/user-service` (model, controller, routes) and successfully tested it via `curl`, ensuring full coverage for user profile management.
*   **History & Analytics Service Creation:**
    *   Created a new `services/history-analytics-service` (Node.js/Express) with MongoDB integration.
    *   Implemented `Conversation` schema (Mongoose) for storing detailed conversation history (messages, metrics, timestamps).
    *   Developed API endpoints for `saveConversation`, `getUserHistory`, and `getConversationDetail`.

## 2025-12-16

*   **Audio Quality & Stability Improvements:**
*   **Echo Cancellation (Test Script)**: Implemented software-based echo cancellation in `test_client.py` by pausing microphone capture while the AI is speaking, resolving the feedback loop issue where the AI would respond to its own voice.
*   **Audio Sample Rate Optimization**: Updated `test_client.py` to use a 24kHz sample rate for audio playback and capture, significantly improving the clarity and naturalness of the TTS output.
*   **Client-Side Audio Configuration**: Enhanced `client/src/components/RealTimeRecorder.js` to explicitly enable browser-native `echoCancellation`, `noiseSuppression`, and `autoGainControl` in the `getUserMedia` constraints, ensuring a robust audio experience for web users.

*   **AI Engine & Persona Refinement:**
*   **Prompt Engineering**: Redesigned the `PromptManager` in `ai-omni-service` to implement a specialized "Oral Communication Tutor" persona. The new system prompt prioritizes being a supportive "Language Partner," focuses on grammar and expression over pronunciation, and adapts its complexity based on the user's proficiency level.
*   **User Transcription Visibility**: Added specific event handling in `ai-omni-service/app/main.py` for `conversation.item.input_audio_transcription.completed`. This ensures that the user's speech-to-text (ASR) results are correctly captured and forwarded to the client, allowing users to see their own transcribed speech (`[me]`) in the interface.
*   **Debug Logging**: Enhanced the `ai-omni-service` logging to print full event payloads, facilitating easier debugging of DashScope API interactions.

*   **Frontend & Infrastructure Fixes:**
*   **WebSocket Protocol Alignment**: Refactored `client/src/pages/Conversation.js` to manage WebSocket connections directly and send text messages via the WebSocket protocol (`send_message`), replacing the deprecated and failing HTTP chat API.
*   **Nginx Routing Fix**: Corrected the `comms-service` upstream port in `api-gateway/nginx.conf` from 3000 to 8080 and standardized the WebSocket path to `/api/ws/`, resolving connection failures.
*   **Conversation History**: Implemented the `History.js` page with real API integration to fetch and display user conversation logs, and added logic to filter out empty messages.
*   **Responsive Design**: Verified that the application's mobile-first design (using Tailwind CSS `max-w-lg`) effectively supports mobile viewports.

## 2025-12-17

*   **Media Processing Service Implementation:**
*   Created `media-processing-service` (Node.js) to handle audio stream transcoding and storage.
*   Implemented file upload, transcoding to MP3 using `fluent-ffmpeg`, and upload to Tencent Cloud COS.
*   Configured `services/media-processing-service/.env.example` for COS credentials and bucket details.
*   Updated `docker-compose.yml` to include `media-processing-service` with appropriate port mapping and volume mounts.
*   Updated `api-gateway/nginx.conf` to route `/api/media/` requests to the new service.
*   **Dockerfile Optimization:** Implemented a multi-stage Docker build for `media-processing-service` to include a static FFmpeg binary, avoiding `apt-get` network issues during build.
*   **Comms Service Integration:** Modified `comms-service/src/index.js` to buffer audio chunks during a session and upload the full recording to `media-processing-service` upon session close.
*   **Dependency Management:** Added `form-data` to `comms-service/package.json` for file uploads.
*   **Docker Build Fixes:** Addressed `npm install` hanging issues in `conversation-service` and `history-analytics-service` by configuring their Dockerfiles to copy local `node_modules`.
*   **Documentation Updates:**
*   Updated `GEMINI.md` to reflect the new `media-processing-service` in the architecture and directory structure, and updated the object storage to Tencent Cloud COS.
*   Updated `docs/TODO.md` to mark the "Create media processing service" task as completed.


## 2025-12-18 开发日志

### 完成任务:
- **前端UI设计**：
    - 创建了 `Onboarding.js` (用户资料收集页面)。
    - 创建了 `GoalSetting.js` (目标设置页面)。
    - 更新了 `History.js`，支持显示会话总结和奖励。
    - 更新了 `client/src/App.js`，添加了 `Onboarding` 和 `GoalSetting` 页面的路由。
- **后端AI服务 (`ai-omni-service`) 优化**：
    - 修复了 `ai-omni-service` 的Docker构建问题，通过在宿主机下载 `manylinux2014_aarch64` wheels 并拷贝到容器内进行安装，解决了网络连接和架构不匹配的问题。
    - 改进了 `prompt_manager.py` 中 `InfoCollector` 的提示词，使其能够更智能地从用户输入中提取信息。
    - 更新了 `ai-omni-service/app/main.py`，实现了对LLM输出中JSON动作块的解析，并能调用相应的后端服务（如 `update_profile`, `save_summary`）。
    - 在WebSocket响应中包含了当前AI角色的信息，以便客户端显示。
- **客户端测试脚本 (`test_client.py`) 改进**：
    - 移除了 `websocket.closed` 的直接检查，依赖 `websockets` 库的异常处理机制。
    - 实现了自动重连功能，提高了长时间测试的稳定性。
    - 能够在接收到消息时显示当前AI的角色状态。

### 遇到的挑战与解决方案:
- Docker构建过程中 `apt-get` 和 `pip install` 因网络/DNS问题卡住：
    - **`apt-get`**：移除Dockerfile中对 `curl` 的 `apt-get` 安装，并修改健康检查为Python `urllib.request`。
    - **`pip install`**：发现宿主机与容器架构不匹配 (macOS `arm64` vs 容器默认 `arm64`，但之前误下了 `x86_64` wheels)。通过在宿主机下载 `manylinux2014_aarch64` 架构的Python wheels，并修改Dockerfile从本地wheels安装，彻底解决了Docker构建时的网络依赖问题。
- `test_client.py` 报错 `AttributeError: 'ClientConnection' object has no attribute 'closed'`：
    - 原因是 `websockets` 库版本兼容性问题，移除了不正确的 `websocket.closed` 属性检查，转而依赖 `ConnectionClosed` 异常捕获机制。


## 2025-12-21

*   **Oral Tutor Backend Flow Verification:**
  *   **Prompt Logic**: Verified the `InfoCollector` -> `GoalPlanner` -> `OralTutor` role transitions.
  *   **Action Execution**: Confirmed that the `InfoCollector` correctly triggers the `update_profile` action via the `user-service` API when all required information is collected.
  *   **Context Fetching**: Fixed issues with internal API calls (URL path mismatch) and null handling when fetching user context in `ai-omni-service`.

*   **AI GLM Service Initialization:**
  *   **Service Creation**: Created the skeleton for `ai-glm-service` (FastAPI) to support the pipelined AI engine approach.
  *   **Docker Build Strategy (Major Fix)**:
    *   Encountered severe network timeouts and dependency backtracking (hell) when building the Python environment inside Docker.
    *   **Solution**: Implemented a "Local Wheels Strategy". Created a script `download_heavy_wheels.py` to pre-download exact versions of heavy dependencies (Torch, Transformers, Numpy, Websockets) to a local `wheels/` directory using Aliyun mirrors.
    *   Modified `Dockerfile` to copy these wheels and install them offline (`--no-index --find-links=/wheels`), successfully bypassing all network issues.
  *   **Infrastructure**: Updated `docker-compose.yml` and `nginx.conf` to include the new service on port 8084.

*   **Next Steps**:
  *   Implement the actual GLM-ASR, LLM, and TTS model loading logic within `ai-glm-service`.

### 2025-12-25
- **Experimentation (Abandoned)**: Attempted to implement `ai-glm-service` using GLM-ASR-Nano-2512.
  - Encountered significant compatibility issues with `transformers` library due to missing custom model code in the official Hugging Face repository and ambiguous documentation.
  - While the VAD pipeline was successfully verified with a mock ASR, the actual GLM model loading proved blocking.
- **Decision**: Abandoned the `ai-glm-service` approach to focus resources on optimizing the existing `ai-omni-service` (Qwen-Omni based).
- **Cleanup**: Removed `services/ai-glm-service`, `test_glm_client.py`, and related configurations in `docker-compose.yml` and `nginx.conf`.


- **Test Client Improvements**:
  - Implemented 'Barge-in' feature: TTS playback is interrupted when user speech is detected.
  - Enhanced robustness: Client now attempts to reconnect on server errors.
  - Added support for local audio device ('sounddevice') for real-time voice testing.
- **Service Optimization**:
  - Added interaction logging to 'ai-omni-service' for better observability.
  - Cleaned up debug logs.

- **AI Omni Service Enhancement**:
  - Implemented **Dynamic Role Switching**: The service now re-evaluates the user's role (InfoCollector -> GoalPlanner -> OralTutor) after every successful action execution (e.g., profile update) by re-fetching the user context.
  - Added 'role_switch' event to notify the client of role changes.
  - Refactored `WebSocketCallback` to centralize role determination logic.

*   **Reliability & Testing Enhancements**:
    *   **Infinite Loop Fix**: Resolved a critical issue in `ai-omni-service` where the WebSocket loop would spin infinitely after a client disconnection or protocol error. Implemented robust error checking to break the loop on disconnection events.
    *   **Test Client Robustness**: Significantly improved `test_client.py`:
        *   Fixed an issue where role labels (`[OralTutor]`) were printed for every token, now displaying them only once per turn.
        *   Implemented a "Strict Mute" logic during TTS playback to prevent the microphone from capturing the AI's output (echo/self-talking), ensuring cleaner turn-taking.
        *   Enhanced WebSocket error handling to strictly treat server errors as connection failures, triggering the automatic reconnection logic.
- Refactored 'test_client_scenario.py' to Interactive Audio Client with Manual Commit mode.
- Disabled Server-side VAD in 'ai-omni-service' to support client-controlled turn management.
\n### 2025-12-30 Manual Mode & Protocol Fixes
- **Feature**: Implemented Manual Turn-Taking (Manual Commit) mode.
    - Disabled server-side VAD in `ai-omni-service` to prevent premature interruptions.
    - Refactored `test_client_scenario.py` to support interactive audio recording with explicit stop signal (Enter key).
- **Bug Fix**: Fixed Audio Stream Protocol mismatch.
    - `comms-service` now wraps `audioBuffer` in a `payload` object, matching `ai-omni-service`'s expectation.
    - Verified end-to-end audio flow: Client -> Comms -> AI -> Cloud.
- **Optimization**: Updated InfoCollector prompt to ask for "learning challenges" and merge them into `interests`.
- **Known Issue**: Investigating 500 Error on `PUT /profile` during automatic profile update.

### 2026-01-02 Stability & Onboarding Improvements
- **Stability Fixes (ai-omni-service)**:
    - **JSON Parsing**: Replaced fragile regex with robust bracket-matching to handle LLM JSON outputs (prevented crashes on malformed JSON).
    - **Auto-Reconnection**: Implemented logic to automatically reconnect to DashScope when session timeouts occur, ensuring long-running session stability.
    - **Connection Handling**: Fixed infinite loop issues and improved error logging for WebSocket disconnects.
- **Frontend & Onboarding**:
    - **Native Language Support**: Updated `Onboarding.js` to collect user's native language.
    - **Prompt Engineering**: Updated `InfoCollector` system prompt to dynamically use the user's native language for the initial interview.
- **Testing Enhancements**:
    - **Interruption Logic**: Implemented "Barge-in" logic in `test_client_scenario.py` (Mutes playback + Auto-Record + Double-Enter fix).
    - **Audio Safety**: Fixed `OSError: [Errno -9988]` in test client by implementing safe stream muting instead of closing/reopening streams during interruption.
- **Verification**: Verified `InfoCollector` flow and Interruption logic successfully.
