# Guaji Developer API（本地首期）

Developer API 通过 `http://localhost:8081/api/v1` 暴露。它与旧的第一方 `/api/*` 路由并存，不公开 Stripe、内部评分写入、强制任务完成、phase/reset、管理和调试接口。

完整 Compose 启动前必须在根 `.env` 设置同一份 `JWT_SECRET`（user、comms、history、developer 共用）、独立的 `DELEGATED_JWT_SECRET`，以及仅供 conversation→history 写入的 `INTERNAL_AUTH_SECRET`；配置缺失时 Compose 会直接报错，禁止回退到仓库内默认密钥。

鉴权分两层：合作方请求必须带 `X-Guaji-API-Key`；用户数据请求还要带 60 分钟 delegated bearer token。原始 Key 与一次性 code 只显示一次，数据库只保存 SHA-256 哈希。用户身份只从 token 读取，外部请求中的 `userId` 不会被接受。Guaji 第一方网页可用现有 httpOnly `accessToken` cookie 调用同一契约；该模式不接受合作方 token exchange，也不向浏览器暴露 API Key。

本地初始化：

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d postgres-test mongo-test redis-test
DATABASE_URL=postgresql://test_user:test_password@localhost:55432/oral_app_test \
  npm --prefix services/developer-api-service run seed:local
```

测试数据服务只绑定回环地址：PostgreSQL `55432`、MongoDB `57017`、Redis `56379`，避免碰撞开发栈默认端口。要直接启动 façade（不经过 Nginx），另开终端运行：

```bash
DATABASE_URL=postgresql://test_user:test_password@localhost:55432/oral_app_test \
DELEGATED_JWT_SECRET="$LOCAL_DELEGATED_JWT_SECRET" \
JWT_SECRET="$LOCAL_REALTIME_JWT_SECRET" \
PORT=3010 npm --prefix services/developer-api-service start
```

seed 只创建本地合作方和 API Key，不代替用户授权。登录 Guaji 后打开 seed 输出的 `authorization_url`，核对合作方与 scopes 并选择允许；浏览器只会跳转到预先登记的 `redirect_uri`。从回调 URL 读取十分钟内有效、仅可使用一次的 `code`，再换取 60 分钟 delegated token：

```bash
curl -sS http://localhost:8081/api/v1/oauth/token \
  -H "X-Guaji-API-Key: $GUAJI_API_KEY" \
  -H 'Content-Type: application/json' \
  --data "{\"code\":\"$GUAJI_AUTH_CODE\"}"
```

授权请求可先通过 `GET /oauth/authorize` 预览，决定通过 `POST /oauth/authorize` 提交，后者必须带 `Idempotency-Key`。拒绝时回调仅包含 `error=access_denied`；服务端只保存 authorization code 的 SHA-256 哈希。redirect URI 必须与 seed 时登记的值完全一致。

调用用户档案：

```bash
curl -sS http://localhost:8081/api/v1/profile \
  -H "X-Guaji-API-Key: $GUAJI_API_KEY" \
  -H "Authorization: Bearer $GUAJI_DELEGATED_TOKEN"
```

高成本或写入请求必须带 `Idempotency-Key`。实时连接先调用 `POST /realtime/tickets`，再使用返回的 60 秒 ticket 连接 `ws://localhost:8081/api/v1/realtime?ticket=...`。

正式契约见 `contracts/openapi-v1.yaml` 与 `contracts/asyncapi-v1.yaml`。TTS 的成功响应是 `audio/wav`，这是统一 JSON envelope 的显式二进制例外。
