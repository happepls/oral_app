# 提示词刷新丢失评分代次

## 生产诊断

PR #64 已合并并部署，workflow 为 RUNNING，数据库与 Redis 健康。
但 2026-09-24 北京时间 12:55:00、12:56:25、12:58:20 的 goal 18/task 371
评分均返回 `stale_generation`：requested_generation=0、current_generation=2、delta=0。
AI 日志随后记录 discarded stale，并重新连接。这不是 workflow 未启动；
它正确拒绝了旧代次窗口。健康检查不能代替真实评分链路验收。

## 根因与修复

`get_user_context` 已保留数据库任务的 scoring_generation，但
`WebSocketCallback._update_session_prompt` 使用浅拷贝 `full_ctx`，仍共享
`self.user_context.active_goal`。它将 `current_task` 替换为只含 id、场景、描述的对象，
同时丢失 generation、score、interaction_count 等字段。后续真实入口
`_evaluate_scene_turn_progress` 再读取 current_task 时默认 generation=0。

上一轮测试在 get_user_context 后直接调用 accumulator，漏掉了真实会话的提示词刷新步骤。
本次把 active_goal 复制到仅供 prompt 使用的上下文；选择 prompt 任务时也保留完整任务字段。
权威评分任务的变更仍通过 get_user_context 或 `_apply_confirmed_task_context` 执行。
不重标记旧窗口，不补分，不降低 stale-generation 校验，不修改用户任务数据。

延续用户批准的场景修复范围；新增回归使用真实 WebSocketCallback，执行三次提示词刷新和
`_evaluate_scene_turn_progress`，最终到三轮 accumulator。修复前实测 `0 != 2`，修复后通过。
测试只模拟外部会话、Redis、模型评分 HTTP，不绕过评分上下文读取。

## 验证

- 定向 quick_profile_context + scoring_windows：26 passed。
- `npm run verify`：exit 0，score 100；AI 251、workflow 126、场景 mock 25 全部通过。
- `docker compose build --build-arg HTTP_PROXY=http://host.docker.internal:7890
  --build-arg HTTPS_PROXY=http://host.docker.internal:7890 ai-omni-service`：exit 0，
  镜像 `76caeaf5477f`。代理仅为本机构建参数，未提交配置；本机构建为 arm64。
- 新镜像的 Python 3.10 / 真实依赖 prompt smoke：exit 0，刷新后 generation=2，
  active_goal 与刷新前相同；使用合成凭据和 Mock 会话，未发起模型请求。
- 测试编写初期对 TTL 容器、枚举的 mock 方式不兼容，修正测试夹具后才得到上述 `0 != 2` 复现；
  初次镜像 smoke 因缺少必需 API key 配置未启动，不计通过。

## 独立复审

- Scope: prompt 上下文隔离、真实评分入口、magic/scene/任务确认切换。
- Diff: `25768606d15be2a4cb9f6139cfa5481806a881a3` 到本次代码与测试；不含用户原有文档。
- Commands: 六个关联 Python 测试文件 116 passed；diff check 通过；额外内存验证
  magic task_index=1 → scene、directive 刷新、已确认下一任务 id10/gen3 均保留正确评分上下文。
- Risk areas: scoring, websocket, audio, data。
- Findings: none；Unresolved high/critical: 0；Recommendation: ready。

## 发布验收

新 PR 需人工审阅合并；当前生产尚无本次修复。旧根 SDLC 工件不作为本次审批证据。
合并后检查 ai-omni 实际源码版本，用户开启新会话并完成 3–4 轮问答。
以当时数据库代次为准，要求新评分请求携带同一代次，不再因提示词刷新返回 stale_generation。
评分结果仍由模型决定，合法零分或 pending 不能冒充进度成功，也不能通过补分绕过验收。
回滚为 revert 本次提交；无数据库迁移，但回滚会重新引入代次丢失。
