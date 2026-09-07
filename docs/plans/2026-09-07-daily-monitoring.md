# #52 聚合指标接口与日监控

用户于 2026-09-07 指示“执行 聚合指标接口任务，实现日监控即可”，据此执行本计划。
沿用已确认的独立分支/文档方式，保留根目录上一轮六阶段工件及用户未提交文件。

## 范围和契约

- 保留每 15 分钟基础健康检查；仅增加日聚合，不提供小时调度。
- user-service 在请求完成时计数，在每分钟采样容器 cgroup 内存使用比例。
  生产只读检查确认未配置 cgroup 硬限额，支持通过 MONITOR_MEMORY_BUDGET_BYTES
  显式设置告警预算作分母；未配置分母时缺失数据，不能填零。
  PostgreSQL 保存分钟级计数/峰值，最多保留四天，不记录路径、身份、日志或对话。
  此范围不包括网关产生的 502、其他服务或 WebSocket；内存也不是 CPU 指标。
- 备份任务仅在所有 COS 上传成功后写入 PostgreSQL 成功时间；不把进程存活当备份成功。
- 只读 Bearer 接口返回数字/布尔白名单；专用随机密钥，与 Zeabur 管理 API 密钥分离。
- 完整 UTC 自然日、生成时间、最新采样时间和覆盖分钟均输出为数值。
  少于 95% 分钟覆盖、零请求、缺失备份、陈旧采样或依赖故障均不能得到绿色结果。
  连续两日阈值分别计算错误率和内存，禁止不同原因拼成连续异常。
- 每天 00:15 UTC（北京时间 08:15）执行；自动聚合受仓库变量
  `DAILY_AGGREGATES_ENABLED=true` 控制，人工 daily 不受开关限制。
- 使用已有 GitHub diagnostic Issue 通道，默认 GITHUB_TOKEN 的 issues:write 权限，
  不依赖个人令牌；不自动执行诊断修复，不发送外部邮件/聊天消息。

## 执行与验收

1. 加入可重复执行的监控专用迁移、分钟采样和只读接口、备份完成上报。
2. 强化聚合消费端的格式/数据新鲜度验证，接入每天运行及数值摘要。
3. 覆盖越权、正常、无数据、过期、故障/超时、格式、日界线和并发计数；运行仓库验证。
4. 提交分支并创建 PR，等待人工合并；不直推 master，不自动合并。

## 发布与回滚

先执行迁移，再更新 user-service、backup-service；配置专用只读密钥与聚合 URL。
user-service 的 Zeabur Dockerfile 使用固定 GHCR 标签，发布须核对实际镜像版本。
累积至少一个完整 UTC 日后人工 dispatch daily；两日连续判定需要两日历史。
用户验收后开启 DAILY_AGGREGATES_ENABLED。上线前不声称已有生产聚合证据。
回滚关闭该变量，撤回两个服务版本；新增监控表可保留，不影响业务表或历史数据。

## 验证记录

- `npm run verify`：exit 0，decision=pass，final_score=100，findings=[]。
  user-service 常规套件 153 项通过；数据库集成 3 项默认跳过、另行显式执行。
- 显式设置 MONITOR_TEST_DATABASE_URL 后执行
  `npm --prefix services/user-service test -- --runInBand dailyAggregates.integration.test.js`：
  3 项通过，实际 PostgreSQL 验证迁移重入、并发计数、日读取和清理。
  使用随机隔离 schema，结束后查询残留测试 schema 数量为 0。
- `python3 quality/tests/daily-monitoring.test.py`：14 项通过（包含最终 cron 变量传递补测）。
- `python3 quality/tests/sdlc-gates.test.py`：34 项通过。
- `python3 scripts/sdlc.py validate --history`：SDLC gate clean；根工件仍为上一轮，
  此结果不代表本 PR 已获得独立审查或生产验收。
- 工作流 YAML 解析、全部 6 个 run 步骤的 bash 语法、两个备份脚本 bash 语法通过。
- staged Gitleaks：未发现泄漏；git diff --check 通过。
- user-service Docker 镜像构建通过；隔离容器中 Node 18 加载监控模块并读取真实 cgroup 样本通过。
- backup-service 镜像构建通过。首次直连 Debian 下载缓慢，停止该次构建（137），
  通过本地已有代理重试成功：
  `docker compose build --build-arg http_proxy=http://host.docker.internal:7890 --build-arg https_proxy=http://host.docker.internal:7890 backup-service`。
- 隔离 backup-service 镜像替代 cron 启动入口，验证实际 entrypoint 将
  BACKUP_MONITOR_ENABLED 传入定时环境；脚本语法与 psql 客户端均通过。
  此验证无网络、无业务凭据，不运行真实备份。
- 生产入口只读连通核验：同一 `/api/users/health`，Python 默认 User-Agent 返回 403，
  `oral-app-daily-monitor/1.0` 返回 200 JSON。消费端因此显式设置专用 User-Agent，
  未更改 Cloudflare 规则；这不代表新聚合接口已部署或已有生产聚合证据。
- 首个提交 `5fe00ea` 的 GitHub CI（test、ui-audit、verification-toolchain、
  sdlc-artifacts、sdlc-review）全部通过；User-Agent 后续补丁需复核最终提交的检查。

## 审查与生产状态

实现中自查补齐了 cron 环境白名单、监控路径大小写/尾斜线排除、失败报告和独立两日判定。
尚未宣称独立审查通过；由 PR 人工审查完成下一门禁。
只读生产探查未得到有限 cgroup 内存上限，需配置告警预算后验收。
未执行生产迁移、未设置生产密钥、未部署本轮改动、未启用每日聚合。
需要合并后按 `docs/daily-monitoring.md` 完成配置并积累实际完整日数据。
