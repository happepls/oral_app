# Oral AI 实时口语练习应用 - 项目记忆

## 项目地址
- git@github.com:sjx1943/oral_app.git

## 项目概述
打造一款可以24小时在线的AI口语陪练应用。应用的核心定位是“面向未来的私人语言导师”，专注于为用户提供“深度个性化”和“实时反馈”的练习体验。项目旨在通过融合“人机协同”的理念，在Duolingo和Babbel等主流应用之间，开拓一个高价值的细分市场。

## 核心技术栈
采用“可扩展实时口语（Scalable Real-time Oral Practice, SROP）”微服务架构。
- **前端**: React / 移动应用 (iOS/Android)
- **后端**: 微服务架构 (Node.js, Go, Python)
- **通信协议**:
    - **WebSocket (WSS) / WebRTC**: 用于客户端与服务器之间的实时音频流传输。
    - **HTTPS**: 用于处理用户注册、登录、查询历史记录等业务逻辑的 RESTful API。
- **数据库与缓存**:
    - **业务数据库**: PostgreSQL / MongoDB (存储用户信息、订阅状态等)
    - **对话历史库**: MongoDB / DynamoDB (存储海量对话记录)
    - **缓存**: Redis (缓存用户会话、热点数据)
- **基础设施**:
    - **API 网关**: Nginx / Kong (作为所有请求的统一入口，负责路由、认证、限流)
    - **对象存储**: AWS S3 / Aliyun OSS (存储录制的音频文件)
- **第三方服务 (AI引擎)**:
    - **核心引擎**: Azure AI Voice Services (提供集成的实时ASR, LLM, TTS服务)

## 关键文件与目录结构
```
oral_app/
├── docker-compose.yml   # Local development environment services
├── client/              # Frontend application (React/Mobile)
├── api-gateway/         # API Gateway configuration
├── services/            # Backend microservices
│   ├── comms-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/index.js
│   ├── user-service/
│   │   └── docs/
│   │       └── schema.md  # User service database schema
│   ├── ai-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.js
│   │       ├── asr/interface.js
│   │       ├── llm/
│   │       │   ├── interface.js
│   │       │   └── mockLlmService.js
│   │       ├── prompt/
│   │       │   └── manager.js
│   │       └── tts/interface.js
│   ├── conversation-service/
│   ├── history-analytics-service/
│   └── media-processing-service/
└── docs/                # Project documentation
```

# SROP (Scalable Real-time Oral Practice) Architecture Diagram

```
+------------------+      +---------------------+      +-----------------------+
|   Client App     |      |    API Gateway      |      |   Backend Services    |
| (React/Mobile)   |----->| (e.g., Nginx, Kong) |----->| (Microservices Arch)  |
+------------------+      +---------------------+      +-----------------------+
        |
        | (WebRTC/WSS for Audio Stream)                         | (Internal RPC/Events)
        | (HTTPS for REST API)                                  |
        |
        v                                                       v
+--------------------------+      +--------------------+      +-------------------------+
| Real-time Comms Layer    |      |   AI Service Layer |      |   Data Persistence Layer|
| (e.g., WebSocket Server) |<---->| (AI Engine)        |<---->| (Databases & Caching)   |
+--------------------------+      +--------------------+      +-------------------------+
```


## 核心业务逻辑

