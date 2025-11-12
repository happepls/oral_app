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
    *   Verified the user data was correctly written to the `users` and `user_identities` tables in the PostgreSQL database.
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
    *   **API Gateway & Network Debugging**: Investigated `api-gateway` and `comms-service` logs. Identified `api-gateway` `Connection refused` errors, indicating a Docker networking issue. Performed a full `docker compose down && docker compose up -d --build` to reset the network.
    *   **`ai-service` Crash (`TypeError: this.speechConfig.addTargetLanguage is not a function`)**: Diagnosed that `ConversationTranslator` requires `SpeechTranslationConfig`, not `SpeechConfig`. Fixed `azureAiService.js` to use `sdk.SpeechTranslationConfig.fromSubscription`.
    *   **`ai-service` Crash (`Invalid operation: the conversation is not in a connected state`)**: Identified a race condition where `startTranscribingAsync` was called before `joinConversationAsync` completed. Refactored `azureAiService.js` to use the success callback of `joinConversationAsync` to ensure proper sequencing.
    *   **`ai-service` Silent Failure (No ASR/TTS output)**: Suspected audio format mismatch. Inspected `client/public/audio-processor.js` to confirm client sends 16kHz, 16-bit, mono PCM. Explicitly configured `PushAudioInputStream` in `azureAiService.js` with `sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)`.
    *   **`ai-service` Silent Failure (No SDK logs)**: Attempted to enable verbose SDK logging via `sdk.LogLevel = sdk.LogLevel.Trace;`, which caused `TypeError: Cannot set property LogLevel of #<Object> which has only a getter`. Corrected to `this.speechConfig.setProperty(sdk.PropertyId.Speech_LogFilename, "/tmp/speech_sdk_log.txt");`.
    *   **`ai-service` Crash (`TypeError: this.speechConfig.getTargetLanguages is not a function`)**: Corrected syntax from `getTargetLanguages()` to `targetLanguages` property.
    *   **`ai-service` Crash (`SyntaxError: await is only valid in async functions`)**: Made `AzureAiService.initialize` method `async` and updated `index.js` to `await` its call.
    *   **`ai-service` Crash (`TypeError: tempRecognizer.getAuthorizationTokenAsync is not a function`)**: Replaced incorrect credential verification with a robust method that attempts to recognize a short, silent audio stream to force SDK connection and error reporting.
    *   **Critical Error (Incorrect SDK Migration)**: Discovered a major error where `azure-ai-voicelive` (Python SDK) was mistakenly used instead of `microsoft-cognitiveservices-speech-sdk` (Node.js SDK). Reverted `package.json` and `azureAiService.js` to use the correct `microsoft-cognitiveservices-speech-sdk`.
    *   **`ai-service` Crash (`ReferenceError: PORT is not defined`)**: Identified and removed a duplicate `server.listen` call in `ai-service/src/index.js` that was using an undefined `PORT` variable.
    *   **Successful ASR-TTS Audio Pipeline**: After extensive debugging, the core ASR-TTS audio pipeline is now functional. ASR text is visible in the `ai-service` logs, and TTS audio is audible on the client.

*   **Remaining Frontend Issues**:
    *   **Audio Decoding Error (`EncodingError`)**: Browser console shows `EncodingError: Unable to decode audio data`. This is because Azure sends raw PCM, but the browser's `decodeAudioData` expects a WAV header.
    *   **Missing ASR Text on UI**: ASR text is visible in backend logs but not displayed on the frontend page. This indicates a client-side parsing or rendering issue.

*   **Next Steps Identified**:
    1.  [Frontend] Fix ASR text not displaying in conversation history.
    2.  [AI Engine] Implement multi-language speech recognition.
    3.  [AI Engine] Integrate and refine the detailed 'Ava' persona and instructional strategies into the LLM prompt via `prompt/manager.js`.
## 2025-11-07

*   **Major Breakthrough: `recognized` Event Fixed:**
    *   **Problem**: The core issue of the Azure SDK's `recognized` event never firing for final speech-to-text results was a major blocker.
    *   **Investigation**: After multiple failed attempts, including client-side "push-to-talk" and server-side silence timers, the root cause was identified as the persistent nature of the `PushAudioInputStream`. The SDK treated all audio as a single, unending utterance.
    *   **Solution & Success**: The `ai-service` was refactored to create a new `SpeechRecognizer` instance for each utterance (i.e., each time the user speaks). This session-based approach provided a clear start and end for each recognition task, finally allowing the `recognized` event to fire reliably. This successfully unblocked the main development path.

