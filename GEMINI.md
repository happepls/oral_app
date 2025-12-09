# Oral AI 实时口语练习应用 - 项目记忆

## 项目地址
- git@github.com:sjx1943/oral_app.git  #master 为默认推送分支

## 项目概述
打造一款可以24小时在线的AI口语陪练应用。应用的核心定位是“面向未来的私人语言导师”，专注于为用户提供“深度个性化”和“实时反馈”的练习体验。项目旨在通过融合“人机协同”的理念，在Duolingo和Babbel等主流应用之间，开拓一个高价值的细分市场。

## 核心技术栈
采用"可扩展实时口语（Scalable Real-time Oral Practice, SROP）"微服务架构。
- **前端**: React 19.2.0 (移动应用风格的Web App)
  - React Router DOM 7.9.4 for路由管理
  - Tailwind CSS 3.4.17 (PostCSS插件方式，已优化)
  - Material Symbols图标
  - 支持暗色模式
  - AuthContext状态管理
  - react-app-rewired (webpack配置)
  - 负责用户界面、本地VAD（Voice Activity Detection）、降噪、编解码和用户认证等功能
- **后端**: Node.js微服务架构
  - api-gateway: Express API网关 (端口8080)
  - user-service: 用户认证与管理 (端口3001，JWT认证)
  - comms-service: WebSocket实时通信 (待实现)
  - ai-omni-service: 统一的AI服务编排与Qwen3-Omni多模态AI引擎集成
  - conversation-service: 对话状态管理 (待实现)
- **通信协议**: 
    - **WebSocket**: 用于实时音视频流传输
    - **HTTPS**: 用于处理用户注册、登录、查询历史记录等业务逻辑的 RESTful API
- **数据库与缓存**:
    - **业务数据库**: PostgreSQL (存储用户信息、订阅状态等)
    - **对话历史库**: MongoDB (存储海量对话记录)
    - **缓存**: Redis (缓存用户会话、热点数据)
- **基础设施**:
    - **API 网关**: Nginx / Kong (作为所有请求的统一入口，负责路由、认证、限流)
    - **对象存储**: AWS S3 / Aliyun OSS (存储录制的音频文件)
- **AI引擎**: Qwen3-Omni (ASR+LLM+TTS 一体化)，通过OpenRouter集成

## 关键文件与目录结构
```
oral_app/
├── docker-compose.yml   # Local development environment services
├── client/              # React前端应用
│   ├── src/
│   │   ├── pages/             # 页面组件
│   │   │   ├── Welcome.js
│   │   │   ├── Login.js      # 集成API调用
│   │   │   ├── Register.js   # 集成API调用
│   │   │   ├── Conversation.js
│   │   │   ├── Discovery.js
│   │   │   └── Profile.js
│   │   ├── components/        # 可复用组件
│   │   │   ├── Login.js
│   │   │   ├── RealTimeRecorder.js
│   │   │   ├── Register.js
│   │   │   └── BottomNav.js
│   │   ├── contexts/          # React Context状态管理
│   │   │   └── AuthContext.js # 用户认证状态
│   │   ├── services/          # API服务层
│   │   │   └── api.js        # RESTful API调用封装
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css         # Tailwind CSS入口
│   ├── public/
│   │   ├── index.html
│   │   └── manifest.json
│   ├── Dockerfile            # Docker容器化配置
│   ├── .env                  # 环境变量配置
│   ├── config-overrides.js    # webpack配置覆盖
│   ├── tailwind.config.js     # Tailwind配置
│   ├── postcss.config.js      # PostCSS配置
│   └── package.json
├── api-gateway/               # API网关
│   ├── server.js             # Express网关
│   ├── nginx.conf
│   ├── Dockerfile
│   ├── .env                  # 环境变量
│   └── package.json
├── services/                  # 后端微服务
│   ├── user-service/         # 用户认证服务
│   │   ├── server.js         # Express服务器
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   │   └── userController.js
│   │   │   ├── models/
│   │   │   │   ├── db.js
│   │   │   │   └── user.js
│   │   │   ├── routes/
│   │   │   │   └── userRoutes.js
│   │   │   └── index.js
│   │   ├── docs/
│   │   │   └── schema.md  # User service database schema
│   │   ├── .env
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── ai-omni-service/      # 统一的AI服务编排与Qwen3-Omni集成
│   │   ├── src/
│   │   │   ├── index.js          # 统一入口点和HTTP服务器
│   │   │   ├── llm/
│   │   │   │   └── interface.js  # LLM服务接口
│   │   │   ├── prompt/
│   │   │   │   └── system.js     # 系统提示词模板
│   │   │   ├── qwen3omni/
│   │   │   │   ├── client.js     # Qwen3-Omni客户端实现
│   │   │   │   └── service.js    # 服务层处理客户端请求
│   │   │   └── tts/
│   │   │       └── interface.js  # TTS服务接口
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   └── package.json
│   ├── comms-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/index.js
│   ├── conversation-service/
│   ├── history-analytics-service/
│   └── media-processing-service/
└── docs/                     # 项目文档
```

