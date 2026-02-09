# Guaji AI - 实时口语练习应用

## 概述

Guaji AI是一款24/7全天候AI口语陪练应用，定位为"面向未来的私人语言导师"。通过深度个性化和实时反馈，帮助用户提升目标语言的口语水平。

应用采用SROP (Scalable Real-time Oral Practice) 微服务架构，结合React前端与多个Node.js/Python后端服务。核心AI功能使用Qwen3-Omni，通过OpenRouter集成，实现统一的ASR（语音识别）、LLM（对话生成）和TTS（语音合成）能力。

## 当前状态

- ✅ 环境配置完成，所有服务正常运行
- ✅ 用户注册/登录功能正常
- ✅ 端到端业务流程完成（11步骤闭环验证）
- ✅ 每日打卡功能实现
- ✅ 多轮评分机制实现
- ✅ Stripe支付集成完成

## 用户偏好

沟通风格：简单日常语言

## 最近更新 (2026-02-03)

### 新功能
- **官网Landing Page**：专业的营销着陆页，展示产品特性、用户评价和定价方案
- **目标完成庆祝**：当所有场景任务完成时显示庆祝弹窗，引导设定新目标
- **AI评分反馈**：场景完成后根据分数显示个性化AI点评和建议
- **Stripe订阅系统**：完整的支付集成，支持周订阅($2.90/周)和年订阅($89.90/年)
- **订阅页面**：显示免费版和付费版功能对比，一键跳转Stripe结账
- **目标设置页面**：添加AI音色选择(Cherry, Serena, Ethan, Chelsie)
- **登录状态持久化**：已登录用户自动跳转至discovery页面
- **导航重构**：底部导航移除打卡/练习入口，添加目标入口；打卡移至个人中心

### 技术改进
- 集成stripe和stripe-replit-sync包
- 添加users表Stripe相关字段(stripe_customer_id, stripe_subscription_id, subscription_status)
- 创建Stripe webhook处理和数据同步机制
- API网关添加Stripe路由代理
- Landing页面作为根路由，Welcome页面移至/welcome

## 历史更新 (2026-02-02)

### 功能
- **多轮评分机制**：每个任务需累计60分才能标记完成，支持2-4轮对话渐进评分
- **场景完成模态框**：显示平均分、星级评价、导航选项
- **每日打卡系统**：连续打卡奖励、周视图日历、积分统计

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
2. **user-service** (Port 3001): Handles user authentication (JWT), registration, profile management, goal tracking, check-in system with PostgreSQL storage
3. **comms-service**: WebSocket server for real-time bidirectional audio streaming between client and AI service
4. **ai-omni-service** (Port 8082): Python FastAPI service integrating with DashScope's Qwen3-Omni model for unified speech-to-speech AI interactions. Features a PromptManager for role-based AI personas (InfoCollector, OralTutor, GrammarGuide)
5. **conversation-service** (Port 8083): Manages conversation state and session tracking with Redis
6. **history-analytics-service** (Port 3004): Stores conversation history and provides analytics via MongoDB
7. **media-processing-service** (Port 3005): Audio transcoding and storage with Tencent Cloud COS integration

### Database Schema (PostgreSQL)
- **users**: 用户基本信息（id INT, username, email, nickname, native_language, target_language, interests, points）
- **user_identities**: 认证信息（provider, provider_uid, user_id, password_hash）
- **user_goals**: 学习目标（id, user_id, type, target_language, target_level, current_proficiency, scenarios JSONB）
- **user_tasks**: 任务跟踪（id, user_id, goal_id, scenario_title, task_description, status, score, interaction_count）
- **user_checkins**: 打卡记录（id, user_id, checkin_date, points_earned, streak_count）

### Communication Patterns
- **WebSocket**: Real-time audio streaming for voice conversations
- **REST/HTTPS**: User authentication, profile management, history queries
- **Service-to-service**: Internal HTTP calls between microservices

### AI Integration
- **Primary Engine**: Qwen3-Omni via DashScope SDK - provides end-to-end speech-to-speech capabilities
- **Scenario Generation**: OpenRouter (LLama 3.3 70B) - generates personalized practice scenarios
- **Role System**: PromptManager supports multiple AI personas with context-aware prompts
- **Action Parsing**: AI responses can include JSON action blocks for triggering profile updates or session summaries
- **Scoring System**: AI evaluates responses with tier-based scoring (+30/+15/+10/+5 points)

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
- **OpenRouter**: LLM API for scenario generation

### Key NPM/Python Packages
- **Backend**: Express, ws (WebSocket), jsonwebtoken, pg (PostgreSQL), mongoose, ioredis
- **AI Service**: FastAPI, uvicorn, dashscope SDK, websockets
- **Frontend**: react-router-dom, @react-oauth/google, react-bootstrap

### Development Infrastructure
- **Containerization**: Docker Compose for local development environment
- **Process Management**: nodemon for development hot-reload

## 技术债务

### 高优先级
- **init.sql类型不一致**：init.sql中users.id定义为UUID，但实际生产数据库使用INT类型。需要统一以避免新环境部署问题
- **遗留字符串任务**：部分旧数据中tasks可能是字符串而非对象，需要数据迁移

### 中优先级
- **history-analytics-service端口配置**：内部调用user-service使用硬编码端口
- **缺少自动化测试**：需要添加单元测试和集成测试

## 后续开发计划 (TODO)

### Phase 1 - 付费系统 (优先)
- [ ] Stripe集成 - 订阅付费机制
- [ ] 用户订阅状态管理
- [ ] 免费用户使用限制
- [ ] 付费功能解锁（高级场景、无限打卡奖励等）

### Phase 2 - 用户体验优化
- [ ] 语音对话实时流式传输优化（目标<2秒延迟）
- [ ] 离线缓存支持（Service Worker）
- [ ] 推送通知（打卡提醒、学习提醒）
- [ ] 成就徽章系统

### Phase 3 - 社交功能
- [ ] 学习排行榜
- [ ] 好友系统
- [ ] 学习小组

### Phase 4 - 上架推广
- [ ] App Store / Google Play 上架
- [ ] 域名配置和SEO优化
- [ ] 落地页设计
- [ ] 用户推荐奖励机制
