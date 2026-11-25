# oral_app review policy

## 审查深度

按用户影响、共享状态和下游消费者分级。同一 PR 采用触及的最高级别，拆出无关重构。路径标签只提示可能的风险领域。共享 session、评分与进度快照、跨服务事件格式和数据库迁移统一按主干审查。

| 级别 | 典型边界 | 审查深度 |
| --- | --- | --- |
| 主干 | 认证与 session、实时会话、评分与任务状态、Stripe、迁移、跨服务契约 | 人工读完整调用链和失败、并发路径。独立只读评审加跨模型或人工对抗复核。提交端到端证据和适用的新旧版本互通结果。 |
| 枝干 | 历史、媒体、独立场景业务、目标管理 | 读变更和直接调用方。核对权限、数据契约、异常处理和风险匹配的回归。 |
| 叶子 | 独立展示、文案、样式、未接入主链路的功能 | 确定性检查和轻量独立评审。涉及可见页面时，提交组件或页面测试及桌面、移动端证据。 |

## 模块与调用方

从入口追到写入方及消费者。变更接口时核对旧客户端配新服务、新客户端配旧服务及数据库回滚。

| 边界 | 入口、数据与消费者 |
| --- | --- |
| 登录与设备会话 | `AuthContext.js`、`api.js` → user-service `userController.js`、`loginSessions.js` → Cookie、SID、PostgreSQL → developer-api、comms、conversation、history 的会话校验。 |
| 实时会话与音频 | `Conversation.js` 或 `QuickExperience.js` → developer-api `POST /v1/realtime/tickets` → gateway `GET /api/v1/realtime` → `comms-service/src/index.js` → ai-omni `/stream` → 客户端文本、音频与重连处理。 |
| 评分与进度 | ai-omni → workflow `/proficiency-scoring/batch-evaluate` → user-service `user_tasks` 的 `score`、`interaction_count`、`scoring_generation` → WS 进度事件及 `/api/v1/goals/active` → Conversation 和 Discovery。 |
| 支付与权益 | Stripe → user-service `/api/stripe/webhook` → `webhookHandlers.js` 验签及更新权益 → 场景访问、每日限额和订阅展示。 |
| 展示与存储 | 首页 `Landing.js` → `prerender-homepage.cjs` → nginx/边缘 → 浏览器。历史和媒体经各自 API 写入 MongoDB/COS，再由会话恢复、音频播放和历史页消费。 |

## PR 审查与合并

1. 读 diff 前填写 [PR 风险卡](.github/pull_request_template.md)。记录精确 Base、merge base 与 Head，用户目标、调用链、最危险的失败、预定验证和回滚。用 merge base 到 Head 的实际差异复查范围。
2. 围绕故障阅读对应调用链。每条 finding 写明 `file:line`、影响、触发路径和修复建议。按严重度排序，覆盖不足标为 `unknown`。高危或严重 finding 未解决时停在评审阶段。
3. 把测试命令、退出码和已脱敏的日志或 CI 工件绑定到审查版本。使用 `npm run verify`，按范围补 `QUALITY_INCLUDE_UI=1 npm run verify` 或 `python3 test_scenario_batch_and_daily_qa.py --scenario all --mock` 等专项验证。至少覆盖一个最高风险的负向场景。UI 附截图或录屏，发布变更附探针、观察窗口及回滚记录。证据省略用户语音、对话正文、Cookie、票据和密钥。
4. 复用 SDLC 现有独立只读评审。作者更新代码后核对新的 Head，重跑受影响证据并复核旧 findings。责任人确认最后版本、必要检查和评审对话，再授权合并。AI 提交 findings。
5. 合并后核对实际部署 SHA 和业务探针。有功能开关时由服务端控制并验证开关两条路径。实时灰度使用合成账号跑真实语音，记录连接成功率、错误加分、音频延迟、5xx 和 AI 成本，据预定观察窗口决定扩量或回滚。故障优先转为能在修复前失败的回归、契约校验或门禁。

## Project risk checklist

- Auth and payment. Check mismatched identities, expired tickets, Cookie/Bearer precedence, stale sessions, internal authorization, Checkout Sessions, bad signatures, raw body order, repeated and out-of-order webhooks, idempotency, live/test isolation, allowed origins, and subscription soft-failure.
- Scoring. Check reset during evaluation, old nonzero `scoring_generation`, duplicate completion, invalid answers and reconnect recovery. Confirm eligible modes, complete 3–4-round windows, server delta `0–3`, no fallback points and completion thresholds.
- WebSocket and audio. Check encoded `scenario`/`voice`/`mode`, comms forwarding, one business connection after reconnect, late frames, cancellation, queue clock reset, marker behavior, and upstream retries.
- Data and release. Check old/new compatibility, backups, rollback/compensation, image rebuild, host-copied Node dependencies with the client exception, lockfile reproducibility, and the intended release target.
- UI. Check i18n provider and locale precedence, light default, accessible states, responsive behavior, loading/error/empty and partial-stream states.

## Review evidence

The reviewer records the following machine-readable bullets under `release.md` → `Review evidence`: `Scope`, `Diff`, `Commands`, comma-separated `Risk areas`, `Findings`, numeric `Unresolved high/critical`, and `Recommendation`. A ready release requires every classified risk area, zero unresolved high/critical findings, and recommendation `ready`. “No findings” is a result only after the checklist relevant to the diff was evaluated.
