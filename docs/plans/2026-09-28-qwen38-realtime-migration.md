# Qwen3.8 Realtime 主服务迁移

## 需求与范围

用户于 2026-09-28 明确要求将暂停服务的 `qwen3.5-omni-flash-realtime`
切换为 `qwen3.8-omni-flash-realtime`，并负责 Zeabur 面板变量修改。
本次按该请求实施模型配置和必要 SDK 升级；生产合并、发布仍由人工执行。
根目录六个 SDLC 工件属于既有 bootstrap，未覆盖或冒用其审批、发布记录。

调用链：`main.py` 的业务 WebSocket → `connect_dashscope` →
`OmniRealtimeConversation`；快速体验入口将同一环境变量及默认模型传给
`run_quick_experience`。两入口、诊断脚本和 Compose 均使用 3.8 默认模型。
保留 `QWEN3_OMNI_MODEL` 环境覆盖；Zeabur 显式旧值必须单独修改。

SDK 最低版本从 1.20.0 提升至 1.26.5，依据
[阿里云 Realtime 文档](https://help.aliyun.com/en/model-studio/realtime)。
保留现有凭证路由：专属 MaaS WebSocket 使用 `DASHSCOPE_API_KEY`；
公共文本、图片服务使用各自配置，不随本次模型迁移变更。

## 实际验证（2026-09-28）

- `python3 scripts/sdlc.py validate`：exit 0，既有工件有效。
- `.venv/bin/python -m pip install 'dashscope==1.26.5'`：exit 0，验证最低受支持 SDK。
- `.venv/bin/python -m pytest services/ai-omni-service/tests -q`：exit 0，312 passed。
- `.venv/bin/python test_scenario_batch_and_daily_qa.py --scenario all --mock`：
  exit 0，25 passed，0 failed，0 skipped。
- `npm run verify`：exit 0；完整仓库验证证据在忽略目录 `quality/artifacts/latest/`。
- `git diff --check`：exit 0。
- `gitleaks git --staged --verbose --config .gitleaks.toml`：exit 0。
- `docker compose build --no-cache ai-omni-service`：exit 1；本地 Colima Docker
  daemon 未运行，不能据此宣称镜像构建成功。

真实 API smoke 使用本地已有业务空间配置和 SDK 1.26.5，指定模型为
`qwen3.8-omni-flash-realtime`，逐个建立 Tina、Serena、Evan、Arda 会话。
会话参数与主服务一致：TEXT + AUDIO、输入转录启用、
`qwen3-asr-flash-realtime`、手动轮次模式；仅要求回复合成的短问候。
四次均收到 `session.created`、`session.updated`、非空音频与文本、
`response.done` 的 `completed` 状态，无 error。音频 chunk 数分别为 3、4、4、4。
未记录凭证、会话 ID、用户对话或音频。此检查证明上游模型/音色/会话参数兼容，
不等同于 Zeabur 部署或浏览器录音端到端验收。

独立只读审查覆盖本次七个文件及 `REVIEW.md` 中相关风险，无 actionable
findings、未解决 high/critical 为 0；审查者另行通过 29 项配置、路由及快速体验
测试、SDLC validate 和 diff 检查。未把用户原有 `docs/developer-api.md` 改动纳入。

## Zeabur 交接与验收

在 **ai-omni-service** 面板设置：

```dotenv
QWEN3_OMNI_MODEL=qwen3.8-omni-flash-realtime
DASHSCOPE_WS_URL=wss://ws-apadg96g31j9nnwh.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/realtime
```

`DASHSCOPE_API_KEY` 必须属于该新加坡业务空间；仅在 Secret 面板确认或更新，
不得发送或提交密钥。URL 不追加 `?model=`。现有四种音色实测通过，
不需要为匹配用户示例将导师统一改成 Ethan。

- [x] 用户于 2026-09-28 回复“已修改，等待代码发布”，确认上述面板配置。
- [ ] 人工审核合并 PR，Zeabur 重建依赖并部署对应提交；确认 SDK ≥ 1.26.5。
- [ ] 关闭旧会话后重新进入真人场景：录音、转录、文本和音频回复正常。
- [ ] 快速体验入口同样返回文本和音频；确认无鉴权、模型或音色错误。
- [ ] 记录 Zeabur 部署版本及验收结果，届时才可标记生产迁移完成。

回退：如 SDK 升级引入回归，回退本次代码提交并调查兼容问题；
3.5 已由用户报告暂停服务，不能将恢复旧模型配置视作可用的业务回滚。
只使用已确认可用的模型与匹配业务空间组合。
