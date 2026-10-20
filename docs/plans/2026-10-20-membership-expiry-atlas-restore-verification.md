# 会员到期与 Atlas COS 恢复演练

状态：隔离恢复、业务读取、会员本地验证，以及后续新增的隔离网页登录与真实 Stripe Test Clock/webhook 演练通过。生产账户页面与生产部署链路仍未演练。未修改生产账户、数据库、配置或旧 MongoDB。根目录活跃 SDLC 工件未替换。

## 范围与证据边界

- 测试源码基线：`3fc1251fc37a0094d6ac49b78dc05e6a6e8487dd`，加本次两个回归测试文件的修改；不表示生产部署版本。
- 用户报告正式切换时间为北京时间 2026-10-08 15:15，即 UTC 07:15；本次未取得当日切换日志。
- 用户提供的网站在仓库中为生产环境，未提供隔离测试站点或可用登录会话。本报告不保存邮箱、账户 ID、密码或会话内容，也未对该生产账户设置到期时间。
- 当前本地 history/backup 容器仍连接旧 Mongo，不能代替生产。生产来源依据是 [10 月 19 日只读记录](2026-10-19-zeabur-mongodb-retirement-assessment.md)：当时 backup 运行时为 Atlas，状态成功，完成时间 UTC `2026-10-18T18:30:13Z`。
- 本次 Zeabur CLI 两次 backup 读取、一次 history 读取均遇到 GraphQL `EOF`；CLI 返回码仍为 0，按输出判定读取失败。直接 Atlas 元数据读取也失败。没有重新证明生产当前配置、源版本或备份时点完整性。

## 会员权限验证

使用新建 `postgres:14-alpine` 和 `redis:7-alpine` 容器，端口仅绑定本机随机端口。SQL 用随机独立 schema 和随机临时用户；Redis 用随机用户键。Stripe API、AI 供应商与部分授权调用在原有测试中为 mock，不能称为线上端到端验证。

| 验证项 | 实际证据 | 边界 |
| --- | --- | --- |
| 预付费自然到期 | 新增可选 5 分钟真实时钟/SQL/HTTP 演练，最终 9 项全部通过 | 不改机器时间；不是生产账户 |
| Stripe 周期末取消 | 后续真实 Test Clock 演练通过，见文末追加记录 | 本地独立用户服务，非生产 webhook/Checkout |
| 预付费已过期、Stripe 有效 | 自然到期后切换临时 SQL 订阅字段检查 Pro 授权 | 不证明真实 Stripe webhook 链路 |
| Stripe 失效、预付费有效 | 临时 SQL canceled + 未来到期时间检查 Pro 授权 | 同上 |
| 免费渐进解锁 | 原有真实 SQL/HTTP 用例覆盖第 4 场景拒绝、完成前置任务后解锁、120 个任务与代际 3 | 未在生产页面演练 |
| 每日问答 | 普通模式授权保留；Pro 操作授权拒绝；Python 直接 re-answer/change-question 路由拒绝测试通过 | 普通问答的实际 AI 生成未调用 |
| 已用额度保留 | 新增真实 Redis 降级测试通过：已用 16 轮时 Pro 可提交第 17 轮，降级后下一轮返回 429，已用仍为 17 | 使用本地默认 15/150，不代表生产配置 |
| 已有 WS 与重连 | 原有 WS 测试覆盖建立后权限失效、下一段音频前拒绝、连接前拒绝和 quota 结算 | FastAPI TestClient，授权响应与供应商为 mock |
| 页面保持打开与刷新恢复 | 原有前端 19 项通过，含预付费开页到期和新鲜 profile 恢复 | 无生产登录、三页截图或重新登录验收 |
| 数据保留与登录 | 新测试比对整条目标、全部任务及非零评分；同一 cookie 继续访问普通入口 | 不证明生产账户历史保留或真实登录接口行为 |

### 实际执行

```bash
# URL 指向本次新建隔离 PostgreSQL，绝不能填生产 URL。
cd services/user-service
SCENE_ACCESS_TEST_DATABASE_URL="$AUDIT_POSTGRES_URL" \
PREPAID_TEST_DATABASE_URL="$AUDIT_POSTGRES_URL" \
npm test -- --runInBand --runTestsByPath \
  src/__tests__/membership.test.js src/__tests__/sceneAccess.test.js \
  src/__tests__/sceneAccess.integration.test.js \
  src/__tests__/prepaid.integration.test.js src/__tests__/stripeWebhook.test.js

SCENE_ACCESS_TEST_DATABASE_URL="$AUDIT_POSTGRES_URL" \
MEMBERSHIP_NATURAL_EXPIRY_AUDIT=true \
npm test -- --runInBand --runTestsByPath src/__tests__/sceneAccess.integration.test.js
```

