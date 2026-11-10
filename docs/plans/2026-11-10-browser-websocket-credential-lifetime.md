# 浏览器对话持续鉴权修复

## 已复现

设备会话限制开启后，comms 对每条业务消息及每 10 秒巡检重新调用会话权威服务。
第一方网页通过 60 秒 realtime ticket 入场，旧代码在后续校验中继续使用该 ticket，
因此票据过期即返回 `authorization_unavailable` 并以 4003 关闭连接，即使浏览器
httpOnly accessToken 和数据库设备会话仍有效。生产日志出现约 60.4 秒的建连/断线
间隔；本地真实 WebSocket、有效 Cookie 和缩短到 2 秒的票据复现同一错误。

票据桥接到 AI 时还被替换为 2 分钟 access token；长期回调不应被这份更短的临时
凭证截断。历史库只读元数据仍可查询到最近会话的消息；这不证明所有未发送内容
均已落库，不能将恢复期间的显示异常直接认定为数据库删除。

## 实施范围

1. 入场继续严格验证 realtime ticket 的签名、用途和到期时间。
2. 对带 SID 的第一方浏览器连接，选择现有 httpOnly accessToken；验证其签名、
   issuer、audience、用途、有效期，账号和 SID 必须与入场票据一致。
3. 持续权威校验和 AI bridge 使用这份原始浏览器凭证。保留原 iat、exp 和所有
   PostgreSQL 会话撤销/到期检查，不签发更长的凭证，不接受过期 ticket 重新建连。
4. 兼容现有无 Cookie 的 ticket-only 调用、legacy access 调用及无 SID 的合作方
   delegated 路径；这些路径保持原凭证策略，不继承其他浏览器 Cookie 身份。
5. 加入不含 token、Cookie 值或聊天内容的凭证来源/失败阶段日志，供生产验收。

不更改会员、评分、任务、历史数据或设备上限，不执行迁移或开关操作。

## 回归与发布

- 真实 WebSocket 跨 ticket 到期与 10 秒巡检后保持单连接、继续转发消息；
  撤销后下一条消息拒绝且不能转发，过期 ticket 搭配有效 Cookie 也不能重新入场。
- Cookie 账号、SID、用途、issuer/audience 不匹配或本身过期时拒绝。
- 上游凭证在模拟三分钟后仍遵循原 Cookie 的有效期；不生成新的授权窗口。
- 验证合法 ticket-only、合作方和 legacy 路径保持现有行为。
- 运行 comms 全套、原会话 HTTP 合约、Lint、密钥扫描和统一验证；CI 通过后人工
  审核合并，并经 production 审批发布。
- 发布后核对实际镜像/源码与 `[SESSION_AUTH] bound_browser_cookie`，用该账号
  连续对话超过 3 分钟，观察消息可见、无周期性授权错误且仅一条业务 WebSocket；
  再验证第三端登录导致真实旧会话失效。正常网络断线应按原有界重试机制恢复。

以上手工验收在生产发布后完成，测试通过或 health/RUNNING 不代表生产验收完成。

## 本地验证记录

- 修复前的真实 WebSocket 测试跨短票据到期后失败：有效 Cookie 仍在，但连接关闭。
- 修复后 comms 17 项及 user-service 会话 HTTP 合约 14 项通过。
- 统一 `npm run verify` 返回 pass、100 分、0 项 findings；其中不含浏览器矩阵，
  浏览器检查以本 PR 的独立 CI ui-audit 结果为准。
- Lint 无 errors，有既有 warnings。生产源码及长会话验收仍待审核、发布和复核。
