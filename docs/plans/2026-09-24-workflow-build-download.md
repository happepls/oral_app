# workflow-service 构建下载超时

## 生产证据

- PR #63 已由人工合并，提交 `e8d717d14abccddac0b446a313a5344fedf63d0a`。
- Zeabur workflow 部署 `6ab48e4be92e928954ac9a93` 构建失败；2026-09-24
  10:44:17（北京时间）日志末尾为
  `pip._vendor.urllib3.exceptions.ReadTimeoutError: HTTPSConnectionPool(host='mirrors.aliyun.com', port=443): Read timed out.`。
- 超时前正在下载 DashScope 1.27.6 的 2 MB wheel；构建使用 pip 23.0.1。
  这是下载阶段失败，没有进入应用启动；该证据不支持依赖冲突或 Python 导入错误的结论。
- 本次查询时 AI、client、user、comms、gateway 的上述提交均为 RUNNING，
  workflow 的新部署为 FAILED；不能将其他服务部署成功视为 workflow 发布成功。

## 修复范围

延续用户已批准的场景修复及发布故障处理，仅修改 workflow 的依赖安装步骤：

- socket timeout 从 pip 默认 15 秒提高到 120 秒，显式保留连接重试 5 次。
- 旧 pip 在 wheel 流式读取中断后可能直接退出，因此整个安装最多尝试 3 次，间隔 5 秒。
- 最后一次失败必须终止镜像构建；安装成功后运行 `python -m pip check`，其失败也必须传播。
- 不修改 requirements、镜像源、应用业务逻辑或生产环境变量。

参数语义见 [pip 官方选项文档](https://pip.pypa.io/en/stable/cli/pip/#general-options)。
120 秒是 socket 等待时间，不是整个构建的总时限；镜像源持续不可用时仍会失败。
回滚为 revert 本次 Dockerfile 变更；无需数据库迁移。

## 验证与发布

- `npm run verify`：exit 0，score 100。
- 独立只读复审提取实际 RUN 脚本进行故障注入：首/二/三次安装成功、三次全部失败、
  pip check 失败，共 5 个分支通过；无未解决 high/critical 问题。
- 首次本机无缓存构建遇到 Colima DNS 故障，主动终止 exit 130，不计通过。
- `docker compose build --no-cache --build-arg HTTP_PROXY=http://host.docker.internal:7890
  --build-arg HTTPS_PROXY=http://host.docker.internal:7890 workflow-service`：exit 0，
  镜像 `8da3acb4efbd`，pip check 显示 `No broken requirements found`。
  代理参数只用于本地命令，不写入 Dockerfile；本机镜像架构为 arm64，生产日志为 x86_64。
- 新镜像内 fastapi、uvicorn、asyncpg、pydantic、dotenv、httpx、redis、dashscope
  导入 smoke：exit 0，确认 Pydantic 2.6.1。
- 修复须经过新 PR 人工审阅合并；PR #63 的合并不代表本次后续 PR 已获审批。
  根目录旧 SDLC 工件属于另一治理循环，本记录不替换或冒充其审批证据。
- 生产构建成功和真实练习验收尚未完成。
