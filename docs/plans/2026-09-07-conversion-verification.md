# 转化问题修复验证记录

2026-09-07；分支 `fix/conversion-pricing-quick-experience`。用户已批准实施，业务改动仅在本地，尚未提交/推送/生产发布。用户原有 TODO 与需求单改动未覆盖。旧 SDLC 根工件保留。

## P0：价格加载与降级

源码链路：首页/订阅页 → usePricingCatalog → user-service Stripe 目录路由 → 成功目录短时缓存 → Stripe SDK。

- 本地日志无 Stripe 价格错误；生产目录抽查 HTTP 200，USD 4.99/week、99/year。未获得生产间歇失败时段日志，不能宣称故障根因已被证实或生产已修复。
- 两个页面统一校验状态码和价格结构；8 秒超时、最多两次请求、手动重试、取消时阻止迟到状态覆盖。保留有效套餐，缺失套餐单独降级。
- 无实时价格时展示参考价、当地语言说明和“即将开放”，禁用该付费 CTA；免费入口保持可用。没有可用于 Checkout 的静态 price ID。
- 订阅页慢请求也不再阻塞免费方案和返回导航；加载状态仅作用于付费价格与按钮。
- 服务端缓存有效期 60 秒、合并并发请求；过期失败不继续返回过期价格。错误日志只含类型、状态和耗时。
- 年付节省采用相同币种下 `floor((1 - 年价 / (周价 × 52)) × 100)`；当前为 61%，文案明确基准，降级价格不宣传折扣。

## P1：注册后快速体验

源码链路：邮箱/手机号 Register 成功 → 登录保护的 /quick-experience → 实时 ticket → comms 白名单转发 quick_experience → AI 服务独立 handler → Redis 账号状态 + Qwen ASR/音频 + Qwen 文本反馈。

- 无需资料或目标，英文自我介绍 + 两个预制追问；可录音或输入英文。最低有效输入为三个英文单词，不声称这是能力评分或正式任务达标。
- 服务端阶段检查阻止重复提交推进；账号锁避免两个窗口同时练习；Redis 不可用时关闭体验；真实回答计入现有每日额度。
- 每账号保留一次三回答体验状态，刷新/重连不重置。音频提交和播报各最多六次，反馈最多三次尝试。完成反馈后引导资料/目标设置。
- 独立 handler 在正式历史、目标、评分和 phase 初始化之前返回，不写正式任务进度，不触发原场景成就。
- 反馈基于真实三个回答生成 strengths/improvements/example，不生成虚假分数；失败保留回答并明确提示重试。UI 文案覆盖现有九种语言，教学与反馈为英文。
- 录音退出时关闭麦克风；播放停止归零队列时钟；重连、权限拒绝、重复提交和失败均有 UI 状态。

## 已执行验证

- 新增价格 hook/计算测试 8 项、目录缓存测试 3 项通过。
- 邮箱/手机号注册及账户页面测试通过；快速体验组件测试 3 项通过。
- `node --test services/comms-service/test/realtime.test.js`：6 项通过，含 quick_experience 模式和 ticket 转发。
- `.venv/bin/python -m pytest services/ai-omni-service/tests -q`：211 项通过，含新增 6 项体验状态/额度/隔离/重试测试。
- `.venv/bin/python test_scenario_batch_and_daily_qa.py --scenario all --mock`：25 项通过，0 失败。
- `npm run verify`：修正新增测试文件位置和测试 stub lint 后，返回 pass / 100；前端 561 项、user-service 137 项、AI 服务 211 项通过，其余结果见忽略目录 quality/artifacts/latest。后续录音资源清理微调再次通过体验组件测试与前端 build。
- `npm run build`：通过，仍有仓库现有 lint/Browserslist 警告。client/build 已更新；未删除挂载产物。
- `docker compose build ai-omni-service user-service comms-service`：通过；`docker compose up -d --no-deps user-service comms-service ai-omni-service`：本地重建服务已启动。
- `PLAYWRIGHT_BASE_URL=http://localhost:5001 npm run verify:ui -- -- --grep 'pricing fallback|quick interview|phone registration' --project=chromium-desktop --project=chromium-375`：8 项通过，覆盖降级→重试恢复、快速体验→反馈→资料引导、手机注册及错误态。界面用模拟 API/WS 隔离网络；无严重/关键 axe 违规、无水平溢出。截图在 quality/artifacts/playwright-results，已查看移动端反馈截图。
- 本地真实服务文字 smoke：临时合成测试账号，三个英文回答，实际 Qwen 反馈字段完整；账号及 Redis 测试数据清理。
- 本地真实服务语音 smoke：系统合成英文语音 → PCM 16 kHz → 真实 ASR 接受回答；收到 18 个 AI 音频帧，三回答后生成真实反馈；账号及 Redis 测试数据清理。此项是合成语音，非人工发音验收。
- 浏览器完整实测发现并修复：旧 get_user_context 在携带场景、目标为空时异常。新增 profile_only 路径，快速体验只读身份/订阅，不调用目标接口；新增 2 项身份上下文回归通过。
- 修复后真实浏览器复验：本地临时无目标账号 → cookie 鉴权 → 真实 realtime ticket → 点击听题/录音 → Chrome 虚拟麦克风输入合成英文 → 实际 ASR 接受第一回答 → 两次输入追问回答 → 实际 Qwen 反馈 → 点击进入 onboarding。结果 browserVoice=true、threeAnswers=true、liveReport=true、overflow=false、pageErrors=0；合成测试账号、关联本地审计记录和 Redis 状态均清理。截图 quality/artifacts/quick-live-browser.png 已查看。
- `python3 scripts/sdlc.py validate`：clean；`git diff --check`：通过。
- 最终改动后再次 `npm run verify`：pass / 100。最终前端 562 项、user-service 137 项、AI 服务 213 项通过；包含慢价格请求不阻塞免费方案/返回导航的新增回归。收尾曾出现测试可访问名称与重复翻译 fixture key 问题，已修正并复验，不计为通过证据。
- 最终本地 bundle `/static/js/main.760cd879.js`：host、client-app 容器和 HTTP 字节一致，SHA-256 `fb32ff3738dc26c3fafbfffb4e57e0370cdf4076bd5fef059a4b3348797b51b3`。未提交、推送或生产发布。

