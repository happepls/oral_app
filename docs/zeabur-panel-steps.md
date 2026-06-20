# Zeabur 面板手动步骤（CLI 无法设置的项）

> 7 个后端 service 已由 CLI 创建 + env 已注入。**以下两项 CLI 无法设置，必须你在面板做**：每个 service 的 **Root Directory** 和 **暴露端口**。

面板：https://dash.zeabur.com → project `oral-app` → 点对应 service。

## 每个 service 设 Root Directory + Port

进 service → **Settings**（或 Source 标签）→ 设 **Root Directory**；→ **Networking**（或 Ports）→ 设暴露端口。

| service | service ID | Root Directory | 暴露端口 |
|---------|-----------|----------------|---------|
| user-service | `6a361c21b2350c13adc3f31e` | `services/user-service` | **3000** |
| workflow-service | `6a361c32558aac447d435dcf` | `services/workflow-service` | **3006** |
| media-processing-service | `6a361c3b558aac447d435dd4` | `services/media-processing-service` | **3005** |
| history-analytics-service | `6a361c44b2350c13adc3f323` | `services/history-analytics-service` | **3004** |
| conversation-service | `6a361c4c558aac447d435dd8` | `services/conversation-service` | **8083** |
| ai-omni-service | `6a361c55b2350c13adc3f327` | `services/ai-omni-service` | **8082** |
| comms-service | `6a361c5d558aac447d435ddc` | `services/comms-service` | **8080** |
| **api-gateway** | `6a361e40558aac447d435f27` | `api-gateway` | **80** |

> ⚠️ 端口必须精确匹配——网关 nginx upstream 按这些端口连。workflow-service/ai-omni-service 代码里端口硬编码（忽略 PORT env），所以**暴露端口**必须设对。

## 域名绑定

- **只给 api-gateway（或 client-app）绑公网域名** `guajiguaji.top`。
- 7 个后端 + workflow-service **全部保持 PRIVATE**（无公网域名）——它们经内网 `service-<id>` 互访 + 经 Nginx 网关对外。
- workflow-service 必须 private（nginx.conf 故意不含它，ai-omni 经内网直连）。

## 还需部署 api-gateway（网关）

后端起来后还要部署 **api-gateway** service（我会 CLI 创建），面板设：
- Root Directory = `api-gateway`
- 暴露端口 = **80**
- 绑公网域名 `guajiguaji.top`

## 设完后告诉我

我会：
1. `service redeploy` 触发各 service 用正确 root-dir 重建
2. 看 build/runtime 日志确认无 crash
3. 跑 SQL bootstrap（建表）到 postgres
4. smoke-test 关键链路