# SROP (Scalable Real-time Oral Practice) Architecture Diagram

```
+------------------+      +---------------------+      +-----------------------+
|   Client App     |      |    API Gateway      |      |   Backend Services    |
| (React/Mobile)   |----->| (e.g., Nginx, Kong) |----->| (Microservices Arch)  |
+------------------+      +---------------------+      +-----------------------+
        |
        | (WebRTC/QUIC/HTTP2 Streaming for Audio Stream)                         | (Internal RPC/Events)
        | (HTTPS for REST API)                                  |
        |
        v                                                       v
+--------------------------+      +--------------------+      +-------------------------+
| Real-time Comms Layer    |      |   AI Service Layer |      |   Data Persistence Layer|
| (e.g., WebRTC Server) |<---->| (AI Engine)        |<---->| (Databases & Caching)   |
+--------------------------+      +--------------------+      +-------------------------+
```


## 核心业务逻辑

### 1. SROP 核心架构设计理念
- **流式处理优先 (Streaming First)**: 客户端通过 `AudioWorklet` 等技术实时采集音频PCM数据流，并通过合适的通信传输协议实时传输至后端，彻底抛弃“录音-上传-处理-返回”的传统模式，实现端到端的流式处理，将整体交互延迟降至2s以下。
- **服务化与解耦 (Service-Oriented & Decoupled)**: 后端拆分为用户、对话、历史分析、媒体处理等多个独立的微服务。各服务可独立迭代和扩展，从而实现精细化的成本控制。
- **数据驱动个性化 (Data-Driven Personalization)**: 引入数据库和数据分析管道，为每个用户建立动态画像（如学习进度、目标、常犯错误），为LLM提供上下文，使其回应更具个性化和针对性。
- **AI引擎抽象化 (Abstracted AI Engine)**: 将AI能力封装成一个具有统一接口的“AI引擎”层。该层将支持两种可插拔的后端实现策略：
    1.  **三阶段管线式引擎 (Pipelined Engine)**: 云端集成编排独立的流式ASR、核心LLM和流式TTS服务。此方案允许对管线中的每个环节进行精细优化或替换。
    2.  **统一多模态引擎 (Unified Multimodal Engine)**: 云端直接部署端到端的多模态大模型（例如通过docker/vLLM私有化部署的Qwen3-Omni系列模型）进行交互。
    通过这种抽象，系统未来可以根据成本、性能需求和技术演进，灵活地为不同用户或场景切换或组合使用最合适的AI引擎。
- **提示词工程模块 (Prompt Engineering Module)**: 在AI引擎内部，建立一个专门的提示词管理模块。该模块负责动态构建发送给LLM的最终Prompt。它会将定义AI导师角色的**基础指令**（Base Prompt）与用户的**动态上下文**（如个人学习目标、历史对话摘要、常犯错误等）相结合，确保AI的每一次回应都具有高度的个性化和教学相关性。

### 2. 核心实时对话流程
客户端侧 PCM/Opus 语音采集 →（WebRTC/QUIC/HTTP2 流式）→ 云端 ASR（自动语音识别）增量转写 → 云端 LLM 生成增量文本/语音指令 → 云端 TTS（文本转语音）增量合成 → SRTP 音频包回传播放+ASR文本返回。
1.  **客户端**: 实时采集用户音频流，通过 WebRTC/QUIC/HTTP2 等传输协议 发送至后端的 **实时通信服务 (`comms-service`)**。
2.  **实时通信服务**: 接收音频流并立即转发给 **AI 服务 (`ai-omni-service`)**。
3.  **AI 服务**:
    - 维护一个与 **AI引擎 (`AI Engine`)** 的持久化 连接（如HTTP2流或gRPC）。
    - 将客户端的音频流实时推送到 AI引擎。
    - AI引擎 在云端完成一体化的实时 ASR (语音识别), LLM (对话生成), 和 TTS (语音合成)。
    - `ai-omni-service` 接收来自 AI引擎 的两种实时数据流：
        a.  **ASR 文本流**: 用户语音的增量识别结果、AI 对用户回复的实时回应文本。
        b.  **TTS 音频流**: AI 回应的合成语音。