首个命令在增加可选自然到期用例前为 5 suites / 37 tests 通过。自然到期默认跳过，仅显式设置开关才等待真实五分钟；测试账户在独立 schema 创建并清理。

```bash
# 以下在仓库根目录，Redis URL 指向新建隔离容器。
SCENE_ACCESS_TEST_REDIS_URL="$AUDIT_REDIS_URL" \
  .venv/bin/python -m pytest services/ai-omni-service/tests/test_scene_access.py -q
.venv/bin/python -m pytest services/ai-omni-service/tests/test_daily_turn_limit.py -q
.venv/bin/python -m pytest services/ai-omni-service/tests/test_daily_qa.py -q
cd client
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath \
  src/__tests__/profile-restore.test.js src/__tests__/discovery-paywall.test.js
```

scene_access 最终 39 项（含新增 Redis 降级测试）、daily_turn_limit 17 项、daily_qa 61 项、前端 19 项通过。Python 三文件首次合跑为 104 passed / 12 failed，原因是旧测试安装的全局 Redis/DashScope stub 污染其他文件；逐文件运行通过。保留合跑失败事实，本次未扩大范围修改测试加载器。

首次自然到期本身通过（UTC `01:21:25.349` → `01:26:25.727`），但随后故障注入用例因测试 token 同时过期，整套为 8 passed / 1 failed。已将仅测试 token 有效期由 5 分钟改为 15 分钟，并加入非零分数保留检查后重跑：最终 **9 passed / 0 failed / 0 skipped**，301.161 秒。第二轮数据库到期时间为 UTC `2026-10-20T01:30:25.437Z`，检查完成于 `01:30:25.999Z`（北京时间 09:30:25.999）。到期前 Pro/第 4 场景均 200，到期后均 403；普通场景、普通每日问答授权及目标恢复仍为 200。12 个任务（score=3、interaction_count=4、scoring_generation=3）和目标整行与到期前一致；随后两个权益来源独立保留权限的检查均通过。

## COS 归档恢复

精确对象：`cos://oral-backup-1317719935/backups/oral-app/daily/2026-10-19/20261019T023001+0800.tar.gz`，对应校验文件为同路径加 `.sha256`。COS LastModified 分别为 UTC `2026-10-18T18:30:08Z` / `18:30:12Z`。这与已有生产成功记录相邻，且晚于用户报告切换时间；没有当前成功任务的精确 object 字段原件，来源关联仍依据历史记录。

通过 COS SDK 只读下载，临时目录权限 0700，文件权限 0600。先校验外层 SHA-256，再限制 tar 成员为普通文件和预期名称后解压，逐项比较 `SHA256SUMS`。

| 文件 | SHA-256 | 结果 |
| --- | --- | --- |
| 外层归档 | `b35f696b7e19bd64e78782952dc65bbbe6072aa14b2729956f3c5a436437104e` | 通过 |
| postgres.dump | `0958e4220b3e7aca827ee83719aedc9d48e9bc1f41b24b8eb8fffbbfba17067d` | 通过；未恢复 PostgreSQL |
| mongo.archive.gz | `024e27a231fbc44cf01f8c84f18cf482ddceaf51b83b3ff39e794457d29aa0df` | 通过，237517 bytes |

新建空 MongoDB 实例，镜像 `mongo:8.0`，实际版本 **8.0.34**，镜像 ID `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`。Database Tools **100.19.1**。历史迁移报告的 Atlas 版本为 8.0.34；本次实时源版本读取失败，不能视为重新完成兼容性检查。

仅初始化使用该临时实例的管理员；恢复账号只有 `oral_app_history_restore_audit` 的 `readWrite`。实际验证该账号写入同一临时实例的 `oral_app_history` 被拒绝。恢复使用 0600 配置文件，未使用旧 `restore.sh`，没有执行 PostgreSQL 恢复或 `--drop`：

```bash
mongorestore --config=/tmp/restore-tools.yaml \
  --archive=/tmp/mongo.archive.gz --gzip \
  --nsInclude='oral_app_history.*' \
  --nsFrom='oral_app_history.*' \
  --nsTo='oral_app_history_restore_audit.*' --stopOnError
```

UTC `2026-10-20T01:23:36Z` 开始并完成恢复（北京时间 09:23:36）：**132 document(s) restored successfully，0 document(s) failed to restore**，退出 0。无重复键或索引创建错误。首次临时账号初始化未成功导致认证失败；删除本次新建的空测试实例，修正初始化成功标记检查后重建，最终恢复成功。生产库未被用作恢复目标。

