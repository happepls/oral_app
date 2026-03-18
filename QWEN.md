--- Context from: /Users/sgcc-work/.qwen/QWEN.md ---

# Oral AI Project Context for Qwen Code

## Project Overview
Oral AI is a 24/7 AI oral practice application aiming to provide deep personalization and real-time feedback.
Repository: `git@github.com:happepls/oral_app.git` (master branch)

## Architecture: SROP (Scalable Real-time Oral Practice)
- **Frontend**: React 19.2.0, Tailwind CSS, Material Symbols.
- **Backend**: Node.js Microservices (Express) + Python FastAPI.
  - `api-gateway`: Nginx/Express (Port 8080:80)
  - `user-service`: User Auth/Management (Port 3002:3000, Postgres)
  - `comms-service`: WebSocket Real-time comms (Port 3001:8080)
  - `ai-omni-service`: Python Qwen3-Omni integration (Port 8082:8082)
  - `history-analytics-service`: History storage (MongoDB) & Analytics (Port 3004:3004)
  - `media-processing-service`: Audio transcoding/storage (COS) (Port 3005:3005)
  - `workflow-service`: Workflow orchestration (Port 3006:3006, FastAPI)
- **Database**: PostgreSQL (User data), MongoDB (Chat history), Redis (Cache).
- **AI**: Qwen3-Omni via DashScope SDK.

## Key Directories
- `client/`: React App
- `services/`: Microservices source code
- `api-gateway/`: Gateway config
- `docker-compose.yml`: Local dev orchestration

## Development Setup
- **Start Services**: `docker compose up -d --build`
- **Frontend Dev**: `cd client && npm start` (Port 3000:3000)
- **Frontend Docker**: `docker compose up -d client-app` (Port 5001:5001) - runs production build
- **Test Scenarios**: `source .venv/bin/activate && python test_client_scenario.py`

### Build Process
- **Local Build**: `cd client && npm run build` - creates production build in `client/build/`
- **Docker Build**: `docker compose build client-app` - builds from source in `client/` using `Dockerfile.prod`, runs `npm run build` inside container
- **.dockerignore**: Recommended in `client/` directory:
  ```
  build/
  node_modules/
  .git
  *.log
  ```
  This ensures Docker builds from source (not stale local build) and reduces context size.

## Service Port Mapping
- **Client App Dev**: 3000:3000 (React frontend via npm start)
- **Client App Docker**: 5001:5001 (React frontend production via Docker)
- **API Gateway**: 8080:80 (Nginx proxy)
- **User Service**: 3002:3000 (JWT authentication)
- **Comms Service**: 3001:8080 (WebSocket real-time communication)
- **AI Omni Service**: 8082:8082 (Qwen3-omni integration)
- **Conversation Service**: 8083:8083 (Conversation management)
- **History Analytics Service**: 3004:3004 (History & analytics)
- **Media Processing Service**: 3005:3005 (Audio processing)
- **Workflow Service**: 3006:3006 (Workflow orchestration - Proficiency Scoring, Scenario Review, Goal Planning)
- **PostgreSQL**: 5432:5432 (User data)
- **MongoDB**: 27017:27017 (Conversation history)
- **Redis**: 6379:6379 (Caching & sessions)

## Current Status (Mar 2026)
- **Features**: Proficiency Scoring, Scenario-based Training, Dynamic Curriculum, Real-time Task Tracking.
- **AI Integration**: Qwen3-Omni with streaming ASR/TTS.
- **Recent Fixes**: Scoring loop, Scenario logic, Interruption handling (barge-in), Bilingual strategy, AudioUrl persistence, Audio playback queue management, Task relevance keyword matching, Redis caching for user data.

## Recent Issues and Solutions

### Mar 2026 Updates

