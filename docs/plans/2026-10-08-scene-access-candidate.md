# 后端会员与场景授权候选

状态：隔离工作树实现与本地验证；未发布生产。与 Atlas 迁移独立验收，不替换根目录活跃 SDLC 工件。

## 权限契约

user-service 在同一 PostgreSQL 快照读取账号、当前归属目标及全部持久化任务，沿用现有 Stripe active/trialing 与支付宝 prepaid 到期判定。免费初始开放 3 个场景，已开放前缀的全部数据库任务完成后逐个开放；有效会员全部开放。JSON 场景中的客户端分数/完成字段、重复 task ID、JWT/localStorage 会员声明不能解锁。

- 完整目标接口附加 `data.access` 与 `data.goal.access`，包括 `membership`、`unlocked_count`、逐场景 `allowed/reason`；回复 `Cache-Control: no-store`。
- 公共检查：POST `/api/users/access/check`，Cookie/Bearer 认证后固定使用当前用户。
- 内部检查：POST `/api/users/internal/users/:id/access/check`；内部快照 GET `/api/users/internal/users/:id/access`。两者要求内部服务秘密，网络位置本身不能授权。
- 请求字段：`scenario`、`goal_id`、`mode`、`operation`；身份不从 body 读取。服务按操作自行指定 `practice`、`generate` 或 `pro`。
- 未认证 401、无权限 403、限额耗尽 429、授权/限额依赖故障 503。WS 发出对应状态与原因后拒绝执行；连接中会员到期也重新检查。

## 真实入口

comms 建立上游连接前检查权限；AI `/stream` 在上下文和付费连接前检查，以及每次受保护消息前读取当前权限，并固定原始目标 ID，防止连接期间目标替换。文本/音频、场景切换和场景相关 AI 请求执行同一规则。AI REST 的图像、生成、TTS、翻译、复习与问答入口均经过身份及权限中间件；开发者 API 仅转发委托认证所得用户 ID 和内部服务秘密，保留 403/503。

`recall` 必须访问本人已解锁场景且保持魔法复习阶段；`daily_qa` 不接受任意场景，使用固定问答；`quick_experience` 仅固定 English interview。tour/其他伪造模式不能直接调用实时 AI。原有每日问答免费规则及 Pro 功能门控保留。

真实场景文本与音频提交通过 Redis Lua 原子预留限额，完成时幂等结算；多连接不能同时占用最后一个名额。已提交付费输入在打断时结算，尚未提交音频可取消。音频提交后拒绝第二次提交，晚到 ASR 不会提前释放名额。预留租约为 300 秒，生产还需观察断连/超长上游响应的恢复与真实音频性能。

原有评分 score>=9、非零 scoring_generation、提示词隔离、完整快照恢复与任务完成写入校验保留；公开完成请求仍需要服务端 readiness 能力及持久化分数，不允许直接伪造 completed 解锁。该变更不降低评分门槛。

Discovery 使用 `goal.access` 显示场景锁定和会员状态；权限快照缺失时关闭场景入口。后端须先于此页面版本发布。

## 验证与发布顺序

1. 真 PostgreSQL/HTTP：免费第 4 场景拒绝、渐进解锁、跨用户/跨目标、伪造 JSON 与重复 ID、超过 100 任务、generation=3、会员到期/付款/退款和数据库故障。
2. 直接 AI HTTP/WS：未登录、锁定与授权故障发生在付费调用之前；连接中会员到期阻断下一次音频；音频重叠、提交后取消、打断后限额保留。
3. 真 Redis：10 个并发请求竞争最后一个名额，只允许 1 个；结算重复调用不重复计数；Redis 故障拒绝。
4. comms 真实 WS：锁定/非法模式/授权故障不创建 AI 上游；开发者 API 403/503 与可信身份转发。
5. 浏览器：移动、桌面、WebKit 的权威锁定展示；既有 PCM 完整性、Blob 顺序、短音频手势解锁、单业务 WS 与预付会员回归。
6. 部署 user-service 权限接口，再部署 AI/comms/developer API。检查所有服务 `INTERNAL_AUTH_SECRET` 一致及实际 user-service 地址/网络；最后发布 client 并构建 bundle。已有连接建议在维护窗口重连，以使新入口规则全部生效。

