# CLAUDE.md

> **⚠️ 本文件由 core-rules.md 自动同步生成**
>
> 请勿直接修改此文件！
> 修改请前往: `core-rules.md`
>
> 最后同步时间: 2026-07-22 16:53:19
> 同步脚本: `sync-core-rules.py`

---

## 工作原则

- 保护用户未提交改动；不擅自 reset、覆盖或删除。搜索优先 `rg`/`rg --files`，编辑用 `apply_patch`。
- 修改前定位真实调用链；修复后运行与风险匹配的测试/构建。密钥只放环境变量，禁止提交 `.env`。
- 前端开发先查 `figma_app_template/src/`：组件/页面参考 `app/`，Token 参考 `imports/design-tokens.json`，静态原型参考 `html_template/`。
- `AGENTS.md` 控制在 150 行以内；复杂专题写入 `docs/`，这里只保留不可违反的规则与索引。

## Docker 与发布

- Node 服务 Dockerfile 必须从宿主复制依赖，禁止镜像内 `npm install`/`npm ci`：
```dockerfile
COPY package.json ./
COPY node_modules ./node_modules
```
- 例外：`client/Dockerfile.prod` 多阶段构建必须保留 `npm ci --legacy-peer-deps`。
- 重建 Node 服务前确保 `services/<name>/node_modules` 存在；必要时先在宿主运行 `npm install`。
- `docker-compose.override.yml` 将 `./client/build` 挂载到 nginx，覆盖镜像 bundle。前端源码修改后必须运行 `cd client && npm run build`；改 nginx/Dockerfile 时再执行 `docker compose up -d --build client-app`。禁止删除 `client/build` 后不重建。
- 前端未生效时依次比较 host、容器、HTTP 返回的 `main.*.js` hash。
- Python `.py` 变更：`docker compose build <service>`；`requirements.txt`/Dockerfile 变更：加 `--no-cache`。ai-omni 源码紧急热补丁可 `docker cp` 后 restart。

## 常用命令

```bash
docker compose up -d --build
cd client && npm start
cd client && npm run build
cd client && npm test
source .venv/bin/activate && python test_client_scenario.py
python3 test_scenario_batch_and_daily_qa.py --scenario all --mock
curl http://localhost:3006/health
docker compose logs workflow-service
docker compose logs ai-omni-service | grep -i "proficiency\|task_completed"
```

- `/build`：构建并分析错误；`/lint`：eslint 自动修复；`/preview`：生成组件 props/用法/示例。
- PostgreSQL 快查：`docker compose exec postgres psql -U user -d oral_app -c "SELECT id, scenario_title, score, status FROM user_tasks ORDER BY created_at DESC LIMIT 5;"`

## 架构与端口

- React 19 + Bootstrap 前端；Nginx api-gateway；PostgreSQL（用户/目标/任务）、MongoDB（历史）、Redis（缓存/会话）。
- 路由：`/api/users/*`→user-service:3002；`/api/history/*`→history:3004；`/api/workflows/*`→workflow:3006；`/ws/ai`→ai-omni:8082；`/ws/comms`→comms:3001；`/api/conversation/*`→conversation:8083。
- 服务：user（认证/档案/目标）、comms（WS 转发）、ai-omni（DashScope 实时 AI）、workflow（纯逻辑评分/规划）、conversation（会话）、history（历史）、media（转码/COS）。
- `JWT_SECRET` 必须跨服务一致；Docker 内网请求可由 `internalAuthWithNetworkSkip` 跳过 JWT。

## 前端与认证

- `AuthContext.js` 使用 httpOnly `accessToken` cookie；cookie 模式 `token` 恒为 `null`，连接判断用 `user`。REST 必须带 credentials；WS upgrade 自动带 cookie，comms 依次读 query/header/cookie。
- Stripe `protect` 中间件必须兼容 Bearer + Cookie；订阅查询 soft-fail，不能因 401 全局跳登录。
- `Conversation.js` 管理 WS、音频队列、评分通知、任务完成和复盘。WS 参数 `scenario`/`voice`/`mode` 必须 `encodeURIComponent()`；comms 必须向 ai-omni 转发 `mode`。
- AI 消息状态：流式未完成→loading；文本完成但音频未到→loading；音频到达或历史 `audioPlayed=true`→default。
- i18n 使用 `react-i18next`，翻译在 `client/src/i18n/locales/*.json`；语言优先级 localStorage `ui_language`→navigator→zh。测试含 `useTranslation()` 页面时包 `I18nextProvider`。
- 默认浅色；`tailwind.config.js` 为 class dark mode，`client/public/index.html` 禁止硬编码 `class="dark"`。

## AI、音频与评分

