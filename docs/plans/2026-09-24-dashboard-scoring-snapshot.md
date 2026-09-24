# Discovery 加载与工作面试进度

## 已核实的生产证据

- 实测 URL 为 `/conversation?scenario=工作面试`，目标 18，任务 371–373。
- 2026-09-24 北京时间 15:09:44，workflow 对任务 371 返回 completed，
  requested_generation=3、current_generation=3、delta=1、task_completed=false。
  只读数据库查询确认 score=1、interaction_count=3、scoring_generation=3；应显示 11%。
- 当前生产版本为合并 PR #65 的 `10620b6`。之前的 AI prompt 代际丢失已修复；
  本轮有效评分没有被 workflow 拒绝。
- 第一方浏览器使用 `/v1/tasks` 恢复任务，该 SQL 未选择 `scoring_generation`。
  浏览器默认代际 0，然后 `isCurrentScoringMessage` 拒绝真实代际 3 的实时事件。
- Discovery 先读 goals/tasks、再读 goals 列表，最后等待包括每日 AI 问答在内的
  `Promise.allSettled`，整个页面才取消 loading。慢辅助请求拖住了场景入口。
- 新快照 SQL 在生产数据库只读执行一次：7.1ms，目标 18、任务总数 30，
  工作面试的三个任务及代际完整返回。这是数据库单次耗时，不能代表整页加载速度。

未存储会话内容、原始日志、账号标识或凭据；未修改生产任务、评分或模型配置。
生产保留 `qwen3.5-omni-flash-realtime`，不处理用户明确排除的企业网络 525。

## 实施范围

延续用户已批准的修复，并响应本轮明确的重新梳理、实施要求。
根目录六个 SDLC 工件仍属于旧 bootstrap 循环，不将其改写成本轮审批或验证证据。

1. `/v1/goals/active` 一次 PostgreSQL 语句返回当前目标、全部任务状态和暂停目标标记。
   使用现有 cookie/delegated 鉴权和 goals:read scope，身份只取认证上下文，禁止缓存。
2. 第一方 API 直接使用此快照，消除客户端拼接两份分页列表和代际字段丢失。
   兼容场景 JSON 字符串任务、当前任务 ID，以及复制目标后遗留的旧任务 ID。
   `/v1/tasks` 也添加代际，兼容仍打开旧 bundle 的客户端。
3. Discovery 的主要内容只等待目标快照；问答、历史、统计、每日进度各自发布结果。
   取消/换页后忽略旧结果；辅助请求完成前不重置自动重试预算。
4. 保持原有服务端评分、代际拒绝、33% 增长上限与完成规则。

## 验证记录

- Developer API：18/18，通过，包括代际 3、超过 100 条任务、旧 ID 回退、权限及 cookie。
- 前端完整单测：50 suites / 572 tests，通过；其中 API 快照契约不再构造默认代际。
- 前端生产构建：通过。
- `npm run verify`：最终通过，score 100；OpenAPI 契约测试 6/6，SDLC schema 校验 clean。
- 新快照 SQL 的生产只读验证：通过，数字见上文。
- Developer API 镜像：兼容性修复后的 `docker compose build developer-api-service` 通过，
  本机 arm64 镜像 `d080c121a0be`；未重启生产服务。
- 浏览器：手机 390px 与桌面相关测试共 29 passed、1 原有条件 skip，
  覆盖工作面试代际 3 恢复/实时更新/旧消息拒绝、断线恢复、重试预算、reset、Discovery
  慢辅助请求、失败恢复、键盘操作、视觉和可访问性。
  命令为 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run verify:ui -- --
  --config=/tmp/oral-scene-playwright.config.cjs scene-recovery.spec.js ui-audit.spec.js
  --grep '工作面试|discovery|recovers|reset|retry'`，使用生产 bundle。
  首轮 4 个失败来自测试只匹配英文场景名和临时配置错误的基线目录；改为双语选择器、
  临时配置使用仓库绝对基线路径后，4 个重跑全部通过。未更新视觉基线或放宽断言。
  更早一次 npm 参数转发错误启动了多余矩阵，手动中断，不计完整通过。

## 独立复审

- Scope: 当前目标快照、评分代际恢复、Discovery 独立加载与重试、API 契约和回归。
- Diff: `10620b6` 到本轮代码、测试及文档，排除用户原有两个文档改动。
- Commands: diff 和调用链检查；developer-api 18/18；客户端 API 26/26。
- Risk areas: scoring, websocket, data, auth, ui。
- Findings: 初审发现复制目标后的旧任务 ID 无法匹配；已增加同场景文本回退和回归，复审无遗留。
- Unresolved high/critical: 0。
- Recommendation: ready；不将 PR 就绪等同于生产验收。

## 发布与回滚

只推进 PR，人工审阅合并后发布。先确认 developer-api-service 新版本 RUNNING、
`/api/v1/goals/active` 返回完整代际，再发布 client；旧 client 可继续使用列表接口。
新 client 遇到旧 backend 的 404 会显示错误并有界重试，不能把这段部署窗口算验收成功。
无需数据库迁移；回滚时先回滚 client，再回滚 developer API。

上线验收使用用户指定的工作面试 URL：从数据库恢复当前分数，完成合法评分窗口后
实时进度与数据库一致；每日问答慢/失败时 Discovery 场景入口仍可用。
评分为零或 pending 的合法窗口不得伪装成正向进度。