- **AI教学语言 & 场景生成国际化 (Mar 18)**:
  - **AI教学语言动态适配**: `prompt_manager.py` OralTutor模板新增 `CRITICAL: Language of Instruction` 章节，明确 `YOU MUST RESPOND ENTIRELY IN {target_language}`。同时传入 `native_language`，仅在学生完全无法理解时允许用母语辅助解释。删除所有英语硬编码示例句。TASK SWITCH override指令末尾追加目标语言提醒。
  - **场景生成国际化**: `ai-omni-service/main.py` 新增 `POST /generate-scenarios` 端点（Nginx将 `/api/ai/generate-scenarios` rewrite到此）。调用DashScope qwen-turbo，prompt要求所有场景标题和子任务用 `native_language` 输出。**注意**：`api-gateway/server.js` 是死代码，gateway是纯Nginx。
  - **GoalSetting页去英文化**: 删除整个 `PRESET_SCENARIOS` 英文硬编码预设；删除 `useAI` toggle；AI失败显示中文错误而非回退英文预设；Step 2所有UI文字汉化。
  - **Discovery成就徽章**: `progress===100`时显示🏆成就modal（localStorage去重，key: `goal_all_completed_${goal.id}`）+ 常驻CTA横幅，均跳转 `/goal-setting` 设定新目标。
  - Files: `services/ai-omni-service/app/main.py`, `services/ai-omni-service/app/prompt_manager.py`, `client/src/pages/GoalSetting.js`, `client/src/pages/Discovery.js`

- **Proficiency Scoring & Task Relevance Fixes (Mar 17)**:
  - **AI Review Feedback Optimization**: Modified scenario completion modal to show personalized AI feedback instead of fixed templates. Removed emojis, using concise Chinese feedback.
  - **Redis Cache Integration**: Added Redis caching for user information to reduce database queries. Created `cache.py` module with user language/info caching.
  - **Language Detection Fix**: Lowered Latin character threshold (50% → 30%), short texts (<20 chars) default to English.
  - **Task-Specific Keyword Matching**: Added `task_desc_keywords_map` to prioritize task description over scenario title for keyword extraction. Fixed issue where "聊聊天气" task was matched with greeting keywords.
  - **Generic Words Filter**: Removed generic polite words (please, can you, thank you, hello, hi, hey) from task relevance scoring to prevent false positives.
  - **Simplified Feedback**: Streamlined improvement tips to only show task description and suggested keywords, removing verbose examples and grammar corrections.
  - Files: `services/workflow-service/src/workflows/proficiency_scoring.py`, `services/workflow-service/src/cache.py`, `services/workflow-service/src/main.py`, `services/workflow-service/requirements.txt`, `docker-compose.yml`, `client/src/pages/Conversation.js`

- **System Security & Stability Improvements (Mar 16)**:
  - **Internal API Authentication**: Added `internalAuthWithNetworkSkip` middleware for service-to-service communication. Docker internal network (172.x.x.x) auto-skips auth for backward compatibility.
  - **Rate Limiting for Auth**: Added 5 req/min/IP rate limiting for `/api/users/login` and `/api/users/register` endpoints.
  - **API Gateway Headers**: Added `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` headers for AI WebSocket.
  - **DB Connection Pool**: Configurable pool size via `DB_POOL_MAX`/`DB_POOL_MIN` env vars, added pool pressure monitoring.
  - **WebSocket Error Handling**: Improved `connection_closed` event with reconnect info.
  - **Frontend Cleanup**: Added useEffect cleanup to prevent memory leaks, removed duplicate ping mechanism.
  - Files: `services/user-service/src/middleware/enhancedAuthMiddleware.js`, `api-gateway/nginx.conf`, `services/user-service/src/models/db.js`, `services/conversation-service/src/models/db.js`, `services/comms-service/src/index.js`, `client/src/pages/Conversation.js`

- **Bug Fixes (Mar 16)**:
  - **BUG-001**: Fixed `Cannot read properties of null (reading 'pingInterval')` using optional chaining `?.`.
  - **BUG-002/003**: Fixed "重新开始"/"重新练习" buttons not resetting session properly. Now correctly passes `{ keepHistory: false, resetProgress: true }`.
  - Files: `client/src/pages/Conversation.js`, `client/src/__tests__/conversation-bugfix.test.js`

- **Scenario Completion "Continue Practice" (Mar 15)**: Added `resetProgress` parameter to `handleRetryCurrentScenario`. "继续练习" keeps progress/history/session; "重新开始" resets everything. Fixed `websocket` parameter missing in `call_proficiency_workflow`. Files: `client/src/pages/Conversation.js`, `services/ai-omni-service/app/main.py`

- **Scenario Review AI Feedback (Mar 12)**: Enhanced `_generate_recommendations()` to analyze actual conversation (connector words, sentence length, questions). Fixed data extraction from `review_data.get('data', {})`. Files: `services/workflow-service/src/workflows/scenario_review.py`, `services/ai-omni-service/app/main.py`

