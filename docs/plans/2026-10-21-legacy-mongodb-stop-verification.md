# 旧 MongoDB 停止状态与连接依赖复核

2026-10-21（北京时间）按用户“确认没有剩余连接依赖后停止旧实例释放内存”的明确授权核验生产。
首次实时查询时，Zeabur 旧 `mongodb` 已为 `SUSPENDED`，因此本次没有再次暂停、启动或删除服务。
当日停止状态满足本次目标；当日未完成后续删除验收或 72 小时观察。后续删除信息见文末，表格保留核验时点的事实。

## 10 月 21 日核验证据

项目 `oral-app`，production 环境；旧服务 ID `6a0d816640a883532f3361fe`。

| 核验项 | 结果 |
| --- | --- |
| 旧实例状态 | service get 与完整服务列表均为 `SUSPENDED` |
| 实际关闭时间 | 旧 Mongo 最后 100 条日志中，UTC `2026-10-19T08:29:52.041Z` 记录 `mongod shutdown complete`，即北京时间 10-19 16:29:52；日志结束于同秒 |
| 实际容器探针 | 对旧实例执行 `true`，平台返回 `NOT_RUNNING_SERVICE` / `Inactive service`；CLI 自身返回 0，不能误当容器执行成功 |
| 旧实例内存 | 最近一小时 MEMORY 查询返回空数组；证明无可用运行指标，不能当作数值为零的测量 |
| 17 个服务配置 | 逐服务检查自定义变量：除旧 Mongo 自身外无旧主机、旧服务 ID 或 Mongo 模板变量引用；仅历史及备份配置 Mongo URI，均为 Atlas `oral_app_history` |
| 历史服务运行时 | URI 为 Atlas，业务库 `oral_app_history`，MongoDB ping=1，141 条会话，最新更新 UTC `2026-10-20T18:28:26.253Z` |
| 历史 readiness | 运行中服务的 `/ready` 返回 200 |
| 实际历史业务读取 | 从库中读取一条会话的标识，仅在内存中使用；通过运行中服务真实鉴权路由读取 session detail 与 user history，均为 200；未持久化用户标识或对话内容 |
| 历史写入门控 | 内部认证 GET 返回 200，`paused=false`、`active_writes=0`、`uncertain_writes=0`、`drained=true`；未更改门控 |
| 备份运行时 | URI 为 Atlas 业务库；用 Bash 执行实际 `/opt/oral-backup/health.sh` 成功，status=ok，完成时间 UTC `2026-10-20T18:30:14Z`（北京时间 10-21 02:30:14） |
| 近期日志 | CLI 返回的旧 Mongo、历史和备份日志中，未匹配到 Mongo 网络/服务器选择错误及指向 Mongo 的连接拒绝/DNS 错误；日志窗口有限，不作为持续零故障保证 |
| 公网健康 | `https://guajiguaji.top/api/users/health` 返回 200 |
| 其他业务服务 | 完整列表中 14 个非 Mongo、非 Umami 服务均为 `RUNNING`；两个 Umami 服务已为 `SUSPENDED`，本次未操作 |

使用服务自定义变量判断消费关系，未把共享 `readonlyVariables` 中仍可见的旧库导出变量误判为依赖。
运行时验证覆盖两个已知数据库消费者。旧实例已经停止，无法追溯 10 月 19 日记录的 6 个连接来源；本次未为此重新启动旧库。
当前未发现剩余配置依赖，历史真实读取和每日 Atlas 备份在旧库停止时可用。

停止容器与无运行状态已核实，因此旧 Mongo 运行进程不再占用内存；缺少本次暂停前后的同口径数值，不能报告实际释放了多少 MB。
10 月 19 日的 136 MB resident 仅为历史基线。

## 执行与证据保存

实际执行 Zeabur CLI 的 service list/get、逐服务 variable list、service exec、service metric MEMORY 和 deployment log；公网 curl；`python3 scripts/sdlc.py validate` 通过。
初次对备份 health 脚本使用 `sh`，因脚本要求 Bash 的 `pipefail` 失败；随后用 `bash /opt/oral-backup/health.sh` 成功，不涉及业务故障或配置修改。

脱敏配置清单：`quality/artifacts/latest/mongo-retirement-recheck-20261021.json`；脱敏日志汇总：`quality/artifacts/latest/mongo-retirement-logs-20261021.json`。
这些为本地忽略工件。凭据只在受控进程内读取，未写入报告、代码或日志；根目录活跃 SDLC 工件及用户暂存改动保持原状。

本次未执行 delete。根据 [Zeabur 暂停说明](https://zeabur.com/docs/en-US/operations/deployment/suspend-service)，暂停停止容器并保留配置及卷。
删除验收要求见 [退役评估](2026-10-19-zeabur-mongodb-retirement-assessment.md)。Atlas 已有更新，禁止直接将生产连接切回旧快照。

## 后续状态：用户确认服务已删除

用户在本对话中明确告知：“Zeabur上的 mongodb服务已删除”。本节于 2026-10-22 整理记录。
这项删除状态来自用户确认；本次文档整理未再次查询 Zeabur，也没有执行删除操作，不能据此推断数据卷仍保留。
上文 `SUSPENDED`、卷保留及业务/备份检查均为删除前核验记录，不是删除后的实时验证。
未补做或追认 72 小时观察、最终旧库独立备份及完整迁移验收。后续恢复应使用 Atlas 或已验证的 COS 备份，不再把旧 Zeabur 实例作为恢复路径。
