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

### client-app: Host Bind-Mount Overrides Image Build (重要)

`docker-compose.override.yml` 把宿主 `./client/build` 以 bind mount 形式挂到容器
`/usr/share/nginx/html:ro`。这是开发期为"改完前端代码后跳过 image rebuild"设计的，
但**会让镜像里 multi-stage build 出的新 bundle 被宿主旧 build 完全覆盖**——容器
始终服务宿主目录的内容，与镜像内容无关。

```yaml
# docker-compose.override.yml
services:
  client-app:
    image: oral_app-client-app:latest
    volumes:
      - ./client/build:/usr/share/nginx/html:ro
```

**症状**：改了 `client/src/`，跑 `docker compose up -d --build client-app`
甚至 `--no-cache` 重建，浏览器看到的还是旧版；`docker exec ... ls /usr/share/nginx/html/static/js`
显示的是几天前的 hash 和时间戳；但 `docker run --rm oral_app-client-app:latest sh -c 'ls /usr/share/nginx/html/static/js'`
能看到新 build。

**前端修改后正确的发布顺序**（必须先 host build，再容器拉新文件）：
```bash
cd client && npm run build          # 1. 重新生成 ./client/build/（webpack 写新 hash 进 index.html）
# nginx 容器立即生效，无需 docker rebuild —— volume 是 ro 但是宿主写入是允许的
```

需要重建 image（如改了 nginx.conf 或 Dockerfile）时，**两步都做**：
```bash
cd client && npm run build
docker compose up -d --build client-app
```

**绝对不要 `rm -rf client/build`** 之后忘了 `npm run build` —— 那会让 nginx 容器
返回 404 直到下一次构建。覆盖式 `npm run build` 安全：webpack 会按 content hash
写新文件，老 hash 的 main.*.js 残留但 index.html 引用更新，nginx 直接服务新版。

**调试入口**：怀疑前端"代码没生效"时，先验证三层：
```bash
ls -la client/build/static/js/main.*.js                       # 1. host build 是否新鲜
docker exec oral_app_client_app ls /usr/share/nginx/html/static/js/  # 2. 容器内（=host build）是否同步
curl -s http://localhost:5001/ | grep -oE 'main\.[a-z0-9]+\.js' # 3. nginx 实际服务的 hash
```
三处 hash 应一致；任何一处脱节都说明 host build 没跑或被覆盖。

**配套陷阱**：`stripeRoutes` 的 `protect` 中间件早期只读 `Authorization: Bearer`，
不读 cookie。Cookie 模式下任何走 stripeRoutes 的接口都会 401。前端
`handleResponse` 见 401 直接 `window.location.href = '/login'`，造成
"点 Profile 自动跳登录"。已在 `services/user-service/src/middleware/authMiddleware.js`
修复为同时支持 Bearer + Cookie；`userAPI.getSubscription()` 也做了 soft-fail 不触发
全局重定向。新增受保护的 stripe 路由前，确认 `protect` 仍兼容 cookie。

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

# Batch-eval + daily-QA E2E scenarios
python3 test_scenario_batch_and_daily_qa.py --scenario all --mock   # no backend needed
python3 test_scenario_batch_and_daily_qa.py --scenario batch \
    --api-base http://localhost:8081 \
    --ws-url ws://localhost:8081/api/ws/ai \
    --token "$JWT"                                                   # real stack
# Scenarios: batch | daily | cheat | all
# --mock uses in-process fakes that replay expected server frames, so the
# assertion skeleton runs green today and serves as the contract spec
# backend must satisfy (tip_source inline->batch_eval, [NATIVE:] in correct
# mode, [DAILY_QA_PASSED] marker, daily_qa_completed WS event, cache hit).
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
- **AI message state machine** (text/audio sync): `isFinal=false` → loading (streaming); `isFinal=true && !audioUrl && audioPlayed!==true` → loading (waiting for audio); `isFinal=true && audioUrl` → default (both ready, sync display); `audioPlayed===true` → default (history message, skip loading even without audioUrl). WebSocket URL params (`scenario`/`voice`/`mode`) must use `encodeURIComponent()`.

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

### TTS Re-synthesis: Marker Stripping