### 集合与索引

`conversations` 共 **132** 条，最早 createdAt 为 UTC `2026-06-23T06:38:21.074Z`，最新 createdAt/updatedAt 为 `2026-10-18T10:41:12.414Z`；最早 updatedAt 为 `2026-06-23T06:52:53.427Z`。

- `_id_`：`{_id: 1}`。
- `userId_1`：`{userId: 1}`，background。
- `sessionId_1`：`{sessionId: 1}`，unique、background。
- `userId_1_goalId_1`：`{userId: 1, goalId: 1}`，background。

恢复后按 `_id` 排序、canonical EJSON 全文摘要：`481d96e0269c90bb54e8b6e53aa20f77a895564b237d9871c01fef47f8f727be`。这是恢复库指纹，**不是与备份时点基线比较通过**。

### 隔离历史服务读取

使用当前源码的真实 Express 路由、historyAuth、controller 和 Mongoose 模型，只监听本机随机端口，连接恢复库，关闭自动建索引。临时签发 cookie token；样本及标识仅在内存比较。统计接口的外部 user-service proficiency 依赖隔离为 503，因此未验证跨服务 proficiency。

| 样本 | createdAt（UTC） | 原始/API 消息 | 有音频 URL 消息 | 列表/详情/消息/统计 |
| --- | --- | --- | --- | --- |
| 切换前 | 2026-10-07T20:49:53.233Z | 26 / 26 | 26 | 全部 200 |
| 切换后 | 2026-10-11T03:35:59.854Z | 7 / 7 | 6 | 全部 200 |

核对 `_id`、userId 关联、消息 ID/数量/时间/audioUrl、按用户统计数量与恢复库一致。未访问音频 URL，不宣称音频文件仍可下载。没有备份时点 ID/字段摘要基线，也未与当前线上库进行全量比较；因此只能证明归档可恢复、索引建立和上述抽样业务读取一致。

## 本地证据与剩余验收

脱敏证据位于忽略目录 `quality/artifacts/latest/`：

- `membership-natural-expiry-20261020.log`：首轮 8 passed / 1 failed，保留失败历史。
- `membership-natural-expiry-final-20261020.log`：最终五分钟演练。
- `membership-scene-access-20261020.log`：真实 Redis/WS 和新增降级测试。
- `cos-mongo-restore-checksums-20261020.json`：双层校验。
- `cos-mongo-restore-execution-20261020.json`、`cos-mongo-restore-20261020.log`：工具版本、时间、恢复日志。
- `cos-mongo-restore-inventory-20261020.json`、`cos-mongo-restored-digest-20261020.json`：数量、索引、时间和恢复库摘要。
- `cos-mongo-restore-business-20261020.json`：只保存样本 ID 哈希及核对布尔值，无消息文本或用户 ID。

初次验证结束时缺少隔离站点登录和 Stripe 投递环境。后续已按用户要求搭建并完成文末演练；页面持续保持打开不刷新、Discovery、真实 AI/WS/每日问答调用以及生产部署链路一致性仍不在本次 Stripe 演练覆盖内。当前证据不构成整项会员验收通过，也不授权暂停或删除 Zeabur 旧 Mongo。

其他实际检查：`node --test scripts/mongo-atlas-rehearsal.test.mjs` 11 项、`python3 quality/tests/daily-monitoring.test.py` 16 项通过；`python3 scripts/sdlc.py validate`、`git diff --check` 和对三个变更文件分别执行的 Gitleaks dir 扫描通过。没有应用代码变更，未构建/部署前端，未提交、推送或合并。

本次恢复容器及其匿名卷、测试 Redis/PostgreSQL、原始备份下载、恢复库凭据、临时会话数据和执行脚本已清理；仅保留脱敏证据。COS 原对象、现有应用容器和生产服务保持原状。

## 后续：真实 Stripe Test Clock/webhook（2026-10-20）

用户要求搭建可登录的隔离环境并完成真实 Stripe 演练。新建 `oral-stripe-audit` Compose project，独立 PostgreSQL/Redis/卷/JWT，网址 `http://billing-audit.localhost:5510`。此环境保留供用户登录，不属于上文已清理的临时容器。操作见 [隔离环境使用说明](../stripe-test-clock-runbook.md)。

核对后，`services/user-service/.env` 的 secret/public key 实际均为 test。创建真实 Stripe **test mode** 对象，未创建新的 Dashboard Sandbox，未使用 live key。原有业务源码、raw-body webhook、签名验证、Stripe API 回查与 SQL 更新均未替换为 mock。Stripe CLI 1.42.1 使用 API version `2026-05-27.dahlia`，实际接收并转发事件至隔离 user-service。CLI 首次经宿主代理连接超时，仅该进程去掉代理后连接成功；未修改全局代理。