### 1. SROP 核心架构设计理念
- **流式处理优先 (Streaming First)**: 客户端通过 `AudioWorklet` 等技术实时采集音频PCM数据流，并通过WSS/WebRTC协议实时传输至后端，彻底抛弃“录音-上传-处理-返回”的传统模式，实现端到端的流式处理，将交互延迟降至秒级。
- **服务化与解耦 (Service-Oriented & Decoupled)**: 后端拆分为用户、对话、历史分析、媒体处理等多个独立的微服务。各服务可独立迭代和扩展，从而实现精细化的成本控制。
- **数据驱动个性化 (Data-Driven Personalization)**: 引入数据库和数据分析管道，为每个用户建立动态画像（如学习进度、目标、常犯错误），为LLM提供上下文，使其回应更具个性化和针对性。
- **AI引擎抽象化 (Abstracted AI Engine)**: 将AI能力封装成一个具有统一接口的“AI引擎”层。该层将支持两种可插拔的后端实现策略：
    1.  **三阶段管线式引擎 (Pipelined Engine)**: 维持原有的设计，按顺序编排独立的流式ASR、核心LLM和流式TTS服务。此方案成熟稳定，允许对管线中的每个环节进行精细优化或替换。
    2.  **统一多模态引擎 (Unified Multimodal Engine)**: 新增的方案，直接与一个端到端的多模态大模型（例如通过vLLM私有化部署的Qwen3-Omni系列模型）进行交互。客户端的音频流直接传入该模型，模型处理后直接返回音频流。此方案有望极大降低端到端延迟，简化服务链路。
    通过这种抽象，系统未来可以根据成本、性能需求和技术演进，灵活地为不同用户或场景切换或组合使用最合适的AI引擎。
- **提示词工程模块 (Prompt Engineering Module)**: 在AI引擎内部，建立一个专门的提示词管理模块。该模块负责动态构建发送给LLM的最终Prompt。它会将定义AI导师角色的**基础指令**（Base Prompt）与用户的**动态上下文**（如个人学习目标、历史对话摘要、常犯错误等）相结合，确保AI的每一次回应都具有高度的个性化和教学相关性。

### 2. 核心实时对话流程 (基于 Azure AI)
1.  **客户端**: 实时采集用户音频流，通过 WebSocket 发送至后端的 **实时通信服务 (`comms-service`)**。
2.  **实时通信服务**: 接收音频流并立即转发给 **AI 服务 (`ai-service`)**。
3.  **AI 服务**:
    - 维护一个与 **Azure AI 实时语音 API (`Voice Live API`)** 的持久化 WebSocket 连接。
    - 将客户端的音频流实时推送到 Azure。
    - Azure AI 服务在云端完成一体化的实时 ASR (语音识别), LLM (对话生成), 和 TTS (语音合成)。
    - `ai-service` 接收来自 Azure 的两种实时数据流：
        a.  **ASR 文本流**: 用户语音的实时转录。
        b.  **TTS 音频流**: AI 回应的合成语音。
4.  **实时通信服务**: 接收来自 `ai-service` 的文本和音频数据流，并立即通过 WebSocket 转发回客户端。
5.  **客户端**:
    - 接收并实时显示 ASR 文本，让用户能立刻看到自己所说的内容。
    - 接收 TTS 音频流并实时播放，实现低延迟的对话体验。

### 3. 用户画像与自适应学习
- **异步分析**: “历史与分析服务”会异步处理存储在对象存储和对话历史库中的完整对话记录，进行分析，提取用户学习的关键指标（如流利度、常用词、语法弱点），并持续更新用户画像。
- **个性化交互**: “对话服务”在与LLM交互时，会附上用户的画像摘要。这使得LLM能够真正扮演“私人导师”的角色，提供高度个性化的反馈和指导。
- **动态调整**: 系统可以基于分析结果，为用户生成学习报告，并动态调整未来的练习目标和内容，实现千人千面的自适应学习路径。

## 开发与运行
- **本地环境启动**:
  - 运行 `docker-compose up -d` 来启动项目所需的 PostgreSQL, MongoDB, Redis和 user-service 服务。
- **本地环境Docker构建**:
    - 由于Docker网络环境不稳定，需移除Dockerfile中的RUN npm install步骤，改为从宿主机复制node_modules。 
    - 确保在对应业务的根目录（如 `services/ai-service`）下执行npm install。
## 关键环境变量与配置


### 1. `docker-compose.yml`
这是本地开发环境的核心编排文件，定义了所有服务及其依赖关系。

- **`api-gateway`**:
  - **Ports**: `8080:80` - 将主机的 8080 端口映射到 Nginx 容器的 80 端口，作为所有流量的入口。
