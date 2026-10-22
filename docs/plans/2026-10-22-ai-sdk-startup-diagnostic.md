# AI service 启动失败诊断与待批准修复方案

状态：根因已确认；2026-10-22 用户明确批准实施并准备 PR；代码修复、统一验证和本地镜像验证完成；PR #93 为 draft，独立审查与生产发布尚未完成。

## 生产证据

- 服务：`ai-omni-service`，ID `6a361c55b2350c13adc3f327`。
- 环境：production，ID `6a0d7fd4f3b70f2a79fbd8fd`。
- 失败部署：`6ad9902f24d8f4b41eb88bf7`，提交 `b039b666a254194bd7b4efea2a1fd48c359ec027`，Zeabur 状态 `CRASHED`。
- 2026-10-22 12:25–12:27（北京时间）的构建日志确认安装 `dashscope-2.0.1`，并输出 `deps import OK`。
- 12:31:05 的启动日志确认调用链：`app/main.py:26` → `dashscope/__init__.py:72` → `dashscope/v2/__init__.py:10` → `dashscope/v2/_config.py:41–43`。先导入 `tomllib` 失败，再导入 `tomli` 失败，随后 Pod BackOff。
- 前一次部署 `6ad724ad7d48a89b2ad3e2c4`，提交 `c027309e0283aac8595649379037a0f249fc8945`，2026-10-20 的构建日志确认安装 `dashscope-1.27.8`。
- 本次外部探测：`/api/ai/health` 返回 502；`/api/users/health` 返回 200。

## Git 与依赖结论

近期提交没有新增或修改 `tomli`。失败部署对应的 PR #92 仅删除 `.replit` 中的空声明并增加归档文档，没有修改 AI 服务依赖。

`services/ai-omni-service/requirements.txt:3` 自提交 `3aad261`（2026-09-28）起为 `dashscope>=1.26.5`，允许安装新的大版本。本次重建实际从 1.27.8 漂移到 2.0.1。

生产 Dockerfile 使用 Python 3.10；该版本没有标准库 `tomllib`。检查 PyPI 2.0.1 wheel 源码和元数据，确认新 SDK 的 v2 配置模块在导入时需要 TOML 解析器，但 `tomli` 仅列于可选 CLI extra，基础安装未安装它。现有镜像构建检查只导入 redis、fastapi、uvicorn、httpx、websockets，没有检查 DashScope，因此未发现启动失败。

这解释了同一份应用代码重建后失败：新镜像重新解析未锁定的依赖，获得了与旧镜像不同的 SDK。应用进程在监听 8082 前退出，comms 的 ECONNREFUSED 和网关 502 都是后续表现。

## 已批准实施方案

批准证据：2026-10-22 用户对本方案回复“批准实施并准备 PR”；生产发布另行审批。

1. 将 `services/ai-omni-service/requirements.txt` 的 SDK 固定为生产前次使用的 `dashscope==1.27.8`，恢复既有版本；本次不引入 SDK 2.x 迁移。
2. 在 `services/ai-omni-service/Dockerfile` 的安装后检查中导入 `dashscope` 以及主程序实际使用的 `OmniRealtimeCallback`、`OmniRealtimeConversation`、`MultiModality`、`AudioFormat`。安装成功但 SDK 无法导入时，使构建直接失败。
3. 用 Python 3.10、真实安装的依赖运行导入检查、`pip check`、AI 服务相关测试和容器健康检查。测试不可用 stub 代替 SDK 导入。
4. requirements/Dockerfile 变化按仓库规则执行无缓存构建；提交 PR 等待人工审核。生产发布另需人工批准。

锁回先前生产 SDK 是此次恢复方案。继续使用 2.0.1 的另一方案需要补充 `tomli`（Python <3.11）并单独完成大版本兼容验证，不与本次恢复混为一谈。

## 已执行的本地验证

- `python3 scripts/sdlc.py validate`：退出 0。
- `git diff --check`：退出 0。
- `gitleaks git --staged --verbose --config .gitleaks.toml`：退出 0，无泄漏。
- `npm run verify`：退出 0，`decision=pass`，分数 100。AI 服务 401 passed / 11 skipped；workflow 211 passed；场景 mock 25 passed；客户端 648 passed，客户端构建成功，其余统一验证项通过。
- 上述统一验证使用本地 `.venv` Python 3.9；部分 AI 测试使用 SDK stub，不能作为 Python 3.10 真实 SDK 安装或启动成功的证明。
- 已从 Git 跟踪文件创建隔离构建上下文并覆盖本次修改的两个文件。`docker build --no-cache -t oral-ai-sdk-startup:1.27.8 <context>` 退出 0，镜像 ID `526e640b9644`，真实 SDK 导入检查通过。首次命令使用此主机不支持的 `--progress=plain` 参数，退出 125；去除参数后才正式开始构建。
- 新镜像的隔离容器（无外网、占位 API key）确认 Python 3.10.19、DashScope 1.27.8，`pip check` 退出 0，主程序真实 SDK 导入成功，启动后监听 8082，`GET /health` 返回 200、`{"status":"ok"}`；测试后正常停止主进程。
- 反例验证：将实际下载的 2.0.1 wheel 放入隔离容器的 `PYTHONPATH`，原构建检查仍成功，新检查因 `dashscope/v2/_config.py` 缺失 `tomli` 失败；断言故障路径与生产一致后，实验退出 0。首次使用 `/tmp` bind mount 时 Docker daemon 无法访问宿主路径，退出 125；随后通过标准输入传入 wheel 完成验证。
- 原先从空 Python 3.10 容器完整安装 2.x requirements 的实验被上述离线反例取代，已停止，不将其未完成的安装计作成功或失败。没有验证 2.x 补齐 tomli 后的业务兼容性。

PR 在镜像验证和独立审查完成前保持 draft。尚无独立审查或生产恢复成功的声明。

PR：https://github.com/happepls/oral_app/pull/93 。GitHub 托管 CI 在运行，最终结果以 PR 当前检查为准。

## 发布后验收与回退

生产恢复尚未证明。发布后须核对精确部署提交、实际 SDK 版本、启动日志、Pod 重启情况、`/api/ai/health`、授权后的每日问答请求以及真实业务 WebSocket。仅以构建成功或容器 RUNNING 不足以完成验收。

若新部署失败，回退到已验证的旧镜像；仅回退 Git 提交而重新安装未锁定依赖，仍可能安装相同故障版本。

本诊断不覆盖根目录已有 SDLC 工件，不声称它们的发布或维护阶段完成。
