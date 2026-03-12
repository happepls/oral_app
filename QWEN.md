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
- **Recent Fixes**: Scoring loop, Scenario logic, Interruption handling (barge-in), Bilingual strategy, AudioUrl persistence, Audio playback queue management.

## Recent Issues and Solutions
- **WebSocket Connection Issue**: Fixed by updating the API Gateway WebSocket configuration and ensuring proper routing from frontend to comms-service to ai-omni-service
- **JWT Token Validation Issue**: Resolved by standardizing JWT_SECRET across all services and ensuring consistent token validation
- **Service Communication Issue**: Fixed by configuring correct USER_SERVICE_URL in ai-omni-service to allow proper user context fetching
- **Environment Configuration**: Ensured all services use consistent environment variables and network configurations
- **AI Response Persistence**: Fixed issue where AI responses disappeared after page refresh by modifying save logic in `Conversation.js` to include non-final AI messages in conversation history
- **Client App Port Configuration**: Fixed nginx configuration in client-app to listen on correct port (5000) matching docker-compose.yml mapping, resolving 502 Bad Gateway errors
- **Rate Limiting for Internal Services**: Fixed 429 errors by skipping rate limiting for internal service communication (Docker network 172.x.x.x)
- **Workflow Integration**: Successfully integrated 4 workflows for oral practice orchestration
- **AudioUrl Persistence (Mar 2026)**: Fixed issue where AI audio URLs were lost after page refresh. Backend fix: `services/ai-omni-service/app/main.py` now saves messages in `response.audio.done` event (line ~392). Frontend fix: `client/src/pages/Conversation.js` sets `audioPlayed: true` when loading history, and useEffect condition checks `audioPlayed === false` (minified as `!1===e.audioPlayed`).
- **Audio Playback Queue (Mar 2026)**: Fixed issue where clicking replay button caused all audio to play together. Added audio source to `audioQueueRef` queue in `playFullAudio` and `fetchAudioViaProxy` functions. `stopAudioPlayback` now iterates through queue to stop all audio sources.
- **Docker Build Optimization**: Recommended adding `.dockerignore` in `client/` directory to exclude `build/`, `node_modules/`, `.git` - ensures Docker builds from source and reduces context size. Development override in `docker-compose.override.yml` still mounts local build for convenience.
- **Task Completion & Transition Fix (Mar 11, 2026)**: Fixed issue where task progress showed 100% but AI prompt didn't switch to next task after completion.
  - **Root causes identified**:
    1. Task completion threshold mismatch: `proficiency_scoring.py` used `score >= 9` but frontend calculated progress as `taskScore / 9 * 100`, causing confusion when `interaction_count < 3`
    2. `user_service_url` undefined error in task completion handler prevented fetching new task data
    3. `active_goal['current_task']` not updated in `_update_session_prompt`, causing prompt_manager to use stale task info
    4. Redundant `execute_action_with_response("update_task_score", ...)` call with wrong parameter names (`scenarioTitle` vs `scenario`)
    5. `task_id` lookup used wrong key (`current_task_id` instead of `active_goal.current_task.id`)
    6. `keywords` variable referenced before assignment in `_generate_improvement_tips` for non-English scenarios
    7. Poor example sentences in `_generate_connector_example` for greeting scenarios (e.g., "Hi, I'm hello, and hi?")
    8. `proficiency_scoring.py` workflow missing `task_id` in return result, causing frontend to show `task_id=None`
    9. `_score_task_relevance` failed to extract keywords from Chinese task descriptions (e.g., "聊聊你喜欢的奥特曼")
    10. Keyword matching was language-specific, failing for third-party languages (Spanish, French, etc.)
  - **Fixes applied**:
    1. Unified completion standard: `score >= 9 AND interaction_count >= 3` in both backend and frontend
    2. Added `user_service_url = os.getenv("USER_SERVICE_URL", "http://user-service:3000")` in task refresh logic
    3. Updated `full_ctx['active_goal']['current_task']` in `_update_session_prompt` for prompt_manager
    4. Removed redundant manual scoring logic - proficiency workflow handles all score updates
    5. Fixed task_id lookup: `self.user_context.get('active_goal', {}).get('current_task', {}).get('id')`
    6. Pre-loaded `keywords` at start of `_generate_improvement_tips` to support non-English scenarios (e.g., "日常问候")
    7. Improved greeting scenario templates with practical examples like "Hello! I'm interested in {kw1}, and I'd love to know about {kw2}."
    8. Added `task_id`, `task_score`, `task_title`, `scenario_title` to proficiency workflow result dictionary
    9. For Chinese task descriptions, use scene keywords as task keywords in `_score_task_relevance`
    10. Implemented cross-language keyword matching using substring matching and generic word extraction (space-split) with stop-word filtering
  - **Files modified**: `services/workflow-service/src/workflows/proficiency_scoring.py`, `services/ai-omni-service/app/main.py`, `client/src/pages/Conversation.js`
