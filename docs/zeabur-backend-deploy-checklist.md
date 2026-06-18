# Zeabur 后端上线部署清单

> 生成于 2026-06-11。代码已生产就绪——以下全是**部署时配置**，非代码改动。
> 所有密钥走 Zeabur 环境变量面板配置，**不要**提交 `.env`（已 gitignored）。

---

## A. 必改配置（不改会坏）

| # | 项 | 当前值（本地） | 上线需改为 | 不改的后果 |
|---|----|------|---------|------|
| **A1** | `PASSWORD_RESET_BASE_URL`（user-service） | `http://localhost:5001` | `https://guajiguaji.top` | 密码重置邮件链接指向 localhost，用户点击打不开 |
| **A2** | `STRIPE_ALLOWED_ORIGINS`（user-service） | `localhost:3000,localhost:5001` | 追加 `https://guajiguaji.top` | 生产 Checkout 跳转被 CORS 拒绝 |
| **A3** | `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | `sk_test_` / `pk_test_` | 切 `sk_live_` / `pk_live_` | test 模式收不到真钱 |
| **A4** | `STRIPE_WEBHOOK_SECRET` | `whsec_...`（本地 `stripe listen` 临时值） | Stripe Dashboard 生产 endpoint 的 `whsec_` | webhook 验签失败 → 订阅状态不更新 |
| **A5** | `REACT_APP_API_GATEWAY`（client/.env，构建期注入） | `http://oral_app_api_gateway:80`（docker 内网名） | 生产网关地址或相对路径 | 前端调不到后端；**改后必须重新 build 前端 image** |

---

## B. 必补 / 必换 env

| # | 项 | 状态 | 说明 |
|---|----|------|------|
| **B1** | `JWT_REFRESH_SECRET`（user-service） | **本地 MISSING** | enhancedAuthMiddleware 用它签 refresh token。生产必设，且与 `JWT_SECRET` 不同值 |
| **B2** | `JWT_SECRET`（所有服务） | 本地有 | 生产换强随机值，**所有服务必须一致**（comms/ai-omni/workflow/conversation/history/user 全部） |
| **B3** | `FREE_DAILY_TURNS` / `PRO_DAILY_TURNS`（ai-omni） | 不在 .env（代码默认 15 / 150） | 想调额度才需显式设；不设走默认，可接受 |

---

## C. 第三方服务生产侧配置（控制台操作）

| # | 服务 | 操作 |
|---|------|------|
| **C1** | **Stripe** | 切 live 模式；建 webhook endpoint 指向 `https://guajiguaji.top/api/stripe/webhook` 拿生产 `whsec_`；**live 模式单独激活 Customer Portal**（test 的激活不带到 live） |
| **C2** | **Google OAuth** | Console「已授权 JavaScript 来源」+ redirect URI 加 `https://guajiguaji.top`，否则 Google 登录报 `redirect_uri_mismatch` |
| **C3** | **ZSend（密码重置邮件）** | DNS 已验证 ✅，生产直接可用。`ZSEND_FROM=noreply@guajiguaji.top` |
| **C4** | **Twilio（海外手机号）** | 海外号已通 ✅。中国大陆号 error 60220 需 Twilio Support 申请白名单（或靠阿里云兜底，见 C5） |
| **C5** | **阿里云 SMS（国内手机号）** | 已通 ✅。——当前签名「杭州独步网络工程有限公司」 |
| **C6** | **腾讯 COS（音频上传）** | 确认生产 `TENCENT_SECRET_*` 可用 + bucket CORS 允许生产域名 |
| **C7** | **Tawk.to（在线客服）** | `REACT_APP_TAWK_PROPERTY_ID/WIDGET_ID` 构建期注入；登录后自动隐藏已实现 |

---

## D. 部署机制 / 架构

| # | 项 | 说明 |
|---|----|------|
| **D1** | **12 个服务全部署** | 当前 Phase 1 只上前端。后端需部署：user / comms / ai-omni / workflow / conversation / history-analytics / media-processing + api-gateway + PostgreSQL / MongoDB / Redis（DB 已在 Zeabur） |
| **D2** | **api-gateway nginx upstream** | `nginx.conf` 用 docker 内网服务名。Zeabur 服务间走 Zeabur 内网 DNS，核对 upstream 名匹配 Zeabur 服务名 |
| **D3** | **Node 服务 node_modules** | CLAUDE.md 规定 copy node_modules（不 npm install）。确保 Zeabur 构建期 node_modules 可用 |
| **D4** | **DB 迁移** | 生产 PostgreSQL 跑 init.sql + 所有 migrations。本轮新增需确认已应用：`add_phone_column.sql`（phone 列 + UNIQUE）、`add_stripe_columns.sql`、onboarding_tour 列 |
| **D5** | **client/Dockerfile.prod** | 多阶段 `npm ci --legacy-peer-deps`；REACT_APP_* 构建期注入 → 改 env 必须重新 build image |

---

## E. 安全

| # | 项 | 说明 |
|---|----|------|
| **E1** | 轮换暴露密钥 | 开发期对话中暴露过 ZSend key + Twilio Auth Token，生产前建议在各控制台重新生成 |
| **E2** | `.env` 不进 git / Zeabur | 走 Zeabur 环境变量面板配置 |
| **E3** | gitleaks | pre-commit + Claude Code hook 已全程拦截 |

---

## 最关键 5 项（上线必做，按顺序）

1. **A1** `PASSWORD_RESET_BASE_URL` → `https://guajiguaji.top`
2. **A2** `STRIPE_ALLOWED_ORIGINS` 追加生产域名
3. **A3 + A4 + C1** Stripe 切 live + 生产 webhook secret + live 模式激活 Portal
4. **B1 + B2** `JWT_SECRET` / `JWT_REFRESH_SECRET` 生产强随机值（全服务一致）
5. **C2** Google OAuth 加生产域名授权

---

## 已就绪基础设施（Zeabur，参考）

- VPS: Aliyun Bangkok 2C/4GB（server-6a0d7df54ad3b2bc03a82389）
- Project: oral-app（ID 6a0d7fd433d1a635fa37f18b）
- PostgreSQL / MongoDB / Redis 已部署
- 域名: guajiguaji.top / www.guajiguaji.top（NameSilo）
- nginx CORS 白名单已含生产域名 ✅
