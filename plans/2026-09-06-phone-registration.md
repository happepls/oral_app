# 手机号验证码注册：已批准实施方案

日期：2026-09-06。状态：代码与专项测试完成，UI 回归进行中；未发布。

批准证据：用户于本会话明确回复“批准方案，允许独立分支实施”。在 `feat/phone-registration` 分支执行本方案，保留旧 SDLC 根工件与用户的 TODO 改动；本次证据记录在该独立方案及同目录验收文档中。该批准不代表生产发布批准。

## 用户目标

为 `https://guajiguaji.top/register` 增加手机号接收短信验证码的注册方式，保留邮箱注册。完成标准是用户可以真实收到短信、通过验证码创建账户并进入新用户引导；已有手机号验证后进入原账户。

## 已核对的依据（Ran）

- 当前工作分支 `master`，HEAD `68927d8`；已有未提交的 `docs/TODO.md` 改动属于用户。
- `python3 scripts/sdlc.py validate`：exit 0，`SDLC gate: clean`。
- `gh pr list --state open --json number,title,headRefName,url` 与 `gh issue list --state open --limit 50 --json number,title,labels`：均返回空数组。
- 根目录六工件仍属于 `ai-native-sdlc-bootstrap`；`release.md`、`maintenance.md` 是 pending。本方案不替换它们，不宣称旧循环完成。
- `curl -I --max-time 20 https://guajiguaji.top/register`：HTTP 200，只证明页面可访问，未验证页面渲染或短信发送。
- `client/src/pages/Register.js` 仅有邮箱表单；`Login.js` 已有国家区号、手机号、验证码、60 秒倒计时。
- 已有调用链：`authAPI.sendPhoneCode` → `/api/users/phone/send-code`；`AuthContext.loginWithPhone` → `/api/users/phone/login` → `User.findOrCreateByPhone` → `accessToken` httpOnly cookie。
- `_smsProvider` 将 +86 路由到阿里云短信，其余号码到 Twilio Verify；不需要引入新供应商。
- `users.phone` 已有唯一约束，邮箱允许为空；已有 `add_phone_column.sql`。生产数据库是否应用该迁移仍需只读确认。
- `Discovery.js` 对缺少 `native_language` 的新用户跳转 `/onboarding`，可复用现有引导。
- 短信工具未配置时接受固定测试验证码；阿里云验证码采用非原子的 GET/DEL，删除失败仍可能返回成功。开放注册入口前需修复这两项认证风险。
- `figma_app_template/src/` 不存在；实际设计参考位于 `figma_app_template/Guaji AI_Design_System/`，应用 token 位于 `client/src/imports/design-tokens.json`。

## 拟实施行为

1. 注册页增加“邮箱注册 / 手机号注册”切换，使用现有页面视觉、国家区号组件和多语言机制。手机号表单包含国家区号、本国号码、获取验证码、6 位验证码和“注册并登录”；不要求邮箱或密码。明确提示已注册手机号将直接登录。
2. 复用现有短信验证与建号接口。新用户进入现有引导，已有用户保留原账户。规范化手机号，在前后端校验输入；更改号码后清除对应验证码状态，防止迟到请求把旧号码标为发送成功。发送中禁止重复点击，60 秒后重发；组件卸载清理计时器。
3. 加固复用的认证链路：缺配置时拒绝发送与验证，不返回虚假“已发送”，不接受固定测试码；短信请求有超时；服务端按手机号限发、限制错误验证次数；Redis 不可用时拒绝依赖它的验证。阿里云验证码原子消费，发送失败不留下可用验证码；并发同手机号建号只产生一个账户。日志不记录验证码和完整手机号。
4. 补齐前端交互、后端认证和并发测试，构建前端并验证移动端及桌面端。提交到功能分支、准备 PR；人工合并和部署后，验证真实短信注册及再次登录。

## 文件范围与验证（Planned）

- UI：`client/src/pages/Register.js`，必要的共享手机号表单/校验工具，`client/src/i18n/locales/*.json`，注册交互测试与 Playwright 用例。只有共享行为需要对齐时才改 `Login.js`。
- 后端：`services/user-service/src/controllers/userController.js`、`src/utils/aliyunSms.js`、`src/utils/twilioVerify.js`、必要的短信限流工具、`src/models/user.js` 及专项测试。优先保留已有接口与数据库结构。
- 测试覆盖：邮箱注册回归；国家区号/号码/验证码校验；发送失败和超时；倒计时与改号竞态；错误/过期/重放验证码；未配置供应商；Redis 故障；并发建号；cookie 建立、缺失/过期 cookie、Bearer 兼容以及跨服务 JWT 契约。
- 计划命令：`npm --prefix services/user-service test -- --runInBand`；`CI=true npm --prefix client test -- --watchAll=false --runInBand`；`npm --prefix client run build`；`npm run verify`；`npm run verify:ui`。命令是否成功以实际执行结果为准。
- 浏览器验证：至少 390×844 和桌面视口，核对页面布局、键盘操作、状态提示、注册成功引导。真实收码不能由 mock 或截图替代。

## 发布条件与回退

- 核实生产短信变量存在且供应商签名/模板可用，只记录配置存在性，不读取或写入文档中的密钥值。现有部署清单记录国内/海外通道曾接通，但这不是本次实时验证。
- 真实短信验收使用用户指定并授权的测试号码，验证码只在验收时使用，不进入日志或提交。
- 前端必须重建 `client/build`；后端发布按现有 Docker/Zeabur 工作流执行。Agent 不合并、不直推 master。
- 回退注册页入口可以回退相应提交；不删除已创建用户，不恢复固定测试码漏洞。

## 当前流程门槛

`AGENTS.md` 要求计划执行人工批准；`.agents/skills/oral-app-sdlc/SKILL.md` 明确要求 “Build needs explicit plan approval and evidence”。该门槛现已由上方用户明确批准满足。

旧 SDLC 根工件尚未闭环；用户已同意独立分支实施的流程例外。本文件是本次分支的实施记录，不替换旧根工件。发布仍须人工批准。

已使用 `oral-app-sdlc` 确认审批与证据边界，使用 `senior-ui-ux-orchestrator` / `webapp-ui-skill` 确定交互状态及视觉验证范围。业务代码及专项测试已实施，未发送真实短信或发布生产。

实施交接与验收证据见 [2026-09-06-phone-registration-verification.md](2026-09-06-phone-registration-verification.md)。

## 实施前基线复核（2026-09-06，Ran）

- 再次核对工作区、HEAD、GitHub PR 和 Issue：状态未变，未发现本方案的明确批准记录。自动目标续跑消息未作为人工批准。
- `python3 scripts/sdlc.py validate --history`：exit 0，`SDLC gate: clean`。
- `CI=true npm --prefix client test -- --watchAll=false --runInBand --runTestsByPath src/__tests__/login-accessibility.test.js src/__tests__/auth-context.test.js src/__tests__/handleAuthResponse.test.js`：exit 0，3 suites / 32 tests passed。
- `npm --prefix services/user-service test -- --runInBand --runTestsByPath src/__tests__/userModelTx.test.js src/__tests__/migrationSafety.test.js`：exit 0，2 suites / 9 tests passed。Node 输出了 `--localstorage-file` 未提供有效路径的警告，未导致测试失败。
- `git diff --check`：exit 0。
- 上述结果仅是现有登录、认证状态、用户事务及迁移检查的基线，不证明新增注册入口、验证码安全性、真实短信收取或生产部署完成。
