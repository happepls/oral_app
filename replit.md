# Oral AI - Real-time Language Learning Application

## Overview

Oral AI is a 24/7 AI-powered oral language practice application designed as a "personal language tutor of the future." The platform provides deep personalization and real-time feedback for language learners, positioning itself between mainstream apps like Duolingo and Babbel in a high-value niche market.

The application follows a Scalable Real-time Oral Practice (SROP) microservices architecture, combining a React frontend with multiple Node.js/Python backend services orchestrated through an API gateway. The core AI functionality leverages Qwen3-Omni for unified ASR (Automatic Speech Recognition), LLM processing, and TTS (Text-to-Speech) capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

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