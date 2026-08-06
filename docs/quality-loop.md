# 可验证开发与评分闭环

统一入口是 `npm run verify`。产物写入 `quality/artifacts/latest/`：`findings.json`、`report.json`、`report.md`、`report.html`、命令日志和 UI 审计追踪表。退出码为 0（通过）、2（允许自动修复）、3（人工判断）、4（安全/契约/测试硬失败）。

统一入口覆盖 Node 服务、workflow/ai-omni Python 测试、场景 mock、契约、lint、前端单测和构建；优先使用仓库 `.venv/bin/python`，也可用 `QUALITY_PYTHON` 显式指定解释器。密钥门禁同时检查暂存区，并拒绝继续跟踪生成的 `.security-keys.json`。发现已提交凭据时必须先轮换，再从当前树和必要的 Git 历史中移除，不能只加 allowlist。

浏览器矩阵运行 `npm run verify:ui`，候选截图写入 `quality/artifacts/ui-candidates/`，用户批准的正式基线存放于 `quality/baselines/ui/`。Playwright 每次运行都会执行像素比较，单张截图最多允许 3% 的跨截图字体抗锯齿差异；布局溢出、控件遮挡和可访问性仍使用独立的零容忍断言。更新基线必须获得用户明确批准。测试会固定 locale、时区、动画和 API 数据，并阻断 Tawk、Stripe、DashScope、COS 与 Google 请求。

浏览器执行后运行 `npm run verify:ui:report`，会把 Playwright JSON 中的失败、截图和 trace 转为符合统一协议的 `quality/artifacts/latest/ui-findings.json`。Chromium 项目优先复用本机 Chrome；WebKit 使用与项目版本匹配的 Playwright 官方浏览器包，缺失时必须作为环境阻断报告，不能伪装成兼容性通过。

要执行并将浏览器证据纳入总分，使用 `QUALITY_INCLUDE_UI=1 npm run verify`。统一验证器会先运行浏览器矩阵、立即转换本轮结果，再计算总分；显式开关避免普通后端验证意外启动浏览器。

自动修复最多三轮。修复方只能修改 finding 的 `suggested_files`，认证、支付、数据库语义、公开契约删除/改名或权限扩大必须人工仲裁。每轮必须由全新上下文验证方重新执行受影响检查与固定 smoke suite；分数未提高 2 分、同一失败连续两轮或出现高风险改动即停止。

源审计报告的正文包含 78 个唯一规则编号；原汇总中的 59 为算术错误，现已按严重 16、重要 22、一般 40 修正为 78。

追踪表中每个 `open` 编号也会作为独立 finding 进入总分；浏览器 smoke 通过只证明当前固定状态没有确定性的溢出、严重 axe 或 Console 失败，不能替代逐项产品审计关闭。