*   **Architectural Pivot to `ConversationTranslator` & Subsequent Failures:**
    *   **Goal**: With the `recognized` event fixed, the next step was to implement multi-language support.
    *   **Decision**: To better support this, a major architectural decision was made to switch from the basic `SpeechRecognizer` to the more advanced `ConversationTranslator`.
    *   **Intensive & Unsuccessful Debugging**: This transition proved to be extremely challenging. A series of critical, and often misleading, `TypeError` exceptions occurred deep within the SDK's initialization logic. The debugging process involved:
        *   Incorrectly attempting to use a non-existent `SourceLanguageRecognizer`.
        *   Diagnosing and fixing configuration conflicts between `SpeechConfig` and `AutoDetectSourceLanguageConfig`.
        *   Multiple incorrect attempts to manage the `Conversation` and `ConversationTranslator` lifecycle, leading to a persistent `conversation is not in a connected state` error.
        *   Discovering and fixing incorrect API usage (e.g., calling `.close()` on an object that doesn't have it, calling `leaveConversation` on the wrong object, incorrect async operation order).

*   **Current Status & Next Steps:**
    *   **Blocker**: The `ai-service` is currently in a **non-functional state**. The final attempt to fix the `ConversationTranslator` lifecycle resulted in a new error: `TypeError: Cannot read properties of undefined (reading 'endConversationImplAsync')`.
    *   **Conclusion**: Today was a day of significant progress followed by a major setback. While the initial critical bug was solved, the subsequent architectural refactoring has failed. The immediate priority for the next session is to resolve the `ConversationTranslator` implementation issues by strictly adhering to a newly found, verified official code sample.
## 2025-11-08

*   **Major Breakthrough: ASR Pipeline Stabilized:**
    *   **Problem**: After the previous day's failed attempts with `ConversationTranslator`, the `ai-service` was left in a non-functional state, plagued by syntax errors and connection hangs.
    *   **Solution**: A strategic decision was made to pivot away from the complex `ConversationTranslator` and revert to the more fundamental `SpeechRecognizer`. This involved a major refactoring of `azureAiService.js` to focus solely on establishing a basic, reliable ASR (speech-to-text) pipeline.
    *   **Intensive Debugging & Resolution**:
        *   Fixed multiple critical syntax errors in `azureAiService.js` that were introduced during the rapid, unsuccessful refactoring attempts.
        *   Diagnosed and resolved the root cause of the persistent connection hang: the SDK's `fromSubscription` method was failing silently. The issue was definitively solved by implementing a robust, two-step authentication process: manually fetching an auth token via a REST call and then providing it to the SDK's `fromEndpoint` method.
        *   Identified and fixed a crucial Docker caching issue where code and `.env` changes were not being applied. A strict `docker compose down && docker rmi && docker compose up --build --force-recreate` workflow was enforced to guarantee a clean build.
*   **End-to-End Success & Verification:**
    *   **ASR Functional**: The simplified `SpeechRecognizer` approach worked perfectly. The `ai-service` now successfully connects to Azure and performs real-time speech recognition, as confirmed by `RECOGNIZED (final)` logs.
    *   **Frontend Integration**: Fixed a bug in `RealTimeRecorder.js` where AI responses were not being added to the conversation history.
    *   **Milestone Achieved**: The project now has a fully functional, end-to-end, real-time ASR pipeline. The user's speech is captured, sent to the backend, transcribed by Azure, and the text is correctly displayed in the frontend chat history.
*   **Next Steps Defined:**
    *   With the core pipeline stable, the next tasks are to enhance the frontend by ignoring empty messages, integrate the `MockLlmService` to make the AI conversational, and then re-approach multi-language support using the now-stable `SpeechRecognizer` as a foundation.

## 2025-11-11

*   **Architectural Pivot: Transition from Azure to Qwen3-Omni:**
    *   **Decision**: Made a strategic decision to replace the Azure AI Voice Services with the Qwen3-Omni multimodal AI engine for better integration and performance.
    *   **Implementation**:
        *   Removed all Azure-related dependencies and code from the `ai-service`, including `azureAiService.js` and associated environment variables.
        *   Updated `index.js` to use `Qwen3OmniService` as the sole AI engine, removing the conditional logic for selecting between Azure and Qwen3-Omni.
        *   Cleaned up `package.json` by removing the `microsoft-cognitiveservices-speech-sdk` dependency and adding `@xenova/transformers` for Qwen3-Omni integration.
        *   Updated `.env` and `.env.example` files to reflect the new Qwen3-Omni configuration.
        *   Created a new `qwen3OmniService.js` to manage the Qwen3-Omni API connection and handle real-time ASR, LLM, and TTS functionalities.
    *   **Verification**: Confirmed that the project now fully relies on Qwen3-Omni for AI services, with a simplified and more maintainable codebase.
*   **Documentation Updates**:
    *   Updated `GEMINI.md` to reflect the architectural changes and new project status.
    *   Updated `TODO.md` to mark the Azure removal task as complete and add new tasks related to Qwen3-Omni integration.
    *   Added today's work summary to `development_log.md`.