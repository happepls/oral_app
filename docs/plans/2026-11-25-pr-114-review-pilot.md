# PR #114 回溯审查 · 主干

## Findings

- **[P2] 鉴权拒绝误报为场景无效**。[`sessionCredential.js:33`](https://github.com/happepls/oral_app/blob/2983d28f665ba7a59de58dcc24c5912a57ee45be/services/comms-service/src/sessionCredential.js#L33)。另一标签页在签发票据后、WS 握手前切换登录，新增绑定拒绝返回 `authentication_required` 和 `retryable: false`。Conversation 把该拒绝显示为“场景无效”，用户按提示换场景仍无法解决登录状态变化。保持身份一致性检查，分别处理鉴权失败与场景错误，提示重新登录或刷新身份，并补同浏览器重认证回归。[comms 响应](https://github.com/happepls/oral_app/blob/2983d28f665ba7a59de58dcc24c5912a57ee45be/services/comms-service/src/index.js#L472-L475) · [Conversation 错误处理](https://github.com/happepls/oral_app/blob/2983d28f665ba7a59de58dcc24c5912a57ee45be/client/src/pages/Conversation.js#L2144-L2169)

## 风险卡

- Base `f08d283efe43b66568e12426a83f17d6b59877d6`，Head `2983d28f665ba7a59de58dcc24c5912a57ee45be`。[PR 与实际差异](https://github.com/happepls/oral_app/pull/114/files)
- 用户目标是让有效的第一方浏览器会话跨短票据到期继续对话，并在底层设备会话撤销后停止。
- 沿浏览器 Cookie 和 realtime ticket → gateway → comms → user-service 会话权威检查及 ai-omni bridge → 下游评分、历史与音频回传追踪。
- 优先验证有效会话被提前截断、旧会话仍能转发、重连产生重复业务连接、滚动发布时新旧凭证协议不兼容。
- 核对精确 Head 的 CI，并在隔离目录运行 comms 与会话契约验证。上线观察连接成功率、误踢、评分、音频延迟、5xx 和 AI 成本。回滚时恢复上一已验证 comms 镜像并重测撤销与长会话，记录旧镜像的短票据断线风险。

## 证据

实际合并提交 `ee8e78c1168f40f7a63b28c839c9ff54c1a3ee20` 的文件树与 Head 一致。上列 finding 来自源码路径核对。以下命令在该 Head 的隔离源码上运行，Node 为 `25.1.0`。历史 CI 使用 Node 20。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm --prefix services/comms-service test` | 0 | 17 项通过。真实本地 WS 跨 3 秒票据到期和 10 秒巡检仍只有一个上游。下次入场拒绝过期票据，撤销后拒绝转发。AI 和会话权威为替身。 |
| `npm --prefix services/user-service test -- --runInBand sessionAuthority.contract.test.js` | 0 | 14 项通过。覆盖 JSON 入口与业务转发、撤销及权威服务不可用。合成数据的目标快照保留 generation 3。 |
| `python test_scenario_batch_and_daily_qa.py --scenario all --mock` | 0 | 27 项 PASS。含无效评分窗口增量 0 和 Daily QA 路径。 |

历史 CI 的 `test` 和 `ui-audit` 已在 PR Head 上成功。[test](https://github.com/happepls/oral_app/actions/runs/42787447260/job/129732182212) · [ui-audit](https://github.com/happepls/oral_app/actions/runs/42787447260/job/129732182974)

`sdlc-review` 仅标记 `websocket_audio`，调用链还包含 `auth`。日志记录历史 `release.md` 的 Base/Head 与该 PR 不匹配，内层失败在 shadow 下仍返回绿色。GitHub 的 PR reviews 列表为空。[治理日志](https://github.com/happepls/oral_app/actions/runs/42787447306/job/129732133953)

## 结论与剩余覆盖

本次独立回溯发现 1 项 P2。真实浏览器多标签复现、额外人工或跨模型对抗复核、新旧版本混跑、生产部署版本与语音、与 PostgreSQL 共同运行的重置/迟到旧 generation、音频取消与观察窗口均为 `unknown`。Stripe 和迁移未出现在该 diff 中，本次证据无支付或迁移验收结论。