完整验证由 `npm run verify` 执行，实际日志位于本地 `quality/artifacts/latest/`。真实数据库/Redis集成需要隔离测试环境变量 `SCENE_ACCESS_TEST_DATABASE_URL`、`GOAL_SCENARIOS_TEST_DATABASE_URL`、`PREPAID_TEST_DATABASE_URL` 和 `SCENE_ACCESS_TEST_REDIS_URL`。迁移 CLI 单独执行 `node --test scripts/mongo-atlas-rehearsal.test.mjs`；浏览器单独执行 `scene-access.spec.js` 与 `audio-prepaid.spec.js`。

2026-10-08 最终本地结果：统一验证 pass、评分 100；user-service 250 通过/3 个未启用监控集成测试跳过，AI 388 通过，workflow 211 通过，client 634 通过，developer API 23 通过，comms 7 通过，history 15 通过，备份/监控 16 通过；迁移 CLI 11 通过。Chromium 移动/桌面、WebKit 移动各 8 个权限/音频/预付会员用例通过。多项目浏览器运行曾停滞，停止该验证进程后按项目逐一执行通过；没有以停滞运行作为完整通过证据。AI Docker 镜像构建、前端 build、候选暂存变更 gitleaks 及 diff check 通过。

未完成的生产验收：真实设备连续录音与上游调用延迟、生产真实账号付款/退款后权限、部署版本/HTTP bundle 对照。每个音频 chunk 的授权调用不缓存；本地测试证明规则与拒绝时机，不能证明 Zeabur 实际网络下的音频性能。正常前端构建通过；`CI=true` 构建仍受基线既有 ESLint warning 阻断，应在发布检查中区分。

发布必须经过现有人工审核；不能以本地统一验证评分代替生产权限、音频或 Atlas 验收。

## 提交前复验与独立审查（2026-10-08）

对齐最新 `master`（`9591268`，#79），保留已合并的 #78 迁移文档版本；最终差异为 20 个授权相关文件及 1 个既有 UI 审计 fixture，后者补齐权威权限快照与非零评分代次。原始候选提交 `f38bea9`、`b3f1030` 保留在分支历史，迁移代码不重复发布。根 SDLC 工件保持原样，需求继续关联 Issue #77。

独立审查在真实 TestClient 中发现并重现两项 P1：空正文的每日问答重新回答／换题 POST 在授权前误报 400；已提交输入断连后没有结算额度。已修复：空正文按空对象进入权限检查，非空非法 JSON 仍返回 400；连接退出统一幂等结算已提交输入，只释放未提交音频，Redis 故障时保留预留，不清空未结算状态。

新增 Cookie/Bearer 空正文成功、401/403/503 拒绝、非法 JSON，以及真实 WS + 隔离 Redis 下文本／已提交音频／未提交音频的断连、授权拒绝和异常退出回归。权限专项 36 项通过，独立审查复跑通过，两项 P1 已关闭，无剩余高危阻断发现。

本轮最终 `npm run verify` 返回 pass/100；真实隔离 PostgreSQL 下 user-service 250 项通过、3 项未启用监控测试跳过；AI 409 项、workflow 211 项、client 634 项通过。测试 PostgreSQL 与 Redis 为单独创建的本地容器，未访问生产数据。AI Docker 镜像重新构建成功，前端 build 由统一验证完成。仍需等待 PR 的 GitHub 检查及人工审核，不将本地通过等同于生产上线或真机验收。

本轮 Chromium 390 的场景权限、音频与预付会员浏览器回归共 8 项通过（进程 exit 0）；单独权限复跑 3 项、既有 Discovery 可用性／锁定／键盘操作审计 6 项也通过。生产发布前仍需实际版本与内部地址检查：Zeabur 的固定 Dockerfile 镜像覆盖必须指向新版本，Git 标签或 RUNNING 状态不足以证明执行了新接口。先确认 user-service 公共/内部接口可用，再发布 AI、comms、developer API，最后发布 client；仅合并此 PR 不表示该顺序已执行。
