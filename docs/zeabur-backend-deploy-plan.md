# Zeabur 后端部署执行清单（待确认后执行）

> 项目 `oral-app` ID `6a0d7fd433d1a635fa37f18b`，已登录。CLI = npm `zeabur@0.5.4`（npm 上限；0.19.0 仅 GitHub 二进制，flag 更全但装不了）。
> 现状：Phase 1 仅 client 落地页已上。本清单部署 7 个后端 + 3 个数据库。

## ⚠️ 执行前阻断项（必须先解决）

| # | 阻断 | 说明 |
|---|------|------|
| **P0** | CLI 0.5.4 非交互查询受限 | 无法 `-i=false` 列出已有 service / env-id。`deploy` 省略 `--environment-id` 时用「首个 environment」。**风险**：30 天前若已建过后端 service，CLI 看不到 → 可能重复建。**对策**：deploy 用 Git 模式 + 固定 `--name`，重名时先人工面板确认。 |
| **P1** | 部署用 Direct 还是 Git？ | **建议 Git deploy**（template GIT）→ push master 后自动 redeploy，CI/CD 友好。需 repo-id（happepls/oral_app）。PR #3 合入 master 后基于 master 部署。 |
| **P2** | 私钥不入 git | 所有 `STRIPE_*` / `DASHSCOPE_*` / `TENCENT_*` / `JWT_SECRET` / DB 密码经 `variable create` 注入 Zeabur，**不写进任何 commit**。 |

## 部署顺序（依赖拓扑）

```
阶段0  postgres · mongo · redis          (PREBUILT，先起，给连接串)
  │
阶段1  user-service                       (依赖 postgres；产 JWT_SECRET 基准)
  │
阶段2  ai-omni · comms · conversation ·   (依赖 redis/db/JWT；并行可)
       history-analytics · media · workflow
  │
阶段3  api-gateway                        (依赖全部后端 upstream 名)
  │
阶段4  client REACT_APP_API_URL 回指网关  (已上，改 env 重 build)
```

---

## 阶段 0：数据库（PREBUILT，面板加更稳）

CLI 0.5.4 deploy 只部署「本地目录」，PREBUILT 数据库走 **面板 Marketplace** 更稳（Add Service → Prebuilt → PostgreSQL 14 / MongoDB 6 / Redis 7）。建后 Zeabur 自动注入内网连接变量：
- postgres → `${POSTGRES_HOST}` `${POSTGRES_PORT}` `${POSTGRES_USERNAME}` `${POSTGRES_PASSWORD}` `${POSTGRES_DATABASE}`
- mongo → `${MONGO_CONNECTION_STRING}`
- redis → `${REDIS_HOST}` `${REDIS_PORT}`

> 建库后记下 service-id，下面用 Zeabur 模板变量引用（不用硬编码 IP）。

---

## 阶段 1：user-service

**部署**（Git 模式，monorepo 子目录 `services/user-service`）：
```bash
PID=6a0d7fd433d1a635fa37f18b
npx zeabur@latest deploy --create --name user-service \
  --environment-id <ENV_ID>        # 子目录构建需面板设 Root Directory=services/user-service
```
> ⚠️ 0.5.4 deploy 无 `--root-directory` flag → monorepo 子目录须**面板里设 Root Directory**。这是 0.5.4 的硬限制，阶段 1-3 每个 Node/Python service 都要面板补这一步。

**env**（`variable create --id <svc> --key "K=v" -y -i=false`）：
| KEY | VALUE |
|-----|-------|
| `DB_HOST` | `${POSTGRES_HOST}` |
| `DB_PORT` | `${POSTGRES_PORT}` |
| `DB_USER` | `${POSTGRES_USERNAME}` |
| `DB_PASSWORD` | `${POSTGRES_PASSWORD}` |
| `DB_DATABASE` | `${POSTGRES_DATABASE}` |
| `PORT` | `3000` |
| `JWT_SECRET` | 🔑 生产强随机（**记下，6 服务全一致**） |
| `JWT_REFRESH_SECRET` | 🔑 另一强随机（≠ JWT_SECRET，本地 MISSING 必补） |
| `GOOGLE_CLIENT_ID` | `318339571759-ojcd3oamef8ohmu5g04luaoq2a8oiseu.apps.googleusercontent.com` |
| `PASSWORD_RESET_BASE_URL` | `https://guajiguaji.top` |
| `STRIPE_SECRET_KEY` | `sk_live_...`（.env L15） |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...`（.env L16） |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...`（.env L17，live webhook 建后确认/更新） |
| `STRIPE_ALLOWED_ORIGINS` | `https://guajiguaji.top,https://www.guajiguaji.top` |
| `BILLING_LINK` | `https://billing.stripe.com/p/login/...`（.env L18） |
| `RESEND_API_KEY` / `RESEND_FROM` | 邮件（RESEND_FROM=Guaji AI <noreply@guajiguaji.top>） |
| `TWILIO_*` (3) | 海外短信 |
| `ALIYUN_SMS_*` (4) | 国内短信 |

