# 本地隔离登录与真实 Stripe Test Clock

此环境用于验证登录、会员查询、场景生成和真实 Stripe 测试事件，不接入生产账户。使用独立 Compose project `oral-stripe-audit`、数据库卷、Redis 和 JWT；不叠加现有 Compose，不挂载生产数据，不把 user-service 原 `.env` 挂进应用容器。业务 WebSocket、音频、历史、短信和邮件链路未接入，不用于验收这些功能。

2026-10-20 核对 `services/user-service/.env`，其中 secret/public key 均为 **test**。演练只读取这两个字段，拒绝 live、缺失或混合模式密钥；不复制原 webhook secret、数据库地址或其他供应商凭据。无需修改 live keys 或生产 webhook。

## 启动和登录

前提：Docker 已启动；宿主有 Node、Stripe CLI，user-service/developer-api-service 的 `node_modules` 已安装；`client/build` 存在。源码挂载只读，容器内不安装依赖。前端源码更新后先在宿主 `cd client && npm run build`。

仓库根目录执行：

```bash
node scripts/stripe-clock-audit.mjs start
```

根 `.env` 存在 `QWEN3_OMNI_API_KEY` 时，`start` 会将该字段单独写入私有演练配置并启用 `scenarios` profile，启动同一隔离网络的 ai-omni-service。模型请求使用公开 DashScope 端点；不复制原应用数据库/JWT、专属实时端点或其他供应商凭据。结果中的 `scenarios_enabled` 必须为 true 才能进行场景生成。未配置此密钥时仍可进行会员演练，场景生成功能不可用。

AI 镜像默认复用本机 `oral_app-ai-omni-service:latest`，当前 app 源码只读挂载；若镜像不存在，可先构建隔离服务：

```bash
docker compose -p oral-stripe-audit \
  --env-file quality/artifacts/stripe-clock-audit/private/.env \
  -f docker-compose.stripe-audit.yml --profile scenarios build ai-omni-service
node scripts/stripe-clock-audit.mjs start
```

实际场景回归（调用模型，会产生正常模型用量；新建另一个临时隔离账号，不覆盖主测试账户）：

```bash
node scripts/stripe-audit-scenarios-smoke.mjs
```

它通过真实登录表单、完整五步目标向导，验证生成 10 个场景/每个 3 个任务、确认保存、跳转 Discovery 和权威快照读取；证据为 `scenario-browser-smoke.json` 及 `scenario-wizard-generated.png`。这不代表音频/历史等未启动链路也已验收。

打开 **http://billing-audit.localhost:5510/login**。与 `localhost` 和生产域名的 cookie/localStorage 隔离；浏览器需支持 `.localhost` 回环解析。若本机浏览器无法解析，可在本机 hosts 中将 `billing-audit.localhost` 指向 `127.0.0.1`，不需要公开 DNS。

邮箱：`stripe-audit@example.test`。自动生成的密码位于本机忽略文件：

`quality/artifacts/stripe-clock-audit/private/login.json`

该文件权限 0600，目录 0700；请在本机查看，勿粘贴到聊天或提交。用同一密码可重复登录，进入 `/profile` 或 `/subscription` 查看会员。浏览器只能访问本机的 5510；仅 webhook 调试端口 5532 同样绑定回环地址。该登录属于新建测试数据库，与用户此前提供的生产邮箱无关。

`start` 自动开启 Stripe CLI 并获取本次 listener 的签名 secret，只写入隔离环境的忽略 `.env`。CLI 使用 test key，通过 Stripe 连接将真实测试事件转发至 `http://127.0.0.1:5532/api/stripe/webhook`，应用仍执行原有 raw-body/签名验证/Stripe API 核查和 SQL 更新。无需公开本机端口或注册新的生产 endpoint。

## 执行真实周期末取消

```bash
node scripts/stripe-clock-audit.mjs rehearse
# 额外走真实网页登录并保存会员/免费截图：
STRIPE_AUDIT_CAPTURE_BROWSER=true node scripts/stripe-clock-audit.mjs rehearse
```

截图使用 client 的 Playwright；macOS 已装 Chrome 时复用它，否则需先安装与 Playwright 匹配的 Chromium。浏览器拦截所有非本地审计 origin 的请求。截图读取当前 `client/build`，不自动重建或声称与生产 bundle 相同。

每次演练：

1. 创建独立 Test Clock、无邮箱的全新 test Customer、仅本次使用的 Product/Price，绑定测试付款方式；创建每月 USD 1 的测试订阅，无真实扣款。
2. 只将本地测试用户关联 customer ID；由真实 `customer.subscription.created` webhook 把会员状态写入数据库。没有手工写 active 代替 webhook。
3. 检查预付费已过期但订阅 active 时仍保留权限，再清除这个预付费 fixture。
4. 设置 `cancel_at_period_end=true`，确认周期内为会员；先推进到周期结束前 1 秒，仍为 active。
5. 推进到结束后 1 秒，等待 Stripe Clock ready、订阅 canceled，以及实际 webhook 更新数据库。profile 和 subscription 返回 200、权益降级，直接 Pro 请求为 403。
6. 本地设置未来预付费 fixture，确认 canceled 订阅不会覆盖尚有效的预付费权益；再设置已过期 fixture，确认降级后仍能普通登录。

这里手工改变的预付费时间只是独立数据库的 overlap fixture；Test Clock 不推进应用服务器或 PostgreSQL 的真实时间。自然预付费到期五分钟演练见 [10 月 20 日验证记录](plans/2026-10-20-membership-expiry-atlas-restore-verification.md)。Test Clock 的订阅通过 Stripe API 创建，本次不宣称走过 Checkout 托管页面支付或 live 支付。

脚本在结束时归档本次创建的 Product/Price，保留测试 Clock、Customer 和 canceled 订阅供 Stripe Dashboard 核对；不修改其他 Stripe 对象，不修改账号级设置。使用已有账户的 test mode；不声称另外创建了 Dashboard Sandbox。

## 证据和停止

脱敏结果在 `quality/artifacts/stripe-clock-audit/oral-clock-*.json`，包括 clock/customer/subscription/price 的测试对象 ID、UTC 检查点、HTTP 状态、实际事件 ID/转发响应。可选截图保存在同目录，不包含密码。

`private/stripe-listener.log` 含 listener 签名密钥，`private/.env` 含测试密钥；不得分享或提交。失败时仅在本机读取 `private/last-error.json`，报告不输出 SDK 原始请求或凭据。

```bash
node scripts/stripe-clock-audit.mjs stop
```

仅停止本次 CLI 和 `oral-stripe-audit` 容器，保留其数据库卷及登录文件方便后续复测。启动环境会保留供用户登录，不自动清理。不要在生产 Compose 上运行本演练，也不要将密钥改成 live 绕过检查。

[Stripe 官方 Test Clock 流程](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage)说明时钟、客户、订阅和异步推进；[官方 webhook 本地测试文档](https://docs.stripe.com/webhooks#test-webhook)说明 CLI 转发及 listener 专用签名密钥。报告中的通过结论只能依据实际结果文件，不依据操作步骤本身。
