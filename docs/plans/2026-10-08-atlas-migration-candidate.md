# Atlas 迁移候选：操作与验收

状态：本地工具、停写门控、数据库就绪检查、合成演练及真实 Atlas 独立库恢复演练已通过；**尚未正式停写、切换生产连接或删除旧服务**。本文件不是生产发布审批，不替换根目录活跃 SDLC 工件。

独立发布候选：`feat/atlas-migration` 仅包含迁移相关 12 个文件，初始以当时生产/远端 master `4765da65f8761eee5fc7b9596522ffb85003c7b4` 为基线。PR #73 经人工合入后，已无冲突合入最新 master `ef47992e588abd482d8a434dec2970190a470c24`，保持 PR 相对于 master 的差异仅为迁移改动；未引入 PR #75 或会员授权候选。该分支重新执行迁移 CLI 11 项、history 15 项、备份/监控 16 项，全部通过。后文统一验证 100 分来自较早的综合隔离候选，不作为此分支独立全库验证的替代。

重新核对后，生产历史部署仍为上述 commit，尚未包含 `/ready` 或写入门控。先人工审核此独立 PR，合入后核验历史/备份实际部署版本，保持原 Mongo URI；确认门控和数据库 readiness 可用后，才能进入最终维护窗口。合入本 PR 不代表已迁移数据或批准删除旧服务。

## 实现范围

- `scripts/mongo-atlas-rehearsal.mjs`：检查、全量摘要比较、加密备份迁移演练、离线备份恢复。
- 历史服务 `/ready`：真实 MongoDB ping，断开或超时返回 503；`/health` 保持进程存活检查。
- 历史服务 `/internal/migration/write-gate`：内部服务认证保护的 GET/POST 门控，暂停新历史写入并报告在途 HTTP 写入。
- `docker-compose.atlas.yml`：显式叠加后，历史与备份使用受保护的同一 `MONGO_URI`；取消对旧 Mongo 服务的启动依赖，并将旧服务放入 `legacy-mongo` profile。不会停止已有实例或删除卷。
- 定时备份通过权限 0600 的临时配置传递 Mongo URI，不将其写入进程参数或失败日志；既有 COS 备份流程保留。

## 执行前置条件

1. 记录生产服务部署版本、各服务内存明细、源数据库版本/数据量/集合/索引和备份状态。已取得下述只读基线；切换前仍须重新核对实际版本、数据与备份状态，不能承诺释放比例。
2. 创建容量与版本兼容的 Atlas 集群。应用与备份使用限定业务数据库的账号；演练目标使用独立数据库。按实际 Zeabur 出站地址配置 [Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)，测量从部署环境发出的连接与业务查询延迟。
3. 通过秘密管理器注入下列变量。不得把值写入工件、命令行参数、日志、聊天或提交的 `.env`。

| 变量 | 用途 |
| --- | --- |
| `SOURCE_MONGO_URI` / `SOURCE_MONGO_DB` | 源连接与业务数据库名 |
| `TARGET_MONGO_URI` / `TARGET_MONGO_DB` | Atlas 独立演练目标；必须没有任何集合 |
| `MONGO_BACKUP_KEY` | 独立保管的 32 字节密钥，标准 base64；丢失后无法恢复备份 |
| `MONGO_WRITES_PAUSED=true` | 操作员确认全体写入已暂停；工具不自动暂停源服务 |
| `MONGO_URI` | 正式切换后历史与定时备份的 URI，数据库部分必须指向验收通过的目标数据库 |
| `INTERNAL_AUTH_SECRET` | 历史门控内部认证；沿用服务共同配置 |

本地操作端需要 Node、历史服务依赖和支持 `--config` 的 MongoDB Database Tools（100.3+）。工具不自动调整账号权限、网络配置或生产环境。

## 演练

凭据已由受保护环境注入后执行，下列命令不包含任何秘密值：

```bash
node scripts/mongo-atlas-rehearsal.mjs inspect
node scripts/mongo-atlas-rehearsal.mjs rehearse --backup /secure-backups/atlas-rehearsal.enc
node scripts/mongo-atlas-rehearsal.mjs compare
```

`rehearse` 要求源与目标数据库名不同、目标全新、停写确认以及有效密钥；不会执行 `--drop`。完整文档按 `_id` 排序，用严格 BSON EJSON 形成 SHA-256；核对所有集合、文档数量、全量摘要、集合选项和索引，保留复合索引字段顺序。视图等未支持类型会阻断演练，须单独设计迁移方案。

备份以 AES-256-GCM 加密，路径必须未存在。恢复前完整验证认证标签；迁移期间源内容变化或恢复内容不同均判失败。报告只包含统计、摘要与时间，不包含文档、凭据或原始索引定义。演练不具有在线一致性保证，必须真实停写。

离线恢复演练：另选一个全新目标数据库，保留 `SOURCE_MONGO_DB` 作为归档命名空间；无需源 URI 或源连接。

```bash
node scripts/mongo-atlas-rehearsal.mjs restore --backup /secure-backups/atlas-rehearsal.enc
```