- **Magic Passcode "急急如律令" (Mar 12)**: Added regex support for Chinese punctuation `。！？`. Cancels AI response after passcode detection. Updates task context via `/api/users/goals/next-task`. Files: `services/ai-omni-service/app/main.py`

- **Proficiency Scoring Refinement (Mar 11)**: Added target language detection in `_score_grammar()`. Raised task relevance threshold to < 3. Clear conversation history on task switch (keep last 2 messages). Files: `services/workflow-service/src/workflows/proficiency_scoring.py`, `services/ai-omni-service/app/main.py`

- **Task Completion & Transition (Mar 11)**: Unified completion standard: `score >= 9 AND interaction_count >= 3`. Fixed task_id lookup and cross-language keyword matching. Files: `services/workflow-service/src/workflows/proficiency_scoring.py`, `services/ai-omni-service/app/main.py`, `client/src/pages/Conversation.js`

- **Audio Fixes (Mar 2026)**: AudioUrl persistence in `response.audio.done` event. Audio playback queue management in `audioQueueRef`. Files: `services/ai-omni-service/app/main.py`, `client/src/pages/Conversation.js`

### Earlier Fixes

- **Workflow Integration**: 4 workflows integrated (Oral Tutor, Proficiency Scoring, Scenario Review, Goal Planning)
- **Rate Limiting**: Skip rate limiting for internal Docker network (172.x.x.x)
- **JWT/Environment**: Standardized JWT_SECRET and environment variables across services

## Workflow Integration (Feb 2026)

### 4 Workflows Implemented

1. **Workflow 1: Oral Tutor (口语导师)** - `services/workflow-service/src/workflows/oral_tutor.py`
   - Real-time conversation interaction
   - Micro-corrections (one error at a time)
   - Question-driven dialogue
   - API: `POST /api/workflows/oral-tutor/analyze`

2. **Workflow 2: Proficiency Scoring (熟练度打分)** - `services/workflow-service/src/workflows/proficiency_scoring.py`
   - Analyzes last 3-5 conversation turns
   - Scoring dimensions: Fluency, Vocabulary, Grammar, Task Completion (0-10 each)
   - Proficiency delta: avg≥8 → +3, avg≥6 → +2, avg≥4 → +1
   - Task completion: score >= 3 → mark as completed
   - API: `POST /api/workflows/proficiency-scoring/update`
   - **Integrated in ai-omni-service**: Called after `response.audio.done` event
   - **Frontend notifications**: `proficiency_update` (+X 熟练度 | 总分：Y), `task_completed` (✅ 任务完成！)

3. **Workflow 3: Scenario Review (场景练习总结)** - `services/workflow-service/src/workflows/scenario_review.py`
   - Triggered when 3 tasks in a scenario are completed
   - Generates comprehensive review report
   - Provides specific recommendations
   - API: `POST /api/workflows/scenario-review/generate`

4. **Workflow 4: Goal Planning (新目标规划)** - `services/workflow-service/src/workflows/goal_planning.py`
   - Detects goal completion (all 10 scenarios or time expired)
   - Generates new goal suggestions based on user interests
   - Pre-built templates: Business English, Travel Fluency, Academic English, Advanced Conversation
   - API: `POST /api/workflows/goal-planning/check-completion`, `GET /api/workflows/goal-planning/suggestions`, `POST /api/workflows/goal-planning/create`

### Database Schema (PostgreSQL)

**user_goals table**:
- `id` (integer), `user_id` (uuid), `type` (varchar), `description` (text)
- `target_language`, `target_level` (A1-C2), `current_proficiency` (integer 0-100)
- `completion_time_days`, `scenarios` (jsonb), `status` (active/completed)

**user_tasks table**:
- `id` (integer), `user_id` (uuid), `goal_id` (integer)
- `scenario_title`, `task_description`, `status` (pending/completed)
- `score` (integer 0-10), `interaction_count`, `feedback` (text)
- `completed_at`, `created_at`, `updated_at`

### Business Logic: Proficiency → Task Completion

