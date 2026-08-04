# 数据库备份与恢复

`services/backup-service` 每天 02:30（Asia/Shanghai）生成 PostgreSQL custom dump 和 MongoDB gzip archive，写入双层 SHA-256 校验后上传到独立私有腾讯 COS。上传显式启用 SSE-COS/AES-256。

必需环境变量：`POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_DB`、`POSTGRES_USER`、`PGPASSWORD`、`MONGO_URI`、`BACKUP_COS_BUCKET`、`BACKUP_COS_REGION`、`COS_SECRET_ID`、`COS_SECRET_KEY`。临时凭证还需 `COS_SESSION_TOKEN`。只授予目标前缀的上传/读取权限；可选变量为 `BACKUP_COS_PREFIX`、`BACKUP_ALERT_WEBHOOK`、`BACKUP_STATUS_FILE`。

保留策略应在 COS Lifecycle 中配置，避免备份容器持有删除权限：

- `backups/oral-app/daily/`：保留 30 天。
- `backups/oral-app/monthly/`：保留 365 天（脚本仅在每月 1 日写入，得到 12 个月度恢复点）。

手动执行：

```bash
docker compose run --rm backup-service /opt/oral-backup/run-with-alert.sh
docker compose run --rm backup-service /opt/oral-backup/health.sh
```

恢复演练只能针对隔离的临时数据库。先设置 `ALLOW_BACKUP_RESTORE=true`、`RESTORE_POSTGRES_URL` 和 `RESTORE_MONGO_URI`，再传入精确 COS 对象：

```bash
docker compose run --rm backup-service \
  /opt/oral-backup/restore.sh \
  cos://example-private-bucket/backups/oral-app/daily/2026-07-24/20260724T023000+0800.tar.gz
```

演练完成标准：外层和包内 checksum 均通过；`pg_restore`、`mongorestore` 无错误；临时库的用户、目标、任务和会话抽样查询一致。禁止把生产连接串作为 `RESTORE_*` 目标。