执行：

```bash
node scripts/stripe-clock-audit.mjs start
STRIPE_AUDIT_CAPTURE_BROWSER=true node scripts/stripe-clock-audit.mjs rehearse
```

真实浏览器使用已安装 Chrome，通过邮箱/密码表单登录成功并获得 httpOnly cookie；起初默认 Playwright headless shell 缺失，首次尝试在创建 Stripe 对象前失败，随后复用 Chrome。原始失败报告保留，不算通过。

最终演练 `oral-clock-1792461473666`，UTC `2026-10-20T01:57:53.666Z` 至 `01:59:19.804Z`（北京时间 09:57:53 至 09:59:19），**7 个检查点全部通过**：

| 检查点 | Stripe 状态 | 有效权益 | Pro HTTP | profile / subscription HTTP |
| --- | --- | --- | --- | --- |
| subscription.created 实际 webhook 授权 | active | active / subscription | 200 | 200 / 200 |
| 预付费已过期，订阅有效 | active | active / subscription | 200 | 200 / 200 |
| 设置周期末取消 | active | active / subscription | 200 | 200 / 200 |
| Test Clock 到结束前 1 秒 | active | active / subscription | 200 | 200 / 200 |
| Test Clock 到结束后 1 秒，实际 webhook 降级 | canceled | canceled / 无 | 403 | 200 / 200 |
| 订阅失效，本地预付费 fixture 未来 1 小时 | canceled | active / prepaid | 200 | 200 / 200 |
| 两个来源均失效 | canceled | canceled / 无 | 403 | 200 / 200 |

取消后的真实再次登录为 200，返回 canceled。Test Clock 的周期结束时间为 `2026-11-20T01:58:08Z`；仅推进 Stripe 时钟，应用和数据库真实时间未变。此处使用 canceled 表示订阅状态；Pro 403 和免费页面共同证明免费权益，不要求字符串必须为 free。

Stripe 对象（全部为本次专用测试对象）：

- Clock：`clock_1USSJcJlkM4YEMLyRW6QUhAo`。
- Customer：`cus_VTP7clC3KZssCi`。
- Subscription：`sub_1USSJnJlkM4YEMLyEmxwJd2C`。
- Price：`price_1USSJlJlkM4YEMLyVviXbuOs`，每月 USD 1 测试订阅。

真实事件及应用转发结果：

- `customer.subscription.created` / `evt_1USSJpJlkM4YEMLyd34qEI4d` → 200。
- `customer.subscription.updated` / `evt_1USSKJJlkM4YEMLyCB8TKMHr` → 200。
- `customer.subscription.deleted` / `evt_1USSKbJlkM4YEMLyKXxE2zDk` → 200。

已人工查看四张浏览器截图：会员时个人页显示 Active、订阅页显示 Membership active；降级后个人页显示 Free plan、订阅页会员横幅消失并恢复 Subscribe now。采用页面导航重载核对；不宣称持续保持打开页面会自动同步。历史统计依赖没有启动，个人页相应显示真实不可用提示。截图为现有 `client/build`，不证明生产 bundle 或线上页面行为相同。

本地证据目录 `quality/artifacts/stripe-clock-audit/`：

- `environment.json`：隔离登录与 listener ready。
- `oral-clock-1792461473666.json`：检查点、UTC、测试对象及真实事件投递记录。
- `oral-clock-1792461473666-event-confirmation.json`：Stripe API 只读确认事件与本次订阅关联及 test mode。
- `oral-clock-1792461473666-{active,canceled}-{profile,subscription}.png`：四张截图。
- `private/`：0600 登录文件/测试环境变量/listener 日志，目录 0700，全部忽略追踪；其中签名 secret 不可分享。

本次只启动 billing 所需服务，未接入 AI、历史、邮件或短信，未触发真实扣款。Product/Price 已归档，Clock/Customer/canceled 订阅留在 Stripe test mode 供核查。隔离登录与 listener 保留运行，用户可用说明中的 stop 命令停止。未提交、合并或部署生产。

补充安全与工具检查：实际发送缺失/无效签名请求均返回 400；Stripe API 只读确认 Product/Price 均为 inactive，记录在 `security-and-cleanup.json`。两项密钥/隔离配置护栏测试、脚本 ESLint、Compose config 校验、运行中 Nginx `-t`、新增六个文件的 Gitleaks 扫描、`git diff --check` 和 SDLC validator 均通过。没有运行全库构建或声称生产集成验收通过。