4.  **实时通信服务**: 接收来自 `ai-omni-service` 的文本和音频数据流，并立即通过 WebRTC/QUIC/HTTP2 等传输协议 转发回客户端。
5.  **客户端**:
    - 接收并实时显示 ASR 文本，让用户能立刻看到自己所说的内容和AI的回应。
    - 接收 TTS 音频流并实时播放，实现低延迟的对话体验。

### 3. 用户画像与自适应学习
- **异步分析**: “历史与分析服务”会异步处理存储在对象存储和对话历史库中的完整对话记录，进行分析，提取用户学习的关键指标（如流利度、常用词、语法弱点），并持续更新用户画像。
- **个性化交互**: “对话服务”在与AI引擎交互时，会附上用户的画像摘要。这使得AI引擎能够真正扮演“私人导师”的角色，提供高度个性化的反馈和指导。
- **动态调整**: 系统可以基于分析结果，为用户生成学习报告，并动态调整未来的练习目标和内容，实现千人千面的自适应学习路径。

## 开发与运行
- **本地环境启动**:
  - 运行 `docker compose up -d --build` 来构建启动项目所需的 PostgreSQL, MongoDB, Redis和 user-service 服务。
- **本地环境Docker构建**:
    - 由于Docker网络环境不稳定，需移除Dockerfile中的RUN npm install步骤，改为从宿主机复制node_modules。 
    - 确保在对应业务的根目录（如 `services/ai-service`）下执行npm install。
## 关键环境变量与配置

### 1. `docker-compose.yml`
这是本地开发环境的核心编排文件，定义了所有服务及其依赖关系。

- **`api-gateway`**:
  - **Ports**: `8080:80` - 将主机的 8080 端口映射到 Nginx 容器的 80 端口，作为所有流量的入口。
- **`client-app`**:
  - **Ports**: `5000:5000` - React开发服务器端口。
  - **Volumes**: 挂载源代码和node_modules目录，支持热重载。
  - **Environment**: `REACT_APP_API_URL=/api` - 设置API基础路径。
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
- **`ai-omni-service`**:
  - **Ports**: `8082:8082` 和 `8081:8081` - AI服务API和WebSocket端口。
  - 依赖 `postgres` 和 `redis`，表明它需要连接数据库和缓存。

### 2. `api-gateway/nginx.conf`
Nginx 作为 API 网关，负责请求路由。

- **`upstream`**: 定义了后端服务的地址池 (`user_service`, `comms_service`, `ai_service`)。
- **`location`**:
  - `/api/users/`: 所有用户相关的 API 请求被代理到 `user_service`。
  - `/api/ai/`: 所有 AI 相关的 API 请求被代理到 `ai_service`。
  - `/api/ws/`: WebSocket 连接请求被特殊处理（通过 `Upgrade` 和 `Connection` 头）并代理到 `comms-service`。

### 3. `client/.env`
React前端应用的环境变量配置文件。

- **`DANGEROUSLY_DISABLE_HOST_CHECK=true`**: 允许React开发服务器接受来自任何主机的请求（对于代理设置是必要的）。

### 4. `client/Dockerfile`
React前端应用的Docker容器化配置。

- **基础镜像**: `node:18-alpine` - 使用轻量级的Node.js 18 Alpine镜像。
- **工作目录**: `/app` - 设置容器内的工作目录。
- **端口暴露**: `5000` - 暴露React开发服务器的默认端口。
- **启动命令**: `npm start` - 启动React开发服务器。


## Gemini Added Memories
 │
- - 当用户提出对今天的开发工作进行收尾时，请以 AI 助手的身份完成今日收尾工作，将执行以下4项任务：
    1）使用 mcp-tasks 工具，更新开发计划到 @docs/TODO.md，不改动已完成计划内容。
    2）若项目结构有变动则更新 GEMINI.md ，以准确反映当前项目状态；注意不得改变 Gemini Added Memories 的内容及格式。
    3）在 @docs/development_log.md 追加当日工作摘要，更新日志仅追加，不覆盖。
    4）将所有变更提交并推送到远程仓库 origin/master，提交信息格式为 mac {{今日日期}}。
    **重要约束**：
    不要 覆盖整份文件，应仅追加或更新已有的内容。