DashScope Qwen3-Omni generates text+audio simultaneously in streaming — markers like `[TASK_1_COMPLETE]` embedded in text get spoken in audio. Post-processing in `upload_ai_task`:
1. `_MARKER_RE` regex detects markers in `latest_ai_text`
2. Strip markers → re-synthesize clean audio via `qwen3-tts-flash` (`_synth_clean`)
3. `_wav_extract_pcm()` strips WAV RIFF header (44+ bytes) to extract raw PCM data — **critical** because `media-processing-service` uses ffmpeg `-f s16le` which interprets WAV header bytes as high-amplitude samples causing a "ping" sound
4. Clean PCM uploaded to COS → `audio_url` sent to frontend

**Gotcha**: `_trim_wav_onset()` (trims 150ms from audio data start) is only for the `/tts` endpoint (browser-facing WAV). Do NOT apply it to COS upload path — that path needs `_wav_extract_pcm()` instead.

### URL Fetch Security: `_validated_urlopen`

All `urllib.request.urlopen` calls on external URLs (DashScope TTS response URLs) go through `_validated_urlopen()` which enforces:
- Domain allowlist: `dashscope.aliyuncs.com`, `oss-cn-{beijing,hangzhou,shanghai}.aliyuncs.com`
- Scheme allowlist: `http`, `https` only

If DashScope changes their audio URL domain, update `_ALLOWED_TTS_HOSTS` in `main.py`.

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
- **sentence_quality_factor**: CJK languages (Japanese/Chinese/Korean) use `_min_len=4, _min_remaining=2`; others use `_min_len=8, _min_remaining=4`. Below `_min_len` → 0.6; keyword-only (remaining < `_min_remaining`) → 0.7; normal → 1.0
- **Delta gate**: task_relevance ≤5 → delta=0; 6-7 → delta=1; ≥8 → delta=2
- **Anti-cheat**: hits=1 always produces input_score=4 → final≤4 → delta=0 regardless of sentence length
- **Repetitive input** (`_is_repetitive_input`): self-repetition (substring ≥5 chars appears 3+x, MIN_SEGMENT=5, MIN_COUNT=3) OR keyword parroting (≥90% content is keyword chars AND len≤15) → delta=0
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

### Recall Mode: 今日复述 (mode=recall)

Discovery.js shows a 今日复述 card linking to `/conversation?mode=recall&scenario=<name>`. This triggers a standalone magic repetition session.

**Frontend (Conversation.js)**:
- `isRecallMode` is initialized via `useRef(new URLSearchParams(...).get('mode') === 'recall').current` — use `useRef` to avoid re-parsing on every render.
- When `isRecallMode=true`: `currentPhase` and `currentPhaseRef` initialize to `'magic_repetition'` instead of `'scene_theater'`.
- Magic card UI only renders when `isRecallMode && currentPhase === 'magic_repetition'`.
- Phase dot for `magic_repetition` only visible when `isRecallMode`.
- `phase_transition` to `scene_theater` in recall mode → `navigate('/discovery')` immediately (no scene_theater play).

**Backend (ai-omni-service/main.py)**:
- WebSocket endpoint accepts `mode: str = Query(None)`.
- `is_recall_mode = (mode == 'recall')` → `initial_phase = "magic_repetition"` if recall.
- On reconnect: if `not is_recall_mode` and existing phase is `magic_repetition` → force to `scene_theater`.

**comms-service (CRITICAL)**:
- `mode` query param MUST be extracted from client URL and forwarded to ai-omni-service.
- Pattern: `const mode = queryObject.mode;` → `if (mode) aiUrl.searchParams.set('mode', mode);`
- **Gotcha**: If `mode` is not forwarded, the backend always initializes in `scene_theater` regardless of the client's intent, breaking recall mode entirely.

### GoalSetting.js: Multi-Step Onboarding Wizard

5-step animated wizard (`TOTAL_STEPS = 5`):
- **Step 1**: Welcome screen (🦜, feature cards)
- **Step 2**: Target language (**29 options**, Qwen3.5-Omni full support list) + target level; language grid uses `maxHeight:280px, overflowY:auto` scroll
- **Step 3**: Proficiency quiz (4 questions from `QUIZ_QUESTIONS`, rendered one at a time via `currentQ` state)
- **Step 4**: Goal type (5 presets + **"自定义" custom option**) + interests textarea (maxLength=100) + AI voice selection (Tina/Serena/Evan/Arda)
- **Step 5**: AI-generated scenarios review (edit title/delete)