## 后续：修复隔离账户场景生成 502

用户在登录后创建场景遇到 502。确认请求链为浏览器 `/api/v1/ai/scenarios` → nginx → developer-api-service → `ai-omni-service:8082/generate-scenarios`；此前会员专用环境未启动 AI 上游，facade 报 `upstream_unavailable`。原验证漏查了登录后的目标创建路径。

新增可选 `scenarios` Compose profile，使用同一隔离网络和 user-service/Redis/JWT/internal secret。`start` 仅从根 `.env` 读取公开 DashScope 所需的 `QWEN3_OMNI_API_KEY`，存在时启动 AI。没有把请求转给生产或原本地应用的 AI/数据库。`.env` 文件继续只存在于私有目录；AI 的 Docker build context 增加 `.env` 排除。启动脚本只在新建账号时写默认档案，重启不会反复覆盖测试账号的语言设置。

UTC `2026-10-20T02:13:09.576Z`（北京时间 10:13），使用主隔离账户 cookie 和新的幂等键实际请求场景生成，HTTP 200，8935ms，10 个场景，每个 3 个任务。证据：`quality/artifacts/stripe-clock-audit/scenario-generation-check.json`。

UTC `2026-10-20T02:14:34.916Z`，另建独立 smoke 账户，通过真实 Chrome 登录与完整五步向导再次调用真实模型：生成 200、10×3，确认保存 201，成功跳转 `/discovery`，权威 `/api/v1/goals/active` 快照 200 且 10×3。没有保存或替换主测试账户的目标。证据：`scenario-browser-smoke.json`、`scenario-wizard-generated.png`，回归命令为 `node scripts/stripe-audit-scenarios-smoke.mjs`。

首次截图捕获到进入动画的低透明度帧；补充等待所有父级 opacity 稳定后，于 UTC `02:16:25.904Z` 重跑，同样全部通过。上述两个证据文件保存最新这次结果和已稳定的场景列表截图。Compose profile 校验、两项隔离护栏测试、两个脚本 ESLint、变更文件 secret scan、diff 检查和 SDLC validator 通过。

隔离 AI 服务已保留运行。此补充覆盖文本场景生成和目标保存；未接入的业务 WebSocket、音频、历史、短信或邮件链路不在验收范围。无前端源码变更，因此复用现有 `client/build`，未重新构建或部署生产。

## 提交前检查与 master 合入评估

用户随后要求提交当前修改并评估远端 master。已 fetch，远端基线为 `40c2fb687727041e416c83a0810a80956569ffdf`，原音频修复已由 PR #90 合入；在该基线上新建 `test/membership-stripe-restore-audit`，工作区没有与基线冲突。没有直推或修改 master。

审查补强：每个会员检查点同时比较 profile、subscription 返回的有效状态和 Pro 授权；webhook 证据只读取本轮日志，并通过 Stripe API 确认属于本次 test subscription，created/updated/deleted 三类都必须有 200 投递。新增反例覆盖其他订阅、live 事件、缺失事件和失败投递。新逻辑已用之前真实演练的 event-confirmation 与 listener 日志重新核对，3 个关联事件、3 次成功投递；未为此再次修改用户的 Stripe 订阅或测试账号。

实际提交前检查：

- `npm run verify`：exit 0，decision=pass，final_score=100。包含前端完整构建、648 项前端测试、212 项 user-service 测试（42 skipped）、401 项 ai-omni 测试（11 skipped）及其余仓库检查。根 lint 0 errors / 37 warnings。可选真实 SQL/Redis/五分钟测试不在统一验证中冒充执行，其本轮较早真实执行结果见前文。
- `node --test scripts/stripe-clock-audit.test.mjs`：3 项全部通过。
- 三个演练脚本 ESLint、暂存区 `gitleaks git --staged --verbose --config .gitleaks.toml`、`git diff --cached --check`、SDLC precommit：通过。
- 统一验证此次确实重建了前端，更新宿主忽略的 `client/build`；没有前端源码提交，也没有部署生产。

GitHub API 只读核对：master 的 `required_status_checks.strict=true`，required contexts 为 `test`、`ui-audit`，`enforce_admins=true`。这些结果来自实际远端设置，非 workflow 文件推断。该候选提交尚未推送，尚无该提交的远端 CI 或独立 PR 审查结果。结论：本地具备提交和推送功能分支条件；通过 PR、远端 required checks 与人工审核后再合入 master。仓库 AGENTS.md 另明确禁止 Agent 直推 master，因此本轮不执行直推。
