# 产品统计部署与查看

生产访问采集、转化队列与管理员报表已启用。实际执行证据、部署版本及仍待完成的真实新用户对话/可信访客IP验收见 [生产记录](plans/2026-09-20-product-analytics-production.md)。

## 架构和口径

- 自托管 Umami **3.4.0**（固定官方镜像，软件免费；Zeabur 计算/数据库资源按实际计费）显示 PV、访客、来源和自定义事件。
- 客户端经现有 `/api/users/analytics/pageview` 同源接口采集；不需要扩大 CSP。规范化路径只允许已知路由，其他为 `/other`，不采 query/hash/标题/对话内容/音频/业务身份。浏览器隐私信号与首页隐私弹窗开关均可关闭访问统计。
- `users` INSERT 触发器事务性记录 `registration_completed`，覆盖三种注册；既有用户不回填。外部 Umami 故障不影响注册事务。
- 普通场景在真实 scene_theater 阶段配对已接受的用户输入与同一 response 的完整 AI 文本。排除 tour/recall/daily_qa，magic_repetition 阶段不计，转到真人阶段才计。
- 注册后的默认快速面试 `quick_experience` 也纳入：首个有效且已持久化的回答记开始；三题回答完成且服务端 AI 反馈成功生成/保存，才记完整对话和结束。空体验、题目展示、无效回答、反馈生成失败不记完成。快速面试与普通场景共享账户级首次去重，不改变现有额度和评分规则。
- 实际输入记 `first_conversation_started`；完整轮次与明确结束同时存在才记 `first_conversation_completed`。整场后端确认完成也可结束。刷新/断线不自动结束。签名结束凭证绑定账户、会话，普通客户端不能伪造完整轮次。
- 浏览器结束记录按账户在本地保留待重试队列；上游证据以 Redis 原子队列重试，SQL 唯一约束保证每账户仅一个首次事件。Umami 没有本方案所需的接收幂等键，确认响应丢失可能重复投递，因此**精确转化率以 SQL 队列报表为准**。
- Umami 服务器事件带 `source=server`，无业务标识。查看浏览器/设备统计时排除 `/conversion`，不要用服务器合成会话做原生用户漏斗。事件时间使用原始业务时间，不使用投递重试时间。
- Umami 事件保留 90 天；业务最小首次时间账本随账户保留以保证终身去重，删除账户由外键清理。无个人关联的 Umami 汇总不能反查到业务账户。

## 人工批准发布后的步骤

1. 确认业务 PostgreSQL 备份可恢复。先应用 `services/user-service/migrations/20260920_product_analytics.sql`；幂等，可先于应用发布，不修改旧账户。
2. 在 Zeabur 建立**独立 Umami PostgreSQL 数据库和受限用户**，部署 `ghcr.io/umami-software/umami:3.4.0`。本地/自托管模板为 `deploy/umami.compose.yml`。配置 `DATABASE_URL`、随机 `APP_SECRET`、64 位十六进制 `TWO_FACTOR_ENCRYPTION_KEY`，关闭遥测。不要使用 oral_app 业务数据库。
3. 管理界面通过 HTTPS 的独立地址提供；公开前更改默认管理员密码，启用 2FA，关闭 Share URL、回放和不需要的功能。新增网站 `guajiguaji.top`，记录 website UUID。创建独立测试站点，验收不污染生产站点。
4. user-service 设置：

   | 环境变量 | 值/用途 |
   | --- | --- |
   | PRODUCT_ANALYTICS_ENABLED | `true`，缺省关闭采集和投递 |
   | UMAMI_URL | Umami 内网 HTTP 或 HTTPS 服务根地址 |
   | UMAMI_WEBSITE_ID | 新建网站 UUID |
   | UMAMI_DASHBOARD_URL | HTTPS 管理地址，无分享 token |
   | ANALYTICS_WRITE_TOKEN | 至少32字符随机专用凭据，与 AI 服务一致 |
   | ANALYTICS_ADMIN_USER_IDS | 允许查看队列报表的业务账户 UUID，逗号分隔 |
   | ANALYTICS_TRUST_PROXY | Cloudflare-only 入口已验证后设 `true`，使用可信 CF-Connecting-IP 统计访客及限流 |

   ai-omni 设置 `PRODUCT_ANALYTICS_ENABLED=true`、相同 `ANALYTICS_WRITE_TOKEN`、正确的 `USER_SERVICE_URL` 和现有 Redis 环境变量。必须启用 Redis 持久化。不要将密钥写入构建参数、前端或 PR。

