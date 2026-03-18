# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Start All Services
```bash
docker compose up -d --build
```

### Frontend Development
```bash
cd client && npm start          # Dev server at port 3000
cd client && npm run build      # Production build → client/build/
```

### Frontend Docker (Production)
```bash
docker compose up -d client-app   # Runs production build at port 5001
docker compose build client-app   # Rebuild client image
```

### Verify Container Updated
```bash
docker inspect oral_app_client_app --format='{{.Created}}'
docker exec oral_app_client_app grep -o "someKeyString" /app/build/static/js/*.js
```

### Run Tests
```bash
# Frontend unit tests
cd client && npm test

# Python scenario tests
source .venv/bin/activate && python test_client_scenario.py
```

### Check Service Health / Logs
```bash
curl http://localhost:3006/health
docker compose logs workflow-service
docker compose logs ai-omni-service | grep -i "proficiency\|task_completed"
```
### 快捷指令

/build - 运行 npm run build 并分析错误
/lint - 运行 eslint 并自动修复可修复的问题
/preview - 生成组件预览说明（props/用法/示例）


### Database (PostgreSQL)
```bash
docker compose exec postgres psql -U user -d oral_app -c \
  "SELECT id, scenario_title, score, status FROM user_tasks ORDER BY created_at DESC LIMIT 5;"
```

## Architecture

### Overview: SROP (Scalable Real-time Oral Practice)

The app is a microservices system. The frontend communicates primarily via **WebSocket** (audio/text streaming) through the comms-service, and via **REST** through the Nginx api-gateway.

```
Browser (React)
    │  REST /api/*
    │  WebSocket ws://
    ▼
api-gateway (Nginx :8081→80)
    ├── /api/users/*       → user-service     (Node/Express :3002)
    ├── /api/history/*     → history-analytics-service (Node :3004)
    ├── /api/workflows/*   → workflow-service  (Python FastAPI :3006)
    ├── /ws/ai             → ai-omni-service   (Python FastAPI :8082)
    ├── /ws/comms          → comms-service     (Node WebSocket :3001)
    └── /api/conversation/*→ conversation-service (Node/Express :8083)
```

**Databases**: PostgreSQL :5432 (users/goals/tasks), MongoDB :27017 (conversation history), Redis :6379 (cache/sessions)

### Critical Data Flow: Speech → Proficiency Update

```
User speaks → ai-omni-service (DashScope Qwen3-Omni streaming)
           → response.audio.done event fires
           → calls workflow-service /proficiency-scoring/update
           → scores: fluency, vocabulary, grammar, task_relevance (0-10 each)
           → avg ≥ 8 → +3pts | avg ≥ 6 → +2pts | avg ≥ 4 → +1pt | < 4 → 0pts
           → if score >= 9 AND interaction_count >= 3 → task_completed
           → WebSocket push to frontend: proficiency_update | task_completed
           → 3 tasks completed in scenario → scenario_review triggered
```

### Frontend (client/)

- **Framework**: React 19.2.0 + Bootstrap 5 + react-bootstrap (NOT Tailwind despite README mention)
- **Build tool**: react-app-rewired (CRA-based, NOT Vite)
- **Auth**: `AuthContext.js` wraps the entire app; JWT stored in localStorage; Google OAuth via `@react-oauth/google`
- **Key page**: `pages/Conversation.js` — the main practice interface. Handles WebSocket lifecycle, audio playback queue (`audioQueueRef`), proficiency notifications, task completion UI, and scenario review modal.
- **WebSocket message types** handled in Conversation.js: `proficiency_update`, `task_completed`, `scenario_completed`, `connection_closed`

### Backend Services

| Service | Language | Key Responsibility |
|---------|----------|--------------------|
| `user-service` | Node.js/Express | JWT auth, user profiles, goals, tasks (PostgreSQL) |
| `comms-service` | Node.js | WebSocket relay between frontend and AI |
| `ai-omni-service` | Python FastAPI | DashScope Qwen3-Omni streaming, calls workflow-service after audio done |
| `workflow-service` | Python FastAPI | 4 scoring/planning workflows (no external AI calls — pure logic) |
| `conversation-service` | Node.js/Express | Conversation session management (Redis + PostgreSQL) |
| `history-analytics-service` | Node.js | Stores/retrieves chat history (MongoDB) |
| `media-processing-service` | Node.js | Audio transcoding, upload to Tencent COS |

### Workflow Service (services/workflow-service/)

4 workflows in `src/workflows/`:
1. **oral_tutor.py** — real-time micro-corrections
2. **proficiency_scoring.py** — `ProficiencyScoringWorkflow` class; task completion threshold: `score >= 9 AND interaction_count >= 3`
3. **scenario_review.py** — triggered after 3 tasks complete in one scenario
4. **goal_planning.py** — triggered when all 10 scenarios complete or time expires

Redis caching for user data: `src/cache.py`

### Internal Service Authentication

Services on Docker internal network (172.x.x.x) skip JWT auth automatically via `internalAuthWithNetworkSkip` middleware in user-service. Rate limiting on `/api/users/login` and `/api/users/register`: 5 req/min/IP.

### Environment Variables

Each service has its own `.env` file. Key shared variables:
- `JWT_SECRET` — must be identical across all services
- `QWEN3_OMNI_API_KEY` / `DASHSCOPE_API_KEY` — required for ai-omni-service
- `WORKFLOW_SERVICE_URL` — defaults to `http://workflow-service:3006`
- `DB_POOL_MAX` / `DB_POOL_MIN` — PostgreSQL pool size

### Magic Passcode

The string `急急如律令` (with Chinese punctuation variants `。！？`) in user speech cancels the current AI response and advances to the next task. Implemented in `ai-omni-service/app/main.py`.

### AI Teaching Language

`prompt_manager.py` OralTutor template has a `CRITICAL: Language of Instruction` section that enforces: `YOU MUST RESPOND ENTIRELY IN {target_language}`. Both `target_language` and `native_language` are passed in. All example corrections/encouragements are language-agnostic (no English hard-coding). The TASK SWITCH override directive also appends a language reminder when injected.

### Scenario Generation Endpoint

`POST /generate-scenarios` is implemented in `ai-omni-service/app/main.py` (Nginx rewrites `/api/ai/generate-scenarios` → `/generate-scenarios` on ai-omni-service). Uses DashScope qwen-turbo. The prompt instructs the LLM to output all scenario titles and tasks in the user's `native_language`. **Note**: `api-gateway/server.js` is dead code — the gateway is pure Nginx; all `/api/ai/*` routes go to ai-omni-service.

### Discovery Page: Goal Completion

When `progress === 100` (all scenarios completed), `Discovery.js` shows a 🏆 achievement modal once per goal (keyed by `goal_all_completed_${goal.id}` in localStorage) plus a persistent CTA banner. Both navigate to `/goal-setting` for setting a new goal.