没有宣称独立 Agent 审查、人工发音验收、生产间歇故障根因或业务生产发布通过。后续用户反馈和提交授权见下文。

## SDLC 监控异常

失败运行：https://github.com/happepls/oral_app/actions/runs/34087112066

日志在发出请求前报 `PRODUCTION_HEALTH_URL is missing`。`gh variable list --json name` 与 `gh secret list --json name` 当时均为空。不是生产服务宕机证据。

核实网关映射 `/api/users/health` → user-service `/api/health`，生产请求 HTTP 200，返回 user-service 状态。

已执行非敏感配置修复：

```sh
gh variable set PRODUCTION_HEALTH_URL --body 'https://guajiguaji.top/api/users/health'
gh workflow run sdlc-maintain.yml -f cadence=health
```

复验成功：https://github.com/happepls/oral_app/actions/runs/34088475529

此运行完成健康探测、汇总、证据上传和窗口状态保存；按 health 范围跳过聚合、每日摘要和未触发的诊断。它不是完整生产指标监控通过。

仍缺：`ZEABUR_AGGREGATES_URL`（真实脱敏数值指标接口）、`ZEABUR_TOKEN`（只读）、`SDLC_BOT_TOKEN`（诊断队列与后续自动化）。小时/日级计划仍会因缺指标配置失败；未关闭工作流、未用空指标伪造成功、未创建或发送诊断消息。已向用户询问现有接口和凭据位置，禁止在聊天中提供密钥值。

## 用户验证与发布边界

### 重置接口 500 跟进

- 用户反馈本地 `POST /api/users/goals/reset-task` 500。user-service 日志明确报 `column "scoring_generation" does not exist`；本地数据库还缺配套 `workflow_scoring_evaluations` 表。
- 根因是已有迁移未执行，不是重置 SQL 的逻辑错误。已在本地 PostgreSQL 的同一个事务中（lock_timeout=5s）依次应用：`services/user-service/migrations/20260830_task_scoring_generation.sql`、`services/workflow-service/migrations/20260830_scoring_evaluation_idempotency.sql`。两文件本身使用 IF NOT EXISTS，不修改原业务逻辑。
- 迁移前后对已有任务 id/score/status/interaction_count/feedback/completed_at 的汇总校验一致，没有清空用户已有进度。
- 真实本地 HTTP smoke 使用临时账号和两条测试任务：cookie 单任务重置 200，Bearer 场景重置 200；分数和计数为 0、状态 pending、反馈/完成时间为空；两条任务的 generation 分别为 2、1；匿名请求 401。测试数据已删除。首次 smoke 的测试 token 缺 issuer/audience，被正常拒绝 401；补齐测试 token 的合法声明后完成上述验证。
- `npm test -- --runInBand src/__tests__/userEndpoints.test.js`（user-service）：13 项通过。
- `.venv/bin/python -m pytest services/workflow-service/tests/test_batch_evaluation.py -q`：24 项通过，包含重置前旧 generation 和旧缓存结果不再写入评分。
- 此次只补齐本地 schema；无需前端构建或服务重启，未执行用户实际任务的重置。生产尚未检查/变更。正式发布前必须确认生产存在 generation 列和去重表，如缺失则按上述顺序以事务应用这两个已有迁移，再验证重置接口；不得只更新镜像漏掉数据库迁移。

### 用户验收后的跟进（2026-09-07）