恢复报告的 `archiveAuthenticated=true` 只证明归档完整且恢复成功；对照先前受控保管的脱敏报告核对全部集合数量、摘要、索引及选项，并运行业务查询。归档和密钥分开保存；不可用测试随机密钥替代可恢复的生产密钥管理。

## 正式切换顺序（需现有人工发布审批）

1. 在网关或产品入口关闭新对话，通知维护窗口；排空或停止既有对话、AI 后台历史保存任务及其他数据库写入者。备份作业也暂停调度。
2. 带内部认证向历史服务 POST `/internal/migration/write-gate`，JSON 为 `{"paused":true}`；GET 检查 `paused=true`、`active_writes=0`、`uncertain_writes=0`、`drained=true`。门控只覆盖 `/api/history` HTTP 写入，不能代替直接数据库写入者的排空。客户端断开会留下不确定写入；应先停止/排空进程并证明数据库静止，不能仅重启清零后宣称完成。
3. 按 [MongoDB 官方 mongorestore 迁移流程](https://www.mongodb.com/docs/atlas/import/mongorestore/) 完成最终备份与恢复到全新 Atlas 业务数据库，完整核对数据，记录实际停写开始、恢复结束及业务恢复时间。
4. 保持维护窗口，将历史与定时备份的 `MONGO_URI` 同步指向新库。历史服务重建后仍以 `MONGO_WRITES_PAUSED=true` 启动。核验 `/ready`，通过真实用户查询历史、统计与音频关联；开放仅供验收的写入，完成一条真实业务历史写入及读取，再恢复公众业务。
5. 验证定时备份成功、恢复到另一独立数据库成功。确保所有应用与备份连接已离开旧 Mongo，再停止旧计算实例；保留卷和加密备份。
6. 观察 72 小时：历史读写、统计、音频关联、备份新鲜度/恢复、连接故障与各服务内存。记录实际变化，验收后再人工删除旧服务。

Docker 部署可在人工批准后使用 `-f <base-compose> -f docker-compose.atlas.yml`；需支持 `!reset` 与 `!override` 的 Compose 2.24.4+。Zeabur 使用服务秘密环境变量，不能把 Compose 渲染结果（包含凭据）当作公开报告。该叠加文件不改变现有容器名，不会自动释放运行中的旧实例。

## 回滚

恢复业务后 Atlas 已有新写入，旧快照不能直接接管。重新关闭入口并排空写入，以 Atlas 最新数据库为源，迁回全新旧集群数据库，完整核对后同步更新历史与备份的 URI。备份恢复也必须先确认恢复点与新写入差异，不得静默丢失切换后数据。

## 已有本地证据与未验收项

- 实际运行 MongoDB 6.0、Database Tools 100.14.0：125 条合成会话（嵌套消息 ID、音频 URL、日期与 BSON Long）及 1 条摘要；集合摘要和索引均相同。离线解密恢复后再次全量比较通过。
- 第二次合成演练：dump 127ms、restore 142ms、总计 282ms，加密归档 2606 字节。这是同机小数据集，**不能用作生产停写时长或 Atlas 延迟**。
- CLI 11 个测试；历史服务门控/就绪测试；备份密钥参数与故障测试。实际结果见本地 `quality/artifacts/latest/atlas-native-rehearsal.json` 和统一验证日志。
- 已取得生产只读基线，并验证 Zeabur 到 Atlas 的连接、当前完整数据与索引恢复、加密备份恢复及限定数据库的应用账号，结果见下文。待验收：最终停写与切换、定时备份端到端 COS 恢复、真机音频回归、72 小时观察及旧连接清理。上述全部满足前不得删除旧实例。

2026-10-08 首次 Atlas 检查：SRV 成功解析 3 个节点，但 TLS 握手出现 `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`，当时没有成功认证或写入。Zeabur 实测出口为 `8.213.199.227`；用户随后放行白名单，下述连接与恢复演练已成功，此项不再阻断。秘密仅在进程内存或受保护的临时配置中使用。

### 生产只读基线（2026-10-08）

| 项目 | 实测值 |
| --- | --- |
| 数据库版本 | MongoDB 8.2.9 / FCV 8.2；目标 Atlas 8.0.34；下述演练已验证当前完整数据与索引 |
| 业务库 | `oral_app_history`，1 个 `conversations` 集合 |
| 文档与数据量 | 108 条；dataSize 670311 字节；storageSize 503808 字节；indexSize 151552 字节 |
| 索引 | `_id_`、`userId_1`、唯一 `sessionId_1`、复合 `userId_1_goalId_1` |
| 内存 | 最近 2 小时 CLI 平均 136.272404MB、最高 211.113281MB；现场 Mongo resident 140MB |
| 历史服务部署 | `6abb84d2498d5ec175a08fc1`，commit `4765da65f8761eee5fc7b9596522ffb85003c7b4`，RUNNING |

完整服务清单取得 17 个服务，其中 15 个得到内存摘要；两个 Umami 服务的指标接口未返回可用结果。以上不是整机内存总量，也不能据此估计删除 Mongo 后的内存百分比。已在 Mongo 容器内只读计算 108 条会话的严格 EJSON 全量摘要；未停写，因此只能作为当时基线，不能替代迁移冻结快照。连接串从 CLI 在内存中读取，未持久化。

### 白名单放行后的真实 Atlas 演练

用户配置白名单后，Zeabur 到 Atlas 成功认证：连接约 1297ms；五次 ping 分别为 106/101/101/101/101ms。该演练账号角色为 `atlasAdmin`，只用于本轮受控演练；正式应用使用下文已验证的专用账号。

在源 Mongo 容器中，通过 `$out` 建立唯一命名的独立静态副本，保留原始 BSON 类型与文档 ID，并复制集合选项和全部索引。使用现有 Database Tools 100.17.0 dump，加密后恢复到 Atlas 的全新测试数据库；同一加密备份又恢复到另一全新测试数据库。源业务库没有停写或切换；静态副本无其他写入者。

| 验收项 | 实测结果 |
| --- | --- |
| 静态副本 | 108 条历史，4 个索引；建立副本约 334ms |
| dump 与加密 | 122ms；加密归档 182980 字节 |
| Atlas 首次恢复 | 3644ms；全量文档、索引、集合选项摘要一致 |
| 加密备份恢复 | 3503ms；完整比较一致，sessionId + userId 查询命中真实恢复记录 |
| 临时数据清理 | 源静态副本、两个 Atlas 测试库、临时连接配置与运输密钥均清理成功 |

加密归档权限 0600，保存在 Git 仓库外的 `.local/share/oral_app/atlas-rehearsals/`；密钥环境文件权限 0600，分开保存在 `.config/oral_app/atlas-backup-keys/`。具体路径、归档命名空间、原始版本与摘要见本地 `quality/artifacts/latest/atlas-real-rehearsal.json`。秘密经临时 RSA/AES 信道传入受控进程，明文 URI/密钥未进入命令参数、代码或日志。

本次完整静态副本与前述源基线的 SHA-256 相同，验证了当前数据的恢复兼容性；不能据此保证所有 MongoDB 8.2 特性都兼容 8.0。官方 [mongorestore 版本条件](https://www.mongodb.com/docs/database-tools/mongorestore/) 要求核对源/目标主版本或 FCV；正式切换前须重新读取集合类型、选项、版本与索引，阻断不支持的特性。

首次恢复约 3.6 秒**不是正式停写时长**：排空、冻结后重新备份、完整校验、应用 URI 更新/重启、真实业务读写和恢复公众入口都尚未计入。切换维护窗口须据最终流程单独确认。

### 现有历史服务对 Atlas 的 API 验证

在 Zeabur 历史服务容器中另起仅监听 loopback 随机端口的短时进程，加载实际部署的历史路由与模型，连接全新 Atlas 测试库；运行中服务的环境变量及数据库连接未改变。仅写入两条合成消息，包含稳定 ID、音频 URL、目标、任务与轮次关联。

写入、session messages、session detail、user history、stats 均返回 200；重复写入不增加消息数量，全部关联字段往返一致；统计为 1 个会话、2 分钟、1 个学习日；跨用户读取返回 403。可选统计扩展禁止访问生产其他服务。测试库与临时运输密钥清理成功，脱敏结果见 `quality/artifacts/latest/atlas-history-api-probe.json`。

这证明现有部署的历史 API 可对 Atlas 读写，不代表候选代码已发布，也不代替正式业务切换后的验收。

### 正式应用账号验证

用户提供 `oral_history_app` 专用连接后，已从 Zeabur 历史容器验证认证身份及完整角色列表：唯一角色为 `readWrite@oral_app_history`。连接 1425ms，ping 98ms；在业务库中唯一命名的合成测试集合完成写入、读取、删除及集合清理，既有业务文档未修改。脱敏结果见 `quality/artifacts/latest/atlas-app-account-probe.json`。

用户原凭据文件第 12 行为独立 URI，尚不符合 dotenv 的 `MONGO_URI=...` 格式，并未包含数据库路径。保留该文件不变，在仓库外生成 `/Users/sgcc-work/.config/oral_app/atlas-app.env`（0600），仅包含规范化的 `MONGO_URI`，显式选择 `oral_app_history`。此文件未注入生产服务；正式切换时通过受保护环境将同一值提供给历史与备份服务，禁止打印其内容。

账号前置条件已满足；下一步按上文人工审批、最终停写、冻结备份与完整核对的顺序执行正式切换。不得用独立库演练结果代替冻结生产快照。

用户原工作区的凭据文件当前已暂存但未提交；本候选补充 `.gitignore` 防止以后误加入，**不会撤销用户当前暂存操作**。当前已暂存文件仍须在原工作区提交前移出索引，ignore 对已经暂存的文件不生效。秘密扫描通过的是隔离候选工作树，不表示原工作区凭据安全可提交。
