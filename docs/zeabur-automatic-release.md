# Zeabur 五个后端自动发布

目前 Zeabur 的 Git 来源服务使用服务端 Dockerfile 覆盖，`FROM` 曾固定在
`12381c9`。GitHub 合并、镜像推送及 Zeabur 面板的 Git SHA 更新，都不会自动
替换这个 FROM。`Zeabur Production Release` 补齐该步骤。

## 一次性启用（仓库维护者）

1. 在 GitHub **Settings → Environments → production** 设置 Required reviewers。
   发布脚本会再次读取审批规则，没有指定审核者就拒绝所有生产写入。
   请限制 deployment branches 为 `master`，并关闭管理员绕过审批。
2. 在同一个 `production` 环境中添加 secret **ZEABUR_DEPLOY_TOKEN**，使用有权
   读取目标项目、更新 Dockerfile、重新部署和执行验证命令的 Zeabur token。
   不要把 token 写进代码或日志；不复用监控用途的 `ZEABUR_TOKEN`。
3. 人工审核并合并此 PR。先在 Actions 的 **Zeabur Production Release → Run
   workflow** 选择 `master`、保留 `dry_run=true`。检查 `release-plan` 工件中
   `ready=true`，提交为当前 master，包含五个 digest 和源码哈希。
4. 完成上述核对后，审核自动准备的 production deployment；没有待审批任务时
   再手动运行 `dry_run=false`。dry-run 使用独立并发组，可在待审批期间执行。
   之后每次 master 合并的四项上游检查全绿，会自动准备下一次发布并等待审批。

这保留每次发布的人工审批，但无需再到 Zeabur 面板逐项修改版本。只加 secret
而没有审批规则时仍会失败关闭。首次启用前不要认为“合并了工作流”等于已发布。

## 自动执行的范围

- 仅接受本仓库 master 的 push 工作流结果；PR 事件只运行发布单元测试。
- 要求同一完整提交的 CI Pipeline、Docker Build and Push、Security Scan、
  SDLC Governance 最新一次 push 运行全部成功，并记录 run ID 和 attempt。
  SDLC Governance 仍遵循仓库原有 shadow/enforce 设置，本流程不改变它。
- 解析 GHCR 短 SHA 标签，校验镜像配置的完整 revision、平台和内容哈希，
  随后固定到不可变 digest。审批后再次检查 master 和所有 gate。
  四个上游完成事件重复触发时，已成功执行 deploy 的同一提交会跳过；手动
  dispatch 可再次验证或修复，成功的 dry-run 不会被误认为已发布。
- 预先核对五个固定服务的项目、名称、原 Dockerfile 和健康状态，只替换其
  唯一 FROM 引用，保留原 Dockerfile 其他内容。该覆盖是服务级配置，目标
  service ID 和 production environment ID 固定在脚本中，禁止复用到其他环境。
- 逐项更新并重新部署 user、developer-api、comms、history-analytics、
  conversation。每项最多等候 240 秒，确认新 deployment ID、RUNNING、
  容器内部健康接口 200，以及 `src/` 下全部 JS/JSON 的路径与字节哈希匹配。
  每项前和最终完成时再次验证候选没有过期。
- 校验设备限制开关与发布前相同。**不会执行数据库迁移、设置环境变量或
  开启 DEVICE_SESSION_LIMIT_ENABLED**。客户端及备份服务继续由其已有的
  Git 来源部署，此工作流不操作它们，也不代表它们已通过发布验收。

## 失败、回滚及证据

任何已触及服务失败时，按相反顺序恢复本次开始前的 Dockerfile 并重新部署，
核对原源码哈希、健康接口和开关值。即使写请求超时也按“可能已写入”处理。
如果配置已被其他操作者改动，停止覆盖并标记 `rollback_requires_operator`。
流水线串行执行；审批后过期的候选会停止，后续候选需重新审核。

Actions 工件 `release-report` 包含提交、镜像引用、Dockerfile 哈希和各服务
`verified` / `already_verified` / `rolled_back` / `rollback_requires_operator`
结果；不保存 Dockerfile 正文、token、接口输出或私有地址。预检查失败的
report 状态为 failed，且没有生产写入。下载报告核对全部服务后才能确认发布。

回滚属于尽力恢复，五个服务不构成原子事务；发布期间可能短暂混合版本。
Runner 丢失、强制取消、平台不可用或超时中断都可能阻止自动回滚。出现此类
情况，先阻止新的审批，查 Zeabur 实际 FROM 和部署状态，依据报告的 old_image
逐项人工恢复并验证。不要仅重跑旧 workflow：它会因 master 已前进而被拒绝。
镜像必须保留，不能在回滚窗口内清理旧 digest。

## 本地验证

```bash
python3 -m unittest discover -s scripts/release -p 'test_*.py' -v
```

测试使用模拟 GitHub/Zeabur/Registry 响应，不改变生产。手动 dry-run 会读取
GitHub 和 GHCR，不需要 Zeabur secret，也不写生产。

GitHub 环境元数据读取只需 Actions read 权限，参见
[官方环境 API 文档](https://docs.github.com/en/rest/deployments/environments#get-an-environment)。