- 用户已确认 P0 验收通过，P1 部分通过；反馈普通场景 Conversation 的 `WELCOME_TIMEOUT`。
- 本地日志发现欢迎请求发出时尚未收到 `session.updated`，15 秒计时后告警，后续仍有文字/音频；另确认前端 session_start 顶层 welcomeMuted 被后端 payload-only 解析忽略。
- 修复为等待服务端配置确认及客户端握手，再通过 SDK create_response 请求欢迎语；不再注入模拟 learner 消息。兼容顶层/嵌套静音标志，重复配置/握手不会重复请求；失败不标记发送成功。保留真实无响应时的超时检测。
- 新增欢迎就绪测试 4 项通过；完整 `npm run verify` 再次 pass / 100，AI 服务 217 项通过。34 项 SDLC 治理测试、artifact validate、diff check 通过。
- 使用实际 DashScope 的独立普通场景 callback 实测三次首次音频，分别 2222、3884、2776 ms；已确认配置 ACK 和 welcome_requested。使用合成上下文，并屏蔽该测试的历史/COS 写入，不读取或保存真实用户对话。
- ai-omni 本地镜像已重建并启动，P1 欢迎语修复等待用户再次验收。P0 验收保持有效。
- 用户明确要求聚合接口延后；已创建排队任务 https://github.com/happepls/oral_app/issues/52 。修复分支将计划改为 `*/15 * * * *`，所有定时事件只运行健康检查；hourly/daily 仅保留显式手动入口，缺凭据仍报错。该规则尚未推送，GitHub 当前默认分支的旧定时行为要等本次提交发布后才改变。
- 参考 https://zeabur.com/docs/zh-CN/operations/monitoring/health-checks ：Zeabur 默认 TCP 就绪探测，可在服务 Settings 配置返回 2xx 的 HTTP 路径。user-service 内部用 `/api/health`，GitHub 外部用 `/api/users/health`。未声称已更改 Zeabur 面板配置。

1. 本地 http://localhost:5001/#pricing 与 /subscription 检查实时价格和降级；浏览器阻止 products-with-prices 请求可复现失败态，解除后点重新加载。
2. 本地邮箱/手机注册完成后检查快速体验入口；亦可登录后访问 /quick-experience，听题目启用语音，完成三回答查看反馈，再进入资料设置。
3. 两项均由用户确认后才提交、推送、准备 PR 与发布；遵守人工合并要求，不直推 master。

### 提交授权与上线条件

用户最新确认“重置对话恢复正常，继续”，据此推进修复分支提交、推送和 PR；不将这句话记作单独的欢迎语人工复测证据。完整自动化验证和真实服务欢迎语验证结果如上。

- 合并前核查生产 `user_tasks.scoring_generation` 列和 `workflow_scoring_evaluations` 表；缺失时在备份可用的前提下，以事务依次应用上述两个已有 SQL 迁移。当前仅本地已执行，生产状态未知。
- 人工合并后通过 Zeabur Git 关联部署更新四个受影响服务；仓库 self-hosted Compose deploy 工作流不是 Zeabur 发布入口。
- 上线后核验部署 SHA、价格目录、注册快速体验、普通场景欢迎音频、重置接口以及基础健康检查。所有结果必须由实际部署证据补充。
- 回滚整体前后端修复；两项新增兼容 schema 保留，不删除 generation 列或评分去重表，以免破坏已有评分链路。
- 本次主线程按 REVIEW.md 检查鉴权/额度隔离、Stripe 目录降级、评分隔离、音频资源释放和迁移发布边界；未执行独立 Agent 审查。生产 schema 和 Zeabur 发布验证仍是上线条件，不能用本地测试代替。

### PR 检查跟进

- 业务提交 `8781040` 已推送，PR https://github.com/happepls/oral_app/pull/53 。GitHub Clean Runner 34091588866 的完整 verify 通过；CI 34091588900 普通 test job 通过。
- 首轮全量 UI：232 项通过、9 项跳过、20 项失败。失败全部为 landing/subscription 在十组视口/主题配置的旧截图基线不匹配，发生在后续无障碍断言前，不能据此宣称该轮所有无障碍断言已执行。新增价格和快速体验行为用例通过。
- 检查移动/桌面、中文浅色与英文深色实际价格页面，确认价格说明及 61% 比例变化符合本次设计；更新本机平台基线时 20 项完整页面检查通过。正常比较模式复验 chromium-375 与 chromium-desktop-dark-en 的四项页面检查通过。保留原 3% 差异预算、布局及无障碍断言。
- SDLC artifact 校验通过；review 校验因根 release.md 仍为旧任务而报告 base/head 和风险覆盖不匹配。job 仅因 shadow 模式为绿色，本次不计作审查证据通过。保持已授权的独立文档方案，不覆盖旧根发布记录或修改门禁；该限制已在 PR 发布条件披露。
- Linux 对应 20 张基线来自 CI 34091588900 的 ui-audit-evidence（artifact 10007250765），按远端 ZIP 范围读取并核验 CRC 后提取原图；查看 CI 移动/桌面价格页面后采用，未用 macOS 图片替代 Linux 基线。更新后提交并重新运行 CI，以新运行结果为准。

生产部署需要更新 user-service、comms-service、ai-omni-service 和 client。按当前挂载/平台模式构建，验证实际 SHA、价格返回、注册入口与前后端协议一起生效。回滚按该修复 PR 整体回退前后端，避免留下不存在的体验模式。
