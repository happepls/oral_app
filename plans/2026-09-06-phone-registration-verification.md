# 手机号注册实施与验证

日期：2026-09-06。分支：`feat/phone-registration`。生产状态：未发布，真实收码未验证。

## 已实施

- `/register` 增加邮箱/手机号切换，手机号验证后自动注册或登录既有账户；新用户经 Discovery 进入 Onboarding。
- 注册与登录共用 `PhoneAuthForm`，支持国家区号、6 位验证码、发送倒计时、号码变更/卸载取消请求、迟到响应隔离、重复提交保护、错误反馈。新增文案覆盖现有 9 种语言。
- 现有阿里云/Twilio 接口未改变路径。移除缺配置时的固定验证码，供应商请求 10 秒超时。Redis 原子限流：同号发送至少间隔 60 秒、每小时最多 5 次、每 10 分钟最多验证 5 次；Redis 故障拒绝请求。
- 阿里云代码仅在供应商接受发送后存为 HMAC，5 分钟有效，Lua 原子比较并删除，拒绝重放；使用新的 `sms_code:v2` 空间，不接受旧版本明文或开发码。Postgres `ON CONFLICT(phone)` 保证并发建号返回同一账户。
- 保留用户 `docs/TODO.md` 改动及原有六个 SDLC 根工件。独立分支例外的用户批准记录见本次方案。

## Ran

- `npm --prefix services/user-service test -- --runInBand`：15 suites、134 tests 通过。
- `CI=true npm --prefix client test -- --watchAll=false --runInBand --runTestsByPath src/__tests__/phone-registration.test.js`：新增 17 tests 通过。
- `npm run verify`：exit 0，decision=pass、score=100。包含前端完整 46 suites / 553 tests、前端 build、lint、服务端与跨服务认证/场景契约检查。具体日志在忽略目录 `quality/artifacts/latest/`。构建有既有 hooks/unused-variable 警告；新增测试 mock 也有 lint warning，未报告为零警告。
- `node services/user-service/test/phone-registration.integration.cjs`：exit 0。使用独立临时 Redis/Postgres 容器，实际执行 Lua、SQL 及 HTTP/cookie；供应商响应被测试桩替换。证明验证码重放/过期拒绝、12 个并发请求只消费一次、并发限流、12 次并发建号只得到一个账户，以及既有手机号再次登录。**这不是实际短信送达证明。**
- `docker compose build user-service`：exit 0，镜像 `78caf9fefc0b`，依赖从宿主复制。
- 同一集成脚本在新建 user-service Docker 镜像的 Node 18 环境中再次通过：`docker run --rm --network host --mount type=bind,source=/Users/sgcc-work/IdeaProjects/oral_app/services/user-service/test/phone-registration.integration.cjs,target=/usr/src/app/test/phone-registration.integration.cjs,readonly oral_app-user-service:latest node test/phone-registration.integration.cjs`。测试使用随机 PostgreSQL schema（结束后删除）和 Redis key 前缀，保证可重复执行且不受前次限流状态影响。
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3017 npm --prefix client run test:e2e -- phone-registration.spec.js --project=chromium-320 --project=chromium-390 --project=chromium-desktop --project=webkit-mobile`：8 passed。覆盖发送/注册/引导、错误码、区号选择、横向溢出以及发送成功页严重/致命 axe 违规检查。
- 浏览器截图已人工查看：320px 手机注册成功发送状态与 390px 区号选择/错误状态。截图和测试 JSON 在 `quality/artifacts/phone-registration-browser/`、`quality/artifacts/phone-registration-browser-results.json`。
- 主脚本 `/static/js/main.0538a3af.js` 在宿主、已有 client 容器的挂载目录和独立预览 HTTP 返回的 SHA-256 一致：`c107adaa3d4e389f9291a287a8fd0d1c2353f78f392d17fe5b6f0849b13f8a8e`。
- `git diff --check` 通过；`python3 scripts/sdlc.py validate --history` 已在实施前通过。
- 注册页视觉基线更新命令：`PLAYWRIGHT_BASE_URL=http://127.0.0.1:3017 npm --prefix client run test:e2e -- ui-audit.spec.js --grep 'register has' --update-snapshots`，10 passed。覆盖 320/375/390/768/1440px，浅色中文及深色英文；实际查看了手机截图与深色英文平板截图。macOS 基线已更新，Linux 基线待 CI 产物验证。

## 已解决的测试问题

- 新增 JSX mock 少一个闭合括号导致首次前端测试解析失败，已修正后通过。
- 认证中间件导入的后台定时器导致首次新增后端测试进程不退出；测试隔离该定时器后正常退出。
- 首次浏览器运行旧本地 Nginx 5001 端口返回空响应；改为独立的 `127.0.0.1:3017` 静态构建预览后完成验证，未修改该 Nginx 配置。
- WebKit 被第三方脚本的页面 load 等待阻塞；短信注册测试禁止第三方 HTTPS 请求，等待 DOMContentLoaded 并断言实际表单/导航，最终通过。
- 注册页旧视觉测试在 Motion 入场动画尚未完成时取样，导致部分视口出现错误的低对比度结果；加入表单可见且 opacity=1 的等待后，10 组配置均通过。
- 首次 Docker 集成复跑遇到前次测试残留限流（429）；改为每次随机 schema 和 Redis key 前缀后复跑通过，未降低业务限流阈值。

## 独立审查

按 `oral-app-sdlc` 要求进行 fresh-context 只读审查（agent `phone_registration_review`），检查 REVIEW.md 对应认证、并发、隐私、UI 及 Cookie/Bearer 契约。结论：无具体可操作发现，未解决 high/critical 为 0。审查者另运行后端专项 45 tests 与前端新增 17 tests，均通过；未重跑集成脚本或浏览器。

## 尚待完成

- 草稿 PR：[happepls/oral_app#50](https://github.com/happepls/oral_app/pull/50)，功能提交 `68d0926`。已执行 staged gitleaks，扫描约 68.74 KB，无泄漏；提交 hook 同样通过。完整 239 项 UI 回归与远端 CI/Linux 视觉基线检查进行中。
- 人工审核 PR、合并并发布前端与 user-service。Agent 不自动合并或部署。
- 生产只读核实 `users.phone` 唯一约束和可空邮箱、阿里云/Twilio 配置存在性、可用的签名模板及发送权限。当前部署清单的历史“已通”不代替本次验证。
- 用户授权的真实号码收取短信 → 新账户注册 → httpOnly Cookie 登录 → Onboarding；退出后同号重新收码并登录原账户。真实号码与验证码不得存入文档或日志。

## 风险及回退

- 新版本会拒绝旧版本存于 Redis 的明文验证码，部署期间用户需要重新获取验证码。
- 固定限流也计算失败请求，供应商故障或误输过多时需等待，防止通过重发绕过限制。
- 不需要新数据库迁移，但生产必须已应用 `add_phone_column.sql`。回退前端入口不影响已注册账户；不恢复固定开发码后门，不删除账户数据。
- 通用状态覆盖/visual-smoke 技能脚本未运行：本次使用实际 React 交互测试、Redis/SQL 集成测试、项目 Playwright 与 axe 检查替代通用静态扫描。

供应商接口核对来源：[Twilio VerificationCheck](https://www.twilio.com/docs/verify/api/verification-check)、[Twilio Verification](https://www.twilio.com/docs/verify/api/verification)、[阿里云 SendSms](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms)。使用既有 REST 协议，未增加新 SDK 或供应商。