- **Proficiency Scoring Refinement (Mar 11, 2026)**: Fixed issues with progress evaluation being too lenient and context confusion during task switching.
  - **Root causes identified**:
    1. Grammar scoring didn't consider target language - Chinese input received full English grammar score
    2. Invalid input patterns (pure interjections, short phrases) received high scores
    3. Task relevance threshold was too low (< 2), allowing off-topic input to earn points
    4. Conversation history wasn't cleared on task switch, causing AI context confusion
    5. System prompt didn't emphasize current task clearly enough
    6. Ping/pong messages flooded logs (10 per second)
  - **Fixes applied**:
    1. Added target language detection in `_score_grammar()` - returns 2 if input language doesn't match target
    2. Added invalid input patterns detection (pure interjections, punctuation, 1-4 Chinese characters)
    3. Raised task relevance threshold from < 2 to < 3 - topic relevance is core metric
    4. Clear conversation history on task completion (keep last 2 messages only)
    5. Added explicit current task indicator in system prompt
    6. Changed ping/pong log level from INFO to DEBUG
  - **Files modified**: `services/workflow-service/src/workflows/proficiency_scoring.py`, `services/ai-omni-service/app/main.py`
- **Magic Passcode "急急如律令" Support (Mar 12, 2026)**: Fixed issues with magic passcode detection and user transcript display.
  - **Root causes identified**:
    1. `import re` referenced before assignment: `import re` was placed inside conditional branch in `conversation.item.input_audio_transcription.completed` event handler
    2. Chinese punctuation not matched: Regex `[,.!?.,!?]` only supported English punctuation, not Chinese `。！？`
    3. User transcript not displayed: Normal input (non-passcode) didn't send `user_transcript` message to frontend
    4. AI response not cancelled: Magic passcode detection didn't prevent AI from replying to the passcode
    5. Task context not updated: After completing task via passcode, `user_context` and AI session prompt weren't refreshed
  - **Fixes applied**:
    1. Removed duplicate `import re` - use global import at file top
    2. Updated regex to `[,.!?.,!?;:;:。！？；：]` supporting both Chinese and English punctuation
    3. Added `else` branch for normal input to send `user_transcript` and save to history
    4. Added `conversation.cancel_response()` call after detecting passcode to prevent AI reply
    5. Fetch next task via `/api/users/goals/next-task` and update `user_context['current_task']` and `user_context['custom_topic']`
    6. Call `_update_session_prompt()` to refresh AI context with new task
    7. Frontend: `test_scenario_review` message only logs to console, doesn't auto-show completion modal (passcode completes single task, not entire scenario)
  - **Files modified**: `services/ai-omni-service/app/main.py`, `client/src/pages/Conversation.js`
  - **Testing**:
    ```bash
    # Test magic passcode (with Chinese punctuation)
    # 1. Refresh page: http://localhost:3000/conversation?scenario=日常问候
    # 2. Click microphone and say "急急如律令。"
    # 3. Expected: User message displayed, task completed, AI no reply, console shows "🧪 [Test Scenario Review] 通关口令生效！"
    
    # Verify code deployment
    docker exec oral_app_ai_omni_service grep "。！？" /app/app/main.py
    ```

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

## Important
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