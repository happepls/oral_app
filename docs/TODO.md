# Tasks - TODO

## In Progress

- [ ] [AI Engine] Integrate and refine the detailed 'Ava' persona and instructional strategies into the LLM prompt via `prompt/manager.js`.

## Phase 4: Qwen3-Omni 集成与高级功能开发

### 4.1 Qwen3-Omni 实时集成 (当前重点)
- [ ] [AI Engine] 实现 Qwen3-Omni 的实时 ASR、LLM 和 TTS 功能
- [ ] [AI Engine] 实现 Qwen3-Omni 的多语言语音识别支持
- [ ] [AI Engine] 处理来自 `comms-service` 的实时音频流并转发到 Qwen3-Omni 服务
- [ ] [AI Engine] 在 omni-service 中替换模拟模式为真实的 Qwen3-Omni API 调用
- [ ] [Testing] 使用真实的 Qwen3-Omni 引擎进行端到端测试（ModelScope 魔搭社区）

### 4.2 前端优化与用户体验
- [ ] [Frontend] 忽略对话历史中的空消息
- [ ] [Frontend] 实现对话历史管理界面
- [ ] [Frontend] 优化音频录制和播放的用户体验
- [ ] [Frontend] 添加多语言界面支持
- [ ] [Frontend] 实现响应式设计适配移动端

### 4.3 后端服务完善
- [ ] [Backend] 完成用户服务 API 端点测试（登录、更新等）
- [ ] [Backend] 创建历史与分析服务：实现对话的异步存储
- [ ] [Backend] 创建媒体处理服务：实现音频流转码和 S3/OSS 存储
- [ ] [Backend] 实现用户个性化设置管理
- [ ] [Backend] 添加对话质量评估和反馈机制

### 4.4 性能优化与监控
- [ ] [Optimization] 端到端音频流延迟的性能测试和优化
- [ ] [Optimization] 实现音频流缓冲和网络自适应机制
- [ ] [Monitoring] 添加服务健康监控和告警
- [ ] [Monitoring] 实现用户行为分析和性能指标收集
- [ ] [Security] 增强 API 安全性和用户数据保护

### 4.5 文档与部署
- [ ] [Docs] 更新 user_service/docs/schema.md 文档以对齐数据库表结构
- [ ] [Docs] 编写 API 文档和使用指南
- [ ] [Deployment] 完善 Docker Compose 部署配置
- [ ] [Deployment] 实现 CI/CD 流水线自动化
- [ ] [Testing] 编写完整的集成测试套件

## Done


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
- [x] [AI Engine] Implement real-time TTS (Text-to-Speech) audio streaming from Azure AI to the client via comms-service.
- [x] [Frontend] Fix ASR text not displaying in conversation history.
- [x] [AI Engine] Replace Azure AI Service with Qwen3-Omni multimodal AI engine.
- [x] **Phase 4: Qwen3-Omni Integration**
- [x] [AI Engine] Create omni-service microservice with Qwen3-Omni integration.
- [x] [AI Engine] Implement text processing API endpoint in omni-service.
- [x] [AI Engine] Implement audio processing API endpoint in omni-service.
- [x] [AI Engine] Implement user context management in omni-service.
- [x] [AI Engine] Implement mock mode for Qwen3-Omni engine for development and testing.
- [x] [Testing] Verify all omni-service API endpoints are functioning correctly.
- [x] [Debug] Resolve environment variable loading issues in omni-service.
- [x] [Debug] Fix model initialization problems in containerized environments.
- [x] [Architecture] Consolidate ai-service and omni-service into unified ai-omni-service.
- [x] [Docker] Update docker-compose.yml with unified ai-omni-service configuration.
- [x] [API Gateway] Refactor nginx.conf routing for consolidated AI service endpoints.
- [x] [Comms Service] Update WebSocket connection URL to point to unified ai-omni-service.
