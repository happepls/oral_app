# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dockerfile Rules

### Node.js Services: Copy node_modules from Host (Do NOT run npm install)

All Node.js service Dockerfiles **must** copy `node_modules` from the host machine
instead of running `npm install` or `npm ci` during the Docker build. This avoids
slow network downloads and ensures build reproducibility using locally installed packages.

**Required pattern:**
```dockerfile
COPY package.json ./
COPY node_modules ./node_modules
# Do NOT add: RUN npm install
```

**Services that already follow this pattern:** user-service, media-processing-service
**Services that still need updating:** comms-service, conversation-service, history-analytics-service

**Before rebuilding a service**, ensure `node_modules` is present on the host:
```bash
cd services/<service-name> && npm install   # only needed once locally
docker compose up -d --build <service-name>
```

> Exception: `client/Dockerfile.prod` uses `npm ci --legacy-peer-deps` in a multi-stage build.
> The `--legacy-peer-deps` flag is required due to peer dependency conflicts introduced by
> `react-i18next` / `i18next` vs `react-scripts@5`. Do NOT remove it.

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
           → task_relevance = round(input_score × correction_penalty × sentence_quality_factor)
           → task_relevance ≤ 5 → delta=0 | 6-7 → delta=1 | ≥8 → delta=2
           → lang quality (fluency/vocab/grammar) does NOT gate delta — task_relevance is sole driver
           → if score >= 9 AND interaction_count >= 3 → task_completed
           → WebSocket push to frontend: proficiency_update | task_completed
           → 3 tasks completed in scenario → scenario_review triggered