- 主链路：用户语音→ai-omni→`response.audio.done`→workflow `/proficiency-scoring/update`→WS `proficiency_update|task_completed`；3 个任务完成触发 scenario review。
- 完成条件：`score >= 9 AND interaction_count >= 3`。delta 仅由 `task_relevance` 决定：≤5→0，6–7→1，≥8→2；公式及反作弊实现以 `proficiency_scoring.py` 为准。
- 教学回复必须完全使用 `target_language`；魔法口令 `急急如律令`（允许中文标点）取消当前回复并推进任务。
- 场景生成 `/generate-scenarios`、TTS `/tts` 均在 `ai-omni-service/app/main.py`；api-gateway 是纯 Nginx，`server.js` 为死代码。
- Marker 重合成：剥离 `[TASK_*]` 后用 qwen3-tts-flash；COS 上传前必须 `_wav_extract_pcm()` 去 WAV 头，禁止用 `_trim_wav_onset()`。
- 所有外部 TTS URL 经 `_validated_urlopen()`，仅允许 http(s) 及 `_ALLOWED_TTS_HOSTS`。
- Qwen3.5 Omni Realtime 合法 voice 仅 `Tina`（默认）、`Serena`、`Evan`、`Arda`。

## 学习模式关键契约

- Magic repetition 两阶段：`magic_pass_first` reading→memory；`magic_pass` memory→下一任务/scene theater。自动 COS 音频用 `autoQueue=true`；用户重播先 stop；stop 必须重置 `nextStartTimeRef=0`。收到 `magic_pass` 反向扫描删除 Response A，禁止用 suppress flag。
- phase 状态按 `${user_id}:${scenario}` 隔离。`MAGIC_SENTENCE` 提示要求方括号，前后端正则兼容 `[]`/`<>`。
- Recall：URL `mode=recall`，前后端均从 `magic_repetition` 初始化；comms 必须转发 mode；转入 scene theater 后返回 `/discovery`。
- Daily QA Pro 门控、Redis pool 迁移、re-answer/change-question 端点详见 `docs/test-cases-design-integration.md` 与 ai-omni 测试。
- GoalSetting 为 5 步向导；Onboarding 仅昵称/性别/母语。GoalSetting 支持自定义目标与 4 个合法 voice。
- Discovery 100% 时显示每目标一次的成就弹窗和新目标 CTA。

## Onboarding Tour

- 首次 GoalSetting→Discovery 启动 6 步 tour：today-tasks、recall-streak、stats、scenario-card、mic、cc-mode；支持前后、跳过及跨页返回。
- 完成状态 localStorage + 后端双层持久化；Conversation `mode=tour` 为静态 demo，禁止 WS/fetch/AI。
- 实现：`TourContext.js`、`Spotlight.jsx`、`useAnchorRect.js`；规格见 `docs/superpowers/specs/2026-06-03-onboarding-tour-design.md` 和 `plans/2026-06-04-onboarding-tour-v2.md`。

## Stripe、限额与安全

- Stripe 使用官方 SDK + Checkout Sessions；生产 Zeabur 使用 live keys、live webhook secret、`STRIPE_ALLOWED_ORIGINS=https://guajiguaji.top`。Webhook 必须 raw body 且在 `express.json()` 前注册；不要混用测试/生产对象。
- 生产 webhook URL：`/api/stripe/webhook`；Cloudflare 必须对此路径 WAF Skip，并检查 Bot Fight Mode。完整部署验证见 `docs/test-cases-design-integration.md` §11–12。
- 每日对话轮次由后端 Redis 原子计数强制，前端只负责展示；仅真人场景计数，tour/recall/daily_qa 不计。详细契约与 Lua fallback 见对应服务代码/测试。
- Secret scanning：提交前运行 `gitleaks git --staged --verbose --config .gitleaks.toml`；新开发者安装 `.githooks/pre-commit`。误报只加精确 allowlist。
- 高风险改动（auth、payment、admin、数据导出）必须专项测试；数据库备份 cron 为退订 Zeabur Dev 前阻断项。

## Agent 协作与文档索引

- 多 Agent 仅用于可并行、文件边界清晰的任务；先明确 owner，禁止多人编辑同一文件；主 Agent 负责合并、测试与结论。
- Figma/响应式与 Zeabur 生产验证：`docs/test-cases-design-integration.md`。
- Zeabur 部署：`docs/zeabur-backend-deploy-plan.md`、`docs/zeabur-panel-steps.md`、`docs/zeabur-backend-deploy-checklist.md`。
- E2E 遗留：`docs/E2E_problems_list.md`、`docs/TODO.md`；场景契约测试：`test_scenario_batch_and_daily_qa.py`。