- **`postgres`**:
  - **Ports**: `5432:5432` - 数据库端口。
  - **Volumes**: 挂载 `init.sql` 用于数据库初始化。
  - **Environment**:
    - `POSTGRES_DB`: `oral_app` - 数据库名。
    - `POSTGRES_USER`: `user` - 数据库用户名。
    - `POSTGRES_PASSWORD`: `password` - 数据库密码。
- **`user-service`**:
  - **`env_file`**: 指向 `./services/user-service/.env` 文件，其中包含以下关键变量：
    - `DATABASE_URL`: PostgreSQL 连接字符串，格式为 `postgresql://<user>:<password>@<host>:<port>/<db>`。例如: `postgresql://user:password@postgres:5432/oral_app`。
    - `JWT_SECRET`: 用于签发和验证 JSON Web Tokens 的密钥。
- **`comms-service`**:
  - **Ports**: `3001:8080` - 实时通信服务的端口。
- **`ai-service`**:
  - 依赖 `postgres` 和 `redis`，表明它需要连接数据库和缓存。

### 2. `api-gateway/nginx.conf`
Nginx 作为 API 网关，负责请求路由。

- **`upstream`**: 定义了后端服务的地址池 (`user_service`, `comms_service`, `ai_service`)。
- **`location`**:
  - `/api/users/`: 所有用户相关的 API 请求被代理到 `user_service`。
  - `/api/ai/`: 所有 AI 相关的 API 请求被代理到 `ai_service`。
  - `/api/ws/`: WebSocket 连接请求被特殊处理（通过 `Upgrade` 和 `Connection` 头）并代理到 `comms-service`。

## 最新进展与当前状态 (2025-10-30)
- **架构重大转向：集成 Azure AI 实时语音服务**:
    - **决策**: 为了简化架构并利用更先进的端到端解决方案，项目决定放弃原有的“三阶段管线式引擎”（独立ASR+LLM+TTS服务），全面转向采用微软 Azure AI 提供的实时语音 API (`Voice Live API`)。
    - **优势**:
        1.  **低延迟**: Azure 的 API 设计为实时对话场景优化，能提供更低的端到端延迟。
        2.  **单一入口**: 只需维护一个到 Azure 的 WebSocket 连接，即可处理 ASR、LLM 和 TTS 的所有流程，极大简化了 `ai-service` 的内部逻辑和网络复杂性。
        3.  **高级功能**: 可直接利用 Azure 平台提供的噪音抑制、回声消除和高级轮次检测等功能。
        4.  **统一管理**: 未来的模型调优和 Prompt 管理将统一在 Azure AI Foundry 平台上进行。
    - **状态**: 项目开发计划 (`docs/TODO.md`) 已根据此新方向进行了全面更新。目前，`ai-service` 已成功与 Azure AI Speech SDK 对接，实现了实时的 ASR 文本识别，并将识别到的文本作为临时“回声”TTS 响应发送回客户端，前端已能正确显示用户语音的实时转录和 AI 的文本回复。下一个开发阶段将专注于实现完整的实时 TTS 音频流传输和会话管理。

## Gemini Added Memories
- 项目已配置专属的今日开发工作收尾命令 `finish_today`，其具体操作如下: "作为AI助手，我的目标是完成今日的收尾工作。我将执行以下4项操作：
\n1. Update the development plan in @docs/TODO.md using the 'mcp-tasks' tool,只修改相关的任务项，不会影响文件中的其他内容. 
\n2. Update the GEMINI.md project memory file to reflect the current project state, 注意**不能改变Gemini Added Memories的内容及格式. 
\n3. Append a summary of the day's work to the development log at @docs/development_log.md if exists.
\n4. Commit and push all changes to the origin/master branch of the remote repository using the commit message ser {{今日日期}}."
  **注意不要使用 write_file 覆盖整个文件，而应追加或更新已有的内容。**

