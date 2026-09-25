# 本地历史保存 400 与练习进度修复

## 调用链与原因

`Conversation.js` 在消息变化后自动保存，经过 `prepareHistorySnapshot`、
`conversationAPI.saveHistory`、`POST /api/conversation/history/:sessionId`，
最终由 history 服务按消息 ID 更新 MongoDB。

旧序列化逻辑包含尚无正文和音频的 AI 加载气泡。conversation 服务要求每条
消息有 role，且至少具有 content/audioUrl，因而拒绝整个快照并返回 400。
历史保存与评分是独立链路，修复历史请求不能单独证明评分恢复。

本次另查到本地 workflow 仍运行旧镜像；同一会话评分日志存在模型 401，
并进入旧的规则加分 fallback。Compose 的 workflow 从两个 env_file 合并配置，
服务目录内的旧公共端点密钥覆盖根目录值，与 ai-omni 的配置来源不同。

## 修复

- 序列化过滤空白、AI 加载气泡和录音省略号占位；音频独立存在时保留消息。
- 先确定消息 ID，再过滤空消息，避免后续历史条目的备用 ID 移位。
- 保留服务端校验；不改评分阈值、窗口、代次、数据库分数。
- workflow 显式绑定根 `.env` 的 `QWEN3_OMNI_API_KEY`，与 ai-omni 一致。
  专用端点 `DASHSCOPE_API_KEY` 和 URL 白名单保持原样。
- 本地重新构建并启动 workflow/ai-omni，重启挂载源码的 user-service；
  构建 client，使 nginx 挂载目录包含最新 bundle。没有修改生产环境。

## 验证（2026-09-25 北京时间）

- 历史回归：9 项通过，含加载气泡、空白、音频消息、后续补全文字、ID 稳定性。
- client 全量：580 项通过；手机/桌面浏览器自动保存回归：2 项通过。
- ai-omni：287 项通过；workflow：138 项通过，全部离线 stub。
- user-service：178 项通过、3 项既有跳过；conversation-service：3 项通过。
- client 构建通过；lint 0 errors，168 项既有 warnings。
- 独立只读代码复核通过。
- 本地实际历史接口：原消息按原 ID 重放返回 201，消息记录保持不变。
- 同一用户权威目标接口返回 200；受影响任务的 score=1、
  interaction_count=1、scoring_generation=1，返回 progress=11。
- 运行容器的公共端点密钥来源已一致；重启后用户正常练习产生的 workflow
  文本模型调用日志返回 HTTP 200。没有为测试主动调用真实 DashScope。
- 随后观察到同一任务的真实 3 轮窗口完成：delta=2，score 从 1 增至 3，
  interaction_count 从 1 增至 4，scoring_generation 仍为 1。数据库确认已落库。
  此处窗口 `status=completed` 不代表任务完成；任务仍为 pending。
- 浏览器读取该用户实际目标 API 和历史，页面进度与 API 均为 33%。
  本次恢复验证仅 stub WebSocket 握手和自动保存，阻断模型流量；
  分数来自实际数据库，没有人工构造评分事件或修改分数。
- host、nginx 容器与 HTTP 返回的 `main.8087bae4.js` 内容 hash 一致。

测试日志位于忽略提交的 `quality/artifacts/scene-expression-feedback/local-*.log`。
已有分数不回填、不归零。进度仍按 3–4 个完整对话轮次评估；
单次历史保存成功或表达建议到达不会直接增加进度。
