# 日监控运维与验收

接口：`GET https://guajiguaji.top/api/users/monitoring/daily`。
日任务：北京时间每天 08:15（UTC 00:15）；保留原有每 15 分钟的基础健康探测。
自动聚合默认关闭，人工选择 `daily` 验收后开启。没有小时聚合任务。

## 真实来源与局限

| 指标 | 来源和窗口 |
| --- | --- |
| `sample_count` / `five_xx_count` / `five_xx_rate` | user-service 的 `/api/*` HTTP 完成响应；5xx 除以完成响应总数；上一完整 UTC 自然日。包括 Stripe webhook；排除健康、监控和 SSE。 |
| `resource_utilization` | 同一服务容器 cgroup v2 或 v1 的内存使用量 / 内存上限，每分钟采样，取当日最大值；无硬限额时使用显式配置的告警预算 `MONITOR_MEMORY_BUDGET_BYTES` 作分母。预算不是容器硬限额，超过预算的比率可以大于 1。无法读取用量或缺少分母时没有有效样本。不是 CPU，也不代表其他服务。 |
| `backup_age_hours` | backup-service 完成 PostgreSQL、MongoDB 打包及所有要求的 COS 对象上传后写入的成功时间，计算距接口生成时刻的小时数。失败备份不刷新时间。 |
| `observed_minutes` | 上一 UTC 日有有效内存采样的独立分钟数；至少 1368/1440（95%）且请求数大于零才可返回成功。 |
| `previous_*` | 再前一完整 UTC 日，同一覆盖判据；不足时 `previous_window_available=false`，明确报告基线尚未形成。 |
| 时间字段 | Unix 秒：窗口起止、响应生成、最新有效内存采样、最近成功备份。 |

分钟表不含请求路径、用户 ID、Cookie、对话或日志。每小时清理四天前的分钟数据。
计数在响应 `finish` 时进入内存，每分钟以原子 SQL 加到 PostgreSQL；多实例同一分钟计数相加、内存取最大、覆盖分钟去重。
因此指标是可用实例的服务聚合，不是逐实例存活判定。内存采样不能捕获分钟之间的瞬时峰值。
进程终止最多损失尚未刷新的约一分钟计数，写入失败不重试不确定提交，避免重复计数；
因此这些是运行监控数据，不能用于账单或精确审计。95% 覆盖表示允许少量采样缺口。
该接口不覆盖网关自身 502、其他服务、WS/AI 错误；基础外部健康探测继续独立运行。

响应生成超过 300 秒、最新采样超过 180 秒、窗口错误、缺失备份、覆盖不足、无请求、
格式错误或依赖不可用均失败。备份年龄超过 26 小时直接诊断；错误率 ≥1% 或内存 ≥80%
须在两个相邻完整日分别连续越界才诊断，不能把不同原因相加。首次只有一天数据时报告
`previous_window_unavailable`，不会声称已验证两日趋势。重复读取不会累加异常窗口。

## 安装与配置

1. 合并后，使用现有安全数据库连接执行可重复执行的
   `services/user-service/migrations/20260907_daily_monitoring.sql`。
   新库 `init.sql` 和旧库 `update_db.sql` 也包含这两个独立监控表。
2. 更新 user-service 与 backup-service。前者的 Zeabur 自定义 Dockerfile 当前固定 GHCR
   镜像标签，必须在镜像构建完成后更新标签并确认容器中的实际代码，不能仅看 deployment commit。
3. 生成独立随机密钥（建议 32 随机字节编码为 64 个十六进制字符），通过密钥管理界面传递，
   不写入代码/命令历史/日志。user-service 环境变量 `MONITOR_READ_TOKEN` 与 GitHub Secret
   `ZEABUR_TOKEN` 保存同一值。此名称沿用旧工作流，但值**不是 Zeabur 管理 API 令牌**。
   普通登录 Cookie、用户 JWT、内部网络跳过认证均不能访问该接口。只提供 GET，读取不写数据。
   2026-09-07 只读检查发现生产 user-service 的 `memory.max` 为无限额；上线时还需设置
   `MONITOR_MEMORY_BUDGET_BYTES`（例如 512 MiB 为 `536870912`，阈值 80%），并在验收中确认预算。
   未配置预算时缺失内存数据，接口不会成功。修改预算或容器限额后应重新积累两日可比基线。
4. GitHub Secret `ZEABUR_AGGREGATES_URL` 设置为上述 HTTPS 接口地址；
   原有 Variable `PRODUCTION_HEALTH_URL` 继续使用基础健康 URL。
5. backup-service 设置 `BACKUP_MONITOR_ENABLED=true`，等待下一次成功定时备份；
   不通过写入“当前时间”伪造首次成功证据。上报失败会令备份任务失败并保留旧成功时间。
6. 保持 Variable `DAILY_AGGREGATES_ENABLED` 未设置或 `false`。至少积累一个完整 UTC 日，
   人工运行 `SDLC Production Observe` → `cadence=daily`，查看 Summary 与 Artifact。
   两日连续控制带验收需两个完整日；首次基线不足会明确显示。
7. 用户验收通过后设置 `DAILY_AGGREGATES_ENABLED=true`。GitHub 定时任务可能延迟，
   08:15 为计划时间而非精确定时承诺。

GitHub 的默认 `GITHUB_TOKEN` 可用 `issues:write` 建立/更新 diagnostic Issue；
不必配置个人 `SDLC_BOT_TOKEN`，但默认 token 创建的事件不会自动触发另一 Actions 工作流。
告警既保留 Issue/Artifact，也让本次运行失败。没有外部邮件或聊天服务调用。

## 验收清单

- 无 Bearer / 用户 Cookie / 错误 Bearer → 401；未配置专用密钥 → 503。
- 有正确密钥但缺数据或依赖不可用 → 503，返回仅布尔状态，不包含数据库报错细节。
- 正常 → 200，只有契约中的数字/布尔字段，`Cache-Control: no-store`。
- 独立窗口、5xx 比率、备份年龄与数据库数字一致；读接口不改变计数/备份时间。
- 消费端拒绝非 HTTPS、重定向、HTML、未知字段、超大响应、陈旧/未来时间和不一致计数。
- 关闭开关时 schedule 仅做健康；人工 daily 仍验证配置；开启后仅 daily cron 请求聚合。
- 密钥未配置、接口超时或格式错误时，不能用前一次成功文件生成绿色报告。

本地单元测试无需凭据：

```bash
npm --prefix services/user-service test -- --runInBand dailyAggregates.test.js
python3 quality/tests/daily-monitoring.test.py
python3 quality/tests/sdlc-gates.test.py
```

回滚：先关闭 `DAILY_AGGREGATES_ENABLED`，再关闭 `BACKUP_MONITOR_ENABLED` 并撤回两个服务版本。
监控表可以保留；不删业务数据，不改变基础健康探测。停用 MONITOR_READ_TOKEN 后不再采样。
