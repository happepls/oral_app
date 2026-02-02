# Guaji AI - 实时口语练习应用

## 概述

Guaji AI是一款24/7全天候AI口语陪练应用，定位为"面向未来的私人语言导师"。通过深度个性化和实时反馈，帮助用户提升目标语言的口语水平。

应用采用SROP (Scalable Real-time Oral Practice) 微服务架构，结合React前端与多个Node.js/Python后端服务。核心AI功能使用Qwen3-Omni，通过OpenRouter集成，实现统一的ASR（语音识别）、LLM（对话生成）和TTS（语音合成）能力。

## 当前状态

- ✅ 环境配置完成，所有服务正常运行
- ✅ 用户注册/登录功能正常
- 🔄 端到端业务流程重构中

## 用户偏好

沟通风格：简单日常语言

## System Architecture

### Frontend Architecture
- **Framework**: React 19.2.0 with React Router DOM 7.9.4
- **Styling**: Tailwind CSS 3.4.17 via PostCSS with dark mode support
- **Build Tool**: react-app-rewired for webpack customization
- **State Management**: React Context API (AuthContext for authentication)
- **Key Features**: Mobile-first web app design, Material Symbols icons, voice recording via AudioWorklet API

### Backend Microservices
The backend is decomposed into purpose-specific services:

1. **api-gateway** (Port 8080): Express-based gateway using http-proxy-middleware for routing requests to downstream services
2. **user-service** (Port 3001): Handles user authentication (JWT), registration, profile management, and goal tracking with PostgreSQL storage
3. **comms-service**: WebSocket server for real-time bidirectional audio streaming between client and AI service
4. **ai-omni-service** (Port 8082): Python FastAPI service integrating with DashScope's Qwen3-Omni model for unified speech-to-speech AI interactions. Features a PromptManager for role-based AI personas (InfoCollector, OralTutor, GrammarGuide)
5. **conversation-service** (Port 8083): Manages conversation state and session tracking with Redis
6. **history-analytics-service** (Port 3004): Stores conversation history and provides analytics via MongoDB
7. **media-processing-service** (Port 3005): Audio transcoding and storage with Tencent Cloud COS integration

### Communication Patterns
- **WebSocket**: Real-time audio streaming for voice conversations
- **REST/HTTPS**: User authentication, profile management, history queries
- **Service-to-service**: Internal HTTP calls between microservices

### AI Integration
- **Primary Engine**: Qwen3-Omni via DashScope SDK - provides end-to-end speech-to-speech capabilities
- **Role System**: PromptManager supports multiple AI personas with context-aware prompts
- **Action Parsing**: AI responses can include JSON action blocks for triggering profile updates or session summaries

### Authentication
- JWT-based authentication with 7-day token expiration
- bcrypt password hashing with enforced complexity requirements
- Google OAuth integration support via google-auth-library

## External Dependencies

### Databases & Caching
- **PostgreSQL**: Primary relational database for user data, authentication, subscriptions
- **MongoDB**: Document store for conversation history and analytics
- **Redis**: Session caching, conversation state, hot data

### Cloud Services
- **Tencent Cloud COS**: Object storage for recorded audio files
- **DashScope (Alibaba Cloud)**: Qwen3-Omni AI model API for real-time voice AI

### Key NPM/Python Packages
- **Backend**: Express, ws (WebSocket), jsonwebtoken, pg (PostgreSQL), mongoose, ioredis
- **AI Service**: FastAPI, uvicorn, dashscope SDK, websockets
- **Frontend**: react-router-dom, @react-oauth/google, react-bootstrap

### Development Infrastructure
- **Containerization**: Docker Compose for local development environment
- **Process Management**: nodemon for development hot-reload