```
User speaks → AI responds → Audio upload complete → Workflow 2 called
                                                        ↓
                                          Analyze last 3-5 turns
                                                        ↓
                                          Score dimensions (0-10):
                                          - Fluency (length, connectors, complete sentences)
                                          - Vocabulary (diversity, advanced words)
                                          - Grammar (tense, subject-verb agreement)
                                          - Task Completion (keyword matches)
                                                        ↓
                                          Calculate proficiency delta:
                                          - avg ≥ 8: +3 points (excellent)
                                          - avg ≥ 6: +2 points (good)
                                          - avg ≥ 4: +1 point (fair)
                                          - avg < 4: +0 points (needs work)
                                                        ↓
                                          Update database:
                                          - user_tasks.score += delta
                                          - user_tasks.interaction_count++
                                          - user_goals.current_proficiency += delta
                                                        ↓
                                          Check task completion:
                                          - if score >= 3: status='completed'
                                                        ↓
                                          Send notifications to frontend:
                                          - proficiency_update: "+X 熟练度 | 总分：Y"
                                          - task_completed: "✅ 任务完成！{message}"
```

### Frontend Integration (Conversation.js)

**Message types handled**:
- `proficiency_update`: Shows temporary notification (disappears after 3s)
- `task_completed`: Shows system message, updates completedTasks Set, refreshes MISSION TASKS UI

### Key Files
- `services/workflow-service/`: Workflow service (FastAPI)
- `services/ai-omni-service/app/main.py`: Integrated Workflow 2 in `response.audio.done` handler
- `client/src/pages/Conversation.js`: Handles `proficiency_update` and `task_completed` messages
- `docker-compose.yml`: Added workflow-service configuration
- `docs/workflow_refactoring_summary.md`: Complete workflow documentation
- `docs/workflow_integration_summary.md`: Integration details and testing guide

## MCP Tools Configuration
- **Filesystem**: Configured for project root access.
- **Postgres**: Configured for local docker instance (`postgresql://user:password@localhost:5432/oral_app`).
- **Memory**: Enabled for maintaining session context.

## Guidelines
- Use `docker compose` (not `docker-compose`).
- Follow "Service-Oriented & Decoupled" architecture.
- Frontend uses WebSocket for both text and audio streaming.
- **Workflow Service**: All proficiency scoring, scenario review, and goal planning logic is in workflow-service (FastAPI).
- **Internal Service Communication**: Skip rate limiting for Docker internal network (172.x.x.x).

## Testing Commands
```bash
# Check workflow-service health
curl http://localhost:3006/health

# Test proficiency scoring API
curl -X POST http://localhost:3006/api/workflows/proficiency-scoring/update \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "goal_id": 1,
    "task_id": 1,
    "conversation_history": [...]
  }'

# Check service logs
docker compose logs workflow-service
docker compose logs ai-omni-service | grep -i "proficiency\|task_completed"

# Verify database updates
docker compose exec postgres psql -U user -d oral_app -c \
  "SELECT id, scenario_title, score, status FROM user_tasks ORDER BY created_at DESC LIMIT 5;"
```

## Security Enhancements (Feb 2026)
- **API Security**: Implemented comprehensive security middleware including rate limiting, JWT validation, input sanitization, CORS protection, and security headers
- **User Data Protection**: Added data encryption utilities for sensitive user information, password security enhancements, and session management
- **Authentication**: Enhanced JWT authentication with refresh tokens, token blacklisting, and role-based authorization
- **Input Validation**: Comprehensive input validation using express-validator with strict validation rules for registration, login, and API endpoints
- **Rate Limiting**: Multi-tier rate limiting for different endpoints (auth: 5/15min, general: 100/15min, API: 1000/15min)
- **Security Headers**: Implemented security headers including CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **Data Encryption**: AES-256-GCM encryption for sensitive user data with secure key management
- **Security Monitoring**: Request tracking, security logging, and automated security event detection
- **Docker Security**: Updated Docker configurations to use non-root users and secure defaults
- **Security Audit**: Created automated security audit script to identify vulnerabilities and track security improvements

## 容器更新验证流程
在完成容器镜像的构建或更新部署后，应利用 `docker exec` 命令进入运行中的容器环境，执行必要的验证操作，以确认容器内应用程序的代码已成功更新至最新版本，并避免继续执行旧代码逻辑。

### 验证客户端容器更新
```bash
# 检查容器构建时间
docker inspect oral_app_client_app --format='{{.Created}}'

# 验证代码已更新（检查关键字符串）
docker exec oral_app_client_app grep -o "audioPlayed === false" /app/build/static/js/*.js

# 或检查压缩后的代码（false 被转换为 !1）
docker exec oral_app_client_app grep -o "!1===e.audioPlayed" /app/build/static/js/*.js

# 验证服务响应
curl -s http://localhost:5001/ | head -20
```