Key implementation notes:
- `displayStep = step - 1`, `displayTotal = TOTAL_STEPS - 1` — welcome step excluded from progress count.
- `AnimatePresence key={step === 3 ? \`3-${currentQ}\` : step}` — question-level slide animation within step 3.
- **QUIZ_QUESTIONS** and scoring functions (`calcQuizScore`, `scoreToProficiency`, `getLevel`) are **only in GoalSetting.js** — Onboarding.js no longer has a quiz step.
- **Custom goal type**: `GOAL_TYPES` includes `{ value: 'custom', ... }`. When selected, a text input appears. `handleGenerateScenarios` and `handleSubmit` both use `finalGoalType = goalType === 'custom' ? customGoalType.trim() : goalType`.
- **Voice validation**: `selectedVoice` initializes via lazy `useState(() => ...)` — validates stored value against `VOICE_OPTIONS` and falls back to `'Tina'` if invalid (guards against stale localStorage from old voice names like Nofish/Momo/Ryan).
- `handleGenerateScenarios` calls `aiAPI.generateScenarios()` → result populates step 5 scenarios.

### Onboarding.js: Single-Step Basic Info Only

Onboarding is now a **single-step** form (nickname + gender + native language). The proficiency quiz has been removed — it only exists in GoalSetting Step 3.
- `handleSubmit` calls `updateProfile({ nickname, gender, native_language })` then navigates directly to `/goal-setting` with no state payload.
- `QUIZ_QUESTIONS`, `LEVEL_MAP`, `calcScore`, `scoreToProficiency`, `getLevel` — all deleted from Onboarding.js.
- **Gotcha**: Previously Onboarding passed `suggestedLevel/proficiencyScore/cefrLabel` via navigation state. GoalSetting now ignores this (uses its own quiz result). No state needs to be passed.

### AI Voice: Qwen3.5-Omni-Realtime Supported Voices

Valid voices for `qwen3.5-omni-plus-realtime` (source: aliyun omni-voice-list):
`Tina` (default), `Serena`, `Evan`, `Arda`

**Gotcha**: `Nofish`, `Momo`, `Ryan`, `Cherry` are NOT valid for this model — they cause WebSocket 400 `InvalidParameter` errors. `Cherry` is the default for `Qwen3-Omni-Flash-Realtime`, not `Qwen3.5-Omni-Realtime`.
- Default voice in `ai-omni-service/app/main.py` line ~703: `os.getenv("QWEN3_OMNI_VOICE", "Tina")`
- Frontend `VOICE_OPTIONS` in `GoalSetting.js`: Tina / Serena / Evan / Arda

### Frontend Design: Figma Design System Reference

**所有前端模块开发必须严格参考 `figma_app_template/src/` 中导出的设计元素**：
- 组件样式、颜色、间距 → 参考 `figma_app_template/src/app/components/`
- 设计 Token（颜色/字号/圆角等） → `figma_app_template/src/imports/design-tokens.json`（已同步至 `client/src/imports/design-tokens.json`）
- 页面布局和交互模式 → `figma_app_template/src/app/pages/`
- HTML 静态原型 → `figma_app_template/src/html_template/`

开发新页面或组件时，先在 `figma_app_template/src/` 中查找对应的 Figma 导出参考，再动手实现。

### Theme: Forcing Light Mode

`tailwind.config.js` uses `darkMode: "class"` — dark mode only activates when `<html>` has `class="dark"`.

**Gotcha**: `client/public/index.html` previously had `<html lang="zh-CN" class="dark">` hardcoded, forcing dark mode on all pages regardless of Tailwind classes. Removed `class="dark"` to restore light-mode default. If dark mode re-appears unexpectedly, check `index.html` first.

### Secret Scanning

Three-layer defense against credential leaks:

1. **Git pre-commit hook** — runs `gitleaks` on staged files, blocks commit if secrets detected
2. **Claude Code PreToolUse hook** — intercepts `git commit` commands in Claude Code, runs gitleaks scan
3. **GitHub MCP Server** — queries remote secret scanning alerts (`list_secret_scanning_alerts`)

