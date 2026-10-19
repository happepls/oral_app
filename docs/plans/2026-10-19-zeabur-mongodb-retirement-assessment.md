# Zeabur 旧 MongoDB 退役评估

## 结论

2026-10-19 的只读检查支持将 Zeabur `mongodb` 列为退役候选：
生产历史和备份已使用 Atlas，旧库最近更新时间明显早于 Atlas。
**尚不建议直接删除**：需要备份恢复验收、旧库数据完整迁入的证据，以及停止旧实例后的观察。
本次没有暂停、删除、重启服务，没有修改生产连接或数据库内容。

## 当日生产证据

| 检查 | 实际结果 | 解释边界 |
| --- | --- | --- |
| 17 个服务的自定义变量 | 仅历史、备份及旧 Mongo 自身有 Mongo 相关自定义变量；历史和备份 MONGO_URI 均为 Atlas 的 oral_app_history | 全局 readonlyVariables 仍列出旧 Mongo 导出的变量；导出存在本身不代表服务使用 |
| 其他服务显式旧变量引用 | 未发现 | 不是任意外部消费者或所有运行时连接的完整证明 |
| 历史运行时 | 容器中 MONGO_URI 为 Atlas，独立只读 mongoose 连接 ping=1 | 未写入合成或真实会话 |
| Atlas 会话统计 | 133 条；最新创建 2026-10-19T02:47:54.998Z；最新更新 2026-10-19T04:30:48.310Z | 仅统计，无对话内容；数量不能证明源数据是目标的完整子集 |
| 备份运行时 | URI 指向 Atlas；health.sh 退出 0，status=ok；完成时间 2026-10-18T18:30:13Z（北京时间 10-19 02:30:13） | 当日成功状态，不等于已恢复核验；未触发新的备份任务 |
| 旧 MongoDB | RUNNING，108 条；最新创建 2026-10-07T20:49:53.233Z；最新更新 2026-10-08T05:02:06.436Z | 单次快照不能证明之后所有集合都没有写入 |
| 旧实例资源 | serverStatus resident=136 MB；当前连接数 6 | 连接包括内部/监控/本次探针，未逐个归因；不能承诺账单下降幅度 |

通过 Zeabur CLI 的 service/variable 只读查询及 service exec 读取运行时统计。
凭据仅在进程内存中处理，报告不含 URI、密码、用户标识或对话内容。
脱敏原始汇总在本地忽略目录 `quality/artifacts/latest/zeabur-mongo-*-audit.json`
及 `zeabur-mongo-runtime-extra.json`。

2026-10-08 的[迁移候选记录](2026-10-08-atlas-migration-candidate.md)是历史时点的记录，
其“尚未切换”描述不代表当前状态；当日独立库恢复演练也不能代替切换后正式备份恢复验收。

## 删除前操作顺序（待授权和验收）

1. 取得正式切换的数据核对证据，或只读核对旧库各集合、文档 ID 与关键字段在 Atlas 中的保留情况；
   对允许更新的数据解释差异，不以 133 大于 108 代替数据完整性核验。
2. 保存旧实例最终独立备份，并验证当前 Atlas 的 COS 备份可恢复到隔离库；
   记录恢复点、校验结果、集合/索引和业务查询。保护备份与恢复所需的凭据。
3. 复核旧实例现有 6 个连接的来源，排除遗漏消费者；再获准暂停旧 MongoDB，保留卷。
4. 按既有迁移方案观察 72 小时，验证真实历史读写、统计、音频关联、readiness 和每日备份。
   失败时定位遗漏连接；Atlas 已有新写入，不能直接把历史服务切回旧快照。
5. 人工验收后单独批准删除 Zeabur 旧服务及其卷。保留 MongoDB Atlas 与 backup-service。

[Zeabur 官方说明](https://zeabur.com/docs/en-US/operations/deployment/suspend-service)
确认暂停保留配置和卷，删除在宽限期后会永久删除卷；因此先暂停观察再删除。
[Atlas 官方备份说明](https://www.mongodb.com/docs/atlas/backup-restore-cluster/)
提供按集群类型选择备份/恢复方式的依据。具体 Atlas 套餐和恢复权限本次未核查。