5. 确认 Cloudflare 代理入口覆盖全部流量、origin 无可绕过公网入口；否则不要信任浏览器可伪造的 CF-Connecting-IP。缺省只用 socket IP，在代理之后会合并部分访客；**真实访客数验收必须先解决可信 IP 链**。
6. 构建前端、重建 user-service 和 ai-omni 镜像，按既有 Zeabur 流程人工发布；记录部署 SHA。自托管 Node 镜像依赖先在宿主安装。
7. 专用维护任务每天执行 `node src/scripts/prune-product-analytics.js --apply`，仅向该任务注入 `UMAMI_DATABASE_URL` 和 `UMAMI_WEBSITE_ID`；先不带 `--apply` 查看过期数量。该脚本针对 Umami 3.4.0 schema；升级前重新验证。没有成功运行的保留期任务，不得宣称满足90天保留期。

## 管理员如何查看

- **访问统计**：打开 `UMAMI_DASHBOARD_URL`，用 Umami 管理员账户登录，选择 guajiguaji.top、日期范围。查看 Visitors、Views、Referrers 和三种事件名。
- **精确注册转化**：使用白名单中的业务管理员账户登录 guajiguaji.top，再在同一浏览器打开 `/api/users/analytics/report`。返回 JSON 汇总，不含个人列表。也支持管理员 Bearer access token，普通用户403、未登录401。
- 可带 `?from=2026-09-20T00:00:00Z&to=2026-09-21T00:00:00Z`（左闭右开，最长90天）选注册队列。`registered/started/completed` 是该注册队列的累计人数；`conversion` 为截至查询时首次完成率；`mature_7d/completed_7d/conversion7d` 只统计注册已满7天队列在7天内转化的比例，`observing` 是仍在观察的数量。空分母返回 null。
- `delivery.pending/retrying/oldest_pending` 显示 Umami 投递积压。Zeabur 日志中的 `[product-analytics]` 只用于故障诊断，不是漏斗看板。

## 验收与已知边界

上线必须由管理员看到一次真实测试访问、SPA 导航和新账户注册→真人完整轮次→明确结束，确认刷新/重试不增加精确首次计数；验证普通账户无法查看报表、拒绝统计后不发访问请求。使用独立测试站点/账户，记录脱敏结果而非凭据、语音、对话内容。

原始方案的相关测试及核查清单见 `docs/plans/2026-09-20-product-analytics.md`。没有线上仪表板和流量证据，任务不能标记完成。

Redis 暂时不可用时，AI 进程内存保留证据并由后台重试；**Redis 故障期间同时重启 AI 进程仍可能丢失未持久化证据**，日志会报告队列故障。发布前应验证 Redis 持久化、可用性和积压监控。Umami 接收确认丢失有至少一次投递重复风险，报表账本不重复。页面访问为尽力采集，屏蔽器或网络失败会少计。

浏览器结束时间采用服务端首次收到有效结束请求的时间；若浏览器离线数日后才重试，7天转化窗口也按该接收时间计算。服务端自身队列重试则保留原始时间。该口径不声称测得离线期间的真实点击时间。

回滚：先关闭两个服务的 `PRODUCT_ANALYTICS_ENABLED`，回退应用版本，保留新增表及 Umami 数据；如需停用注册触发器，人工执行 `DROP TRIGGER IF EXISTS product_registration ON users`。不删除业务用户或分析库。回滚/生产变更均需批准。

来源：<https://docs.umami.is/docs/api/sending-stats>；固定版本协议与保留期 schema 已对照 <https://github.com/umami-software/umami/tree/v3.4.0>。
