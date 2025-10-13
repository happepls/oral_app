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
    *   Conducted extensive end-to-end testing of the WebSocket connection, troubleshooting a series of errors including `404 Not Found`, `ETIMEDOUT`, and `Client network socket disconnected`.
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