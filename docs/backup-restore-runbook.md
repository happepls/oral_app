# 数据库备份与恢复

`services/backup-service` 每天 02:30（Asia/Shanghai）生成 PostgreSQL custom dump 和 MongoDB gzip archive，写入双层 SHA-256 校验后上传到独立私有腾讯 COS。上传显式启用 SSE-COS/AES-256。

必需环境变量：`POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_DB`、`POSTGRES_USER`、`PGPASSWORD`、`MONGO_URI`、`BACKUP_COS_BUCKET`、`BACKUP_COS_REGION`、`COS_SECRET_ID`、`COS_SECRET_KEY`。临时凭证还需 `COS_SESSION_TOKEN`。只授予目标前缀的上传/读取权限；可选变量为 `BACKUP_COS_PREFIX`、`BACKUP_ALERT_WEBHOOK`、`BACKUP_STATUS_FILE`。

本地 Compose 默认使用独立私有 bucket `oral-backup-1317719935`，并从已忽略追踪的 `services/media-processing-service/.env` 读取 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` 作为 `COS_SECRET_*` 的兼容别名。生产环境仍应直接注入只允许访问备份 bucket 的独立 `COS_SECRET_*` 凭据。

保留策略应在 COS Lifecycle 中配置，避免备份容器持有删除权限：

- `backups/oral-app/daily/`：保留 30 天。
- `backups/oral-app/monthly/`：保留 365 天（脚本仅在每月 1 日写入，得到 12 个月度恢复点）。

手动执行：

```bash
docker compose run --rm backup-service /opt/oral-backup/run-with-alert.sh
docker compose run --rm backup-service /opt/oral-backup/health.sh
```

恢复演练只能针对隔离的临时数据库。先设置 `ALLOW_BACKUP_RESTORE=true`、`RESTORE_POSTGRES_URL`、不含数据库名的 `RESTORE_MONGO_URI`，以及显式的隔离库名 `RESTORE_MONGO_TARGET_DB`，再传入精确 COS 对象。脚本使用 `--nsFrom oral_app_history.* --nsTo <隔离库>.*` 重映射 MongoDB archive，并拒绝 `oral_app_history`、`admin`、`config`、`local` 等正式/系统库名：

```bash
docker compose run --rm \
  -e ALLOW_BACKUP_RESTORE=true \
  -e RESTORE_POSTGRES_URL=postgresql://user:password@postgres:5432/oral_app_restore_audit \
  -e 'RESTORE_MONGO_URI=mongodb://root:password@mongo:27017/?authSource=admin' \
  -e RESTORE_MONGO_TARGET_DB=oral_app_history_restore_audit \
  backup-service \
  /opt/oral-backup/restore.sh \
  cos://example-private-bucket/backups/oral-app/daily/2026-07-24/20260724T023000+0800.tar.gz
```

演练完成标准：外层和包内 checksum 均通过；`pg_restore`、`mongorestore` 无错误；临时库的用户、目标、任务和会话抽样查询一致。禁止把生产连接串作为 `RESTORE_*` 目标。