**部署后 DB migration**（顺序）：init.sql 已含全部表，但若库非全新需补：
```bash
# 经 service exec 或面板 SQL
add_user_feedback_table.sql
add_onboarding_tour_column.sql
add_stripe_columns.sql
add_phone_column.sql
add_scenario_review_column.sql
```

---

## 阶段 2：6 个后端（并行）

每个 = Git deploy + 面板设 Root Directory + 注 env。

### ai-omni-service  (`services/ai-omni-service`, 端口 8082)
| KEY | VALUE |
|-----|-------|
| `QWEN3_OMNI_API_KEY` | `sk-ws-H.IPEDXR...`（intl，CSV） |
| `DASHSCOPE_API_KEY` | `sk-ws-H.IPEDXR...`（同上） |
| `DASHSCOPE_WS_URL` | `wss://ws-apadg96g31j9nnwh.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/realtime` |
| `DASHSCOPE_HTTP_BASE` | `https://ws-apadg96g31j9nnwh.ap-southeast-1.maas.aliyuncs.com` |
| `CORS_ALLOWED_ORIGINS` | `https://guajiguaji.top,https://www.guajiguaji.top` |
| `AI_SERVICE_PORT` `HEALTH_CHECK_PORT` | `8082` |
| `NODE_ENV` | `production` |
| 余（ASR_MODEL/TTS_MODEL/QWEN3_OMNI_MODEL/ENABLE_*） | 照本地 .env |

### comms-service  (`services/comms-service`, 8080)
`JWT_SECRET`=同基准 · `PORT`=8080 · `REDIS_HOST`=`${REDIS_HOST}` · `REDIS_PORT`=`${REDIS_PORT}`

### conversation-service  (`services/conversation-service`, 8083)
DB 5 项=postgres 模板变量 · `JWT_SECRET`=基准 · `PORT`=8083 · `REDIS_HOST/PORT`=redis 模板

### history-analytics-service  (`services/history-analytics-service`, 3004)
`MONGO_URI`=`${MONGO_CONNECTION_STRING}` · `PORT`=3004

### media-processing-service  (`services/media-processing-service`, 3005)
`PORT`=3005 · `TENCENT_SECRET_ID/KEY/BUCKET/REGION`=腾讯 COS（确认生产可用 + bucket CORS 放生产域名）
> ✅ COS 严格 TLS 已恢复（删了 NODE_TLS_REJECT_UNAUTHORIZED=0）→ 部署后实跑一次音频上传验证。

### workflow-service  (`services/workflow-service`, 3006)
无 .env（纯逻辑，无外部 key）。若依赖 redis 缓存用户数据 → 确认是否需 `REDIS_HOST/PORT`（看 `src/cache.py`）。

---

## 阶段 3：api-gateway  (`api-gateway`, 80)

Nginx，upstream 用 Zeabur **内网 service 名**。0.5.4 部署后面板设 Root Directory=`api-gateway`。
> nginx.conf 的 upstream 指向 docker 容器名（如 `user-service:3000`）——Zeabur 内网服务名可能不同，**须核对 upstream 名 = Zeabur 实际 service 域名**，否则 502。这是阶段 3 最易错点。

---

## 阶段 4：client 回指

client 已上。后端起来后改 client env `REACT_APP_API_URL`（现 `/api` 相对路径，若网关与 client 同域则不用改；跨域则指 `https://guajiguaji.top/api`）→ 重 build。

---

## Stripe live 收尾（后端 + 域名就绪后）

1. Dashboard 切 **live** → Developers → Webhooks → Add endpoint `https://guajiguaji.top/api/stripe/webhook`，事件：`checkout.session.completed` / `customer.subscription.{created,updated,deleted}` / `invoice.payment_failed` → 确认/更新 `STRIPE_WEBHOOK_SECRET`
2. live 模式 Settings → Billing → Customer portal → **Activate**（test 激活不带 live）
3. `node services/user-service/seed-products.js`（live env 下，宿主跑）→ 建 live 价格 周$4.99/年$99
4. E2E：订阅页真实价 → Checkout → 卡 → webhook 写 active → Profile "Pro 会员"

## CDN 隐源（VPS / Cloudflare，你做）

1. VPS 防火墙仅放 CF IP 段（https://www.cloudflare.com/ips/）到 80/443
2. host-nginx 兜底块 `listen 443 ssl default_server; server_name _; return 444;`（须带证书）
3. Cloudflare proxied + Full(strict) + Authenticated Origin Pulls
4. Google OAuth Console 加 `https://guajiguaji.top` 授权来源 + redirect URI

---

## 我执行 vs 你执行

| 动作 | 谁 | 备注 |
|------|----|------|
| Git deploy 7 service | **我（CLI）** | 需你先合 PR #3 到 master |
| 面板设每 service Root Directory | **你** | 0.5.4 无此 flag，硬限制 |
| 数据库 3 个（PREBUILT） | **你（面板）** | Marketplace 加更稳 |
| 注入 env（variable create） | **我（CLI）** | 你给我确认值；私钥不入 git |
| DB migration | **我（service exec）** | service 起来后 |
| Stripe webhook/portal 激活 | **你（Dashboard）** | 我跑 seed + 验证 |
| CDN/VPS/防火墙/OAuth | **你** | 外部控制台 |
