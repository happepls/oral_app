# Discovery 会话校验请求修复

用户在确认生产异常原因后要求“继续，确保修复 guajiguaji.top 发现页加载异常的问题”。
本次按已说明的五处请求头修复和真实 HTTP 回归执行，保留根目录现有 SDLC 工件。

## 已确认原因

生产开启 `DEVICE_SESSION_LIMIT_ENABLED=true` 后，四个后端的 `loginSession.js`
向 `/api/users/verify` 发送 POST，但缺少 `Content-Type: application/json`。
user-service 的真实 `validateContentType` 在认证前返回 415；调用方将其转换为
`authorization_unavailable`，第一方 V1 目标快照因而不可用。AuthContext 的
Cookie 会话巡检也遗漏了相同请求头，导致撤销检查被跳过。

只读核对表明受影响账号的 Pro 权益、活动目标、场景、任务和登录会话仍然存在。
在下游容器进行相同无效测试令牌的 A/B 请求：不带 JSON 请求头为 415；带上后
为 401，说明请求抵达了认证层。401 不代表有效会话验收成功，不能替代发布后验证。

## 范围与验证

1. 为 comms、history、conversation、developer-api 四个校验调用补齐 JSON 请求头。
2. 为浏览器 Cookie 会话巡检补齐相同请求头，保留 credentials、超时和清理逻辑。
3. 用真实 HTTP 服务及生产 Content-Type 中间件覆盖 SID、旧令牌、撤销和权威服务
   故障；增加 Cookie → V1 目标快照的请求链路，确认非零评分代次完整保留。
4. 对实际挂载的 AuthProvider 验证巡检请求及卸载后的计时器清理。

不修改会员状态、目标/任务数据或数据库结构，不降低校验规则，不关闭设备限制。

## 当前回归证据

- 修复前：已有四个 mock 校验测试通过；真实 HTTP 测试 12 项失败、415 反例通过；
  浏览器巡检测试因缺少请求头失败。
- 修复后：会话 HTTP 合约 14 项通过，覆盖合法第一方 Cookie 的 V1 快照和撤销 401；
  原有四个会话测试、开发者 API 27 项、前端相关 44 项通过。
- user-service 全套测试 226 项通过，48 项数据库集成用例因未提供独立测试数据库而
  跳过；不将这些跳过用例作为本次已验证证据。client 生产构建成功。
- Lint：根目录和 client 均为 0 errors，存在原有 warnings。

## 发布与完成条件

修复通过 PR 审核和同一提交 CI/镜像构建后，由 GitHub production 人工审批发布。
Agent 不自动合并或批准生产部署。发布后必须核对五个镜像、容器源码及健康状态，
并在四个下游容器实际调用校验 helper，确认请求不再被 415 拦截；检查权威接口的
受影响账号会员和目标快照，再核对生产浏览器发现页恢复。只通过 health、RUNNING、
开关值或合并检查不等于目标完成。

回退使用本次发布报告记录的旧 digest；这会恢复存在请求契约缺陷的旧代码，不能
将“回退成功”等同于发现页恢复。任何临时开关变更须另行明确记录和验证。