**Setup for new developers:**
```bash
brew install gitleaks
cp .githooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

**Manual scan:**
```bash
gitleaks git --verbose --config .gitleaks.toml           # full repo
gitleaks git --staged --verbose --config .gitleaks.toml  # staged only
```

**False positive?** Add pattern to `.gitleaks.toml` allowlist section.

**Remote monitoring** (requires `GITHUB_PERSONAL_ACCESS_TOKEN` in `.claude/settings.local.json`):
- Ask Claude Code: "List secret scanning alerts for happepls/oral_app"

## 可用工具整合

### 已安装插件 (Plugins)

| 插件 | 作用域 | 说明 |
|------|--------|------|
| superpowers v5.0.7 | user | 开发全流程技能包（brainstorming/TDD/debugging/plans/code-review 等） |
| skill-creator | user | 创建、测试、优化自定义 Skill |
| code-review | user | PR 代码审查 |
| commit-commands | user | Git commit/push/PR 快捷操作 |
| frontend-design | project | 高质量前端界面生成 |
| context7 | user | 第三方库文档实时查询 |
| playwright | user | Playwright 浏览器自动化测试 |
| minimalist-entrepreneur | user | 精益创业方法论（MVP/定价/获客等 10 个技能） |
| kotlin-lsp / pyright-lsp / swift-lsp | user | 语言 LSP 支持 |
| security-guidance | user | 安全指导 |

### Skills 清单

#### 核心工作流 (superpowers)
| Skill | 触发场景 |
|-------|----------|
| `superpowers:brainstorming` | 任何创造性工作（新功能/组件/行为修改）前必用 |
| `superpowers:writing-plans` | 多步任务实施前，制定实施方案 |
| `superpowers:executing-plans` | 按计划执行实施，含审查检查点 |
| `superpowers:test-driven-development` | 实现功能/修复 bug 前，先写测试 |
| `superpowers:systematic-debugging` | 遇到 bug/测试失败/意外行为时 |
| `superpowers:verification-before-completion` | 宣布完成前，运行验证命令确认 |
| `superpowers:requesting-code-review` | 完成任务后请求代码审查 |
| `superpowers:receiving-code-review` | 收到 code review 反馈后 |
| `superpowers:dispatching-parallel-agents` | 2+ 独立任务可并行时 |
| `superpowers:subagent-driven-development` | 当前会话内按计划并行执行 |
| `superpowers:using-git-worktrees` | 需要隔离的 feature 开发 |
| `superpowers:finishing-a-development-branch` | 实现完成后决定 merge/PR/cleanup |
| `superpowers:writing-skills` | 创建或编辑 Skill |

#### Skill 创建器
| Skill | 触发场景 |
|-------|----------|
| `skill-creator:skill-creator` | 创建新 Skill / 编辑优化现有 Skill / 跑评估测试 |

#### Git & 代码审查
| Skill | 触发场景 |
|-------|----------|
| `code-review:code-review` | PR 代码审查 |
| `commit-commands:commit` | 创建 git commit |
| `commit-commands:commit-push-pr` | 一键 commit → push → 开 PR |
| `commit-commands:clean_gone` | 清理已删除远程分支的本地残留 |

#### 前端设计
| Skill | 触发场景 |
|-------|----------|
| `frontend-design:frontend-design` | 构建 Web 组件/页面/应用，高设计质量 |

#### 精益创业 (minimalist-entrepreneur)
| Skill | 触发场景 |
|-------|----------|
| `minimalist-entrepreneur:validate-idea` | 验证商业想法 |
| `minimalist-entrepreneur:find-community` | 发现目标社区 |
| `minimalist-entrepreneur:processize` | 手动优先流程化 |
| `minimalist-entrepreneur:mvp` | 构建 MVP |
| `minimalist-entrepreneur:first-customers` | 获取前 100 个客户 |
| `minimalist-entrepreneur:pricing` | 定价策略 |
| `minimalist-entrepreneur:marketing-plan` | 内容营销计划 |
| `minimalist-entrepreneur:grow-sustainably` | 可持续增长决策 |
| `minimalist-entrepreneur:company-values` | 定义公司价值观 |
| `minimalist-entrepreneur:minimalist-review` | 商业决策审查 |

#### 通用 Skills
| Skill | 触发场景 |
|-------|----------|
| `claude-api` | 构建/调试 Claude API / Anthropic SDK 应用 |
| `update-config` | 修改 settings.json（hooks/权限/env） |
| `simplify` | 审查变更代码，优化质量 |
| `init` | 初始化 CLAUDE.md |
| `review` | 审查 PR |
| `security-review` | 安全审查当前分支变更 |
| `loop` | 定时循环执行 prompt |
| `schedule` | 创建 cron 定时远程 agent |

#### 项目专用 Skills
| Skill | 触发场景 |
|-------|----------|
| `create_oral_app_team` | 启动/重建 Oral App Agent Team |
| `finish_today` | 提交前收尾检查 |

### MCP 服务器 & 工具

#### chrome 浏览器自动化 (`mcp__claude-in-chrome__*`)
页面导航、DOM 读取、表单填写、JS 执行、截图、GIF 录制、控制台/网络日志、多标签管理

#### 桌面控制 (`mcp__computer-use__*`)
截图、鼠标点击/拖拽/滚动、键盘输入、应用启动、剪贴板读写

#### Figma 设计 (`mcp__figma__*`)
文档/页面/节点 CRUD、样式设置（填充/描边/渐变/效果/圆角/自动布局）、文本排版、图片/SVG 操作、组件/变量管理、导出

#### Firecrawl 爬虫 (`mcp__firecrawl__*`)
网页抓取、站点爬取、搜索、数据提取、浏览器实例管理、监控

#### Playwright 测试 (`mcp__plugin_playwright_playwright__*`)
浏览器导航、快照/截图、点击/填表/拖拽、JS 执行、网络请求监听、对话框处理

#### 数据库 (`mcp__postgres__*`)
PostgreSQL 直接查询

#### 文档查询 (`mcp__plugin_context7_context7__*`)
`resolve-library-id` → `query-docs`：查询任意库/框架的最新文档

#### 搜索 (`mcp__WebSearch__*`)
百炼 Web 搜索

#### Google 服务 (OAuth)
Gmail、Google Calendar、Google Drive（需 OAuth 认证）

### 内置工具 (Built-in)

| 工具 | 说明 |
|------|------|
| `Read` / `Edit` / `Write` | 文件读写编辑 |
| `Bash` | Shell 命令执行 |
| `Agent` | 派生子 Agent（类型：claude/Explore/general-purpose/Plan/code-reviewer） |
| `WebFetch` / `WebSearch` | 网页抓取 / 搜索 |
| `Skill` / `ToolSearch` | 调用 Skill / 搜索延迟加载工具 |
| `Task*` | 任务创建/跟踪/管理 |
| `EnterPlanMode` / `ExitPlanMode` | 计划模式 |
| `EnterWorktree` / `ExitWorktree` | Git worktree 隔离 |
| `Monitor` | 监听后台进程事件 |
| `NotebookEdit` | Jupyter notebook 编辑 |
| `LSP` | 语言服务器协议操作 |
| `SendMessage` | 向子 Agent 发消息 |
| `PushNotification` | 推送通知 |
| `Cron*` | 定时任务管理 |
| `Team*` | Agent 团队管理 |
| `ScheduleWakeup` | 动态 loop 调度 |
| `RemoteTrigger` | 远程触发 |

### 权限配置

#### 全局自动允许 (`~/.claude/settings.json`)
```
WebFetch, Bash(cat/file/find/gem list/ls/open/plutil)
```

#### 全局禁止（破坏性操作）
```
rm -rf/r/f/R, git push --force/-f, git reset --hard, git branch -D,
git clean -f, sudo, shutdown, reboot, dd, mkfs, diskutil erase,
chmod 777, truncate
```

#### 项目自动允许 (`.claude/settings.local.json`)
```
mcp__WebSearch__bailian_web_search
Bash(gh api/docker compose/docker exec/docker ps/npm run/npx react-app-rewired/git/curl/grep/python3 -m py_compile)
mcp__figma__(get_document_info/join_channel)
mcp__github__(list_secret_scanning_alerts/get_secret_scanning_alert/list_code_scanning_alerts)
```

#### 默认权限模式
`acceptEdits` — 文件编辑自动批准，其他操作需确认