```

### Frontend (client/)

- **Framework**: React 19.2.0 + Bootstrap 5 + react-bootstrap (NOT Tailwind despite README mention)
- **Build tool**: react-app-rewired (CRA-based, NOT Vite)
- **Auth**: `AuthContext.js` wraps the entire app; **httpOnly Cookie** (migrated from localStorage); Google OAuth via `@react-oauth/google`. `token` state is always `null` in cookie mode — do NOT rely on it being set. WebSocket auth also uses cookie (comms-service reads `req.headers.cookie` as fallback).
- **Key page**: `pages/Conversation.js` — the main practice interface. Handles WebSocket lifecycle, audio playback queue (`audioQueueRef`), proficiency notifications, task completion UI, and scenario review modal.
- **WebSocket message types** handled in Conversation.js: `proficiency_update`, `task_completed`, `scenario_completed`, `connection_closed`

### Internationalization (i18n)

- **Library**: `react-i18next` + `i18next` (installed with `--legacy-peer-deps`)
- **Config**: `client/src/i18n/index.js` — all 9 language translations inline, initialized synchronously
- **Supported languages**: zh, en, ja, es, fr, ko, de, pt, ru
- **Language detection priority**: `localStorage('ui_language')` → `navigator.language` → default `zh`
- **Language switcher component**: `client/src/components/LanguageSwitcher.js` — drop-in `<select>` for any page
- **Pages with i18n**: Landing, Login, Register, Welcome, Onboarding — all use `useTranslation()`
- **Persistence**: Selected language cached in `localStorage('ui_language')`; persists across sessions
- **NO external IP detection**: Uses `navigator.language` only (privacy-safe). The `COUNTRY_LANG_MAP` in `i18n/index.js` is kept for reference but not used for auto-fetching.
- **Adding a new language**: Add translations object to `resources` in `i18n/index.js`, add entry to `LANGUAGES` array in `LanguageSwitcher.js`, add to `SUPPORTED_LANGS` array.
- **Testing note**: Any component test that renders a page using `useTranslation()` must wrap with `<I18nextProvider i18n={i18n}>`. Existing tests in `__tests__/` do NOT have this wrapper yet — add before writing new page tests.

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

### TTS Endpoint

`POST /tts` is implemented in `ai-omni-service/app/main.py` (Nginx rewrites `/api/ai/tts` → `/tts`). Uses `qwen3-tts-flash` via `dashscope.MultiModalConversation.call()` with voice `Serena`. Supports 10 languages (Chinese, English, Japanese, Korean, French, Spanish, German, Italian, Portuguese, Russian) and mixed-language text in a single call. Returns WAV audio bytes fetched from the OSS URL in the response. Called by `aiAPI.tts()` in `api.js` → `playSelectedText()` in `Conversation.js` for the floating speaker button on selected AI message text.

### Authentication: httpOnly Cookie

- **Login/Register/Google**: `user-service` sets `accessToken` httpOnly cookie (`sameSite: lax`, `path: /api`, 7d TTL)
- **Token migration**: On app init, `AuthContext.js` detects legacy `localStorage.authToken` → calls `POST /api/users/token-migrate` → clears localStorage keys
- **Logout**: `POST /api/users/logout` clears cookie server-side; frontend clears local state
- **WebSocket auth**: comms-service reads token from (1) URL query `?token=`, (2) `Authorization` header, (3) `req.headers.cookie` — browser auto-sends cookie on WS upgrade
- **CORS**: Nginx uses `map $http_origin $cors_origin` (whitelist: localhost:3000, localhost:5001) + `Access-Control-Allow-Credentials: true`. Cannot use `*` wildcard when credentials are included.
- **Gotcha**: `connectWebSocket` previously checked `!token` to abort — changed to `!user` since token is always null in cookie mode

### Proficiency Scoring: task_relevance Design

`_score_task_relevance` in `proficiency_scoring.py` uses a 3-factor formula:
```
final = max(1, min(10, round(input_score × correction_penalty × sentence_quality_factor)))
```

- **input_score**: hits=0→2, hits=1→4, hits=2→7, hits≥3→9
- **correction_penalty**: hard correction (说错了/全然違う/incorrect) → 0.5; soft (曖昧/不够具体/vague/もう少し具体的) → 0.7; teaching suggestion only → 1.0
- **sentence_quality_factor**: <8 chars → 0.6; keyword-only sentence (remaining<4 chars) → 0.7; normal → 1.0
- **Delta gate**: task_relevance ≤5 → delta=0; 6-7 → delta=1; ≥8 → delta=2
- **Anti-cheat**: hits=1 always produces input_score=4 → final≤4 → delta=0 regardless of sentence length
- **Repetitive input** (`_is_repetitive_input`): self-repetition (substring ≥3 chars appears 2+x) OR keyword parroting (≥80% content is keyword chars AND len≤20) → delta=0
- **`task_title`/`scenario_title`**: populated from `current_task` parameter before early-return; DB query only runs when delta>0

### Docker: Python Service Rebuild Rules

- Python 源文件（.py）变更 → `docker compose build <service>` (无 --no-cache，复用 pip 缓存层)
- `requirements.txt` 或 `Dockerfile` 变更 → `docker compose build --no-cache <service>`
- **PyPI 镜像**: `workflow-service` 和 `ai-omni-service` Dockerfile 已配置阿里云镜像源 (`mirrors.aliyun.com/pypi/simple/`)，避免网络超时

### Magic Repetition Phase: Audio & State Design

Two-phase flow per task: **reading** (card visible) → **memory** (card covered). Each has a pass event:
- `magic_pass_first`: reading → memory. Card covered, `magicCardState = 'reciting'`.
- `magic_pass`: memory → next task (or scene_theater). Card uncovered, ✅ animation, then `'waiting'`.

**Audio sequencing**: COS-uploaded audio URLs (not streaming) are the source of truth for playback.
- `audio_url` WebSocket event attaches URL to AI message → `audioPlayed: false` → auto-play `useEffect` calls `playFullAudio(url, autoQueue=true)`.
- `autoQueue=true`: schedules via `nextStartTimeRef` (Web Audio API), does NOT call `stopAudioPlayback()`, enables seamless A→B chaining.
- `autoQueue=false` (default, user replay): calls `stopAudioPlayback()` first, resets `nextStartTimeRef.current = 0`.
- `stopAudioPlayback()` MUST reset `nextStartTimeRef.current = 0` — missing this causes new audio to schedule in silence.

**Response A deletion on magic_pass**: When `magic_pass` fires, Response A (AI commentary) is deleted from the messages array via `setMessages` reverse scan (`for` loop from end, O(n) single pass). `stopAudioPlayback()` stops any in-flight audio. Response B (new task intro) plays normally via `autoQueue`.

**Anti-pattern avoided**: Do NOT use a flag ref (like `suppressNextAIAudioRef`) to suppress Response A's `audio_url` — COS upload completes BEFORE `magic_pass` WebSocket event arrives at the frontend, causing the flag to consume Response B's audio_url instead.

**session_phases isolation**: Keyed by `f"{user_id}:{scenario}"` (not just `user_id`). Each scenario maintains its own phase state independently. `WebSocketCallback.phase_key` = `f"{self.user_id}:{self.scenario or ''}"`. When switching scenarios, a new key is initialized from scratch (phase=magic_repetition, task_index=0).

**Gotcha**: `MAGIC_SENTENCE` brackets — prompts must specify "SQUARE BRACKETS [ ] ONLY, NOT angle brackets < > or ( )". AI historically uses `<>` when prompt template uses `<placeholder>` notation. Regex in frontend and backend matches both: `[\[<]MAGIC_SENTENCE:\s*([^\]>]+?)(?:[\]>]|$)`.

**Docker rebuild shortcut** (when apt network fails): Python source-only changes can be hot-patched:
```bash
docker cp services/ai-omni-service/app/main.py oral_app_ai_omni_service:/app/app/main.py && docker compose restart ai-omni-service
```

### Discovery Page: Goal Completion

When `progress === 100` (all scenarios completed), `Discovery.js` shows a 🏆 achievement modal once per goal (keyed by `goal_all_completed_${goal.id}` in localStorage) plus a persistent CTA banner. Both navigate to `/goal-setting` for setting a new goal.
