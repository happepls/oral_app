# 场景重置、断线与进度异常：生产诊断与修复验证

状态：已按用户批准实施；本地全仓与浏览器验证通过，待人工审阅和发布，尚未上线。

实施批准：2026-09-24 当前会话用户明确回复“批准实施”，适用于本文四项修复方案。

用户线索：北京时间 2026-09-24 09:08:29，goal=18、task=371、turns=3，
`[BATCH_EVAL] result: delta=0 mode=None task_completed=False`。
本文不保存账户 UUID、会话 ID、凭据、对话内容或原始日志。

## 结论

1. **本次数据库与阶段重置实际成功。** 重置后的评分失败由 AI 服务读取任务时遗漏
   `scoring_generation` 引起：数据库已经是 1，AI 新会话仍发送 0，所有评分窗口被判为过期。
   这可以解释“重新开始后仍无法正常练习”和进度始终为零，不能解释为重置 SQL 没执行。
2. **本次断线由上游 DashScope 响应流超时触发。** 09:13:26 返回 code=1007、
   `Response stream timeout (timeout_seconds=298, elapsed_ms=550804)`。
   通知已由 comms 转发给浏览器，随后浏览器端连接关闭。未发现这个时间点的服务重部署。
3. **另复现了重连恢复缺口，但尚不能证明它就是本次没有恢复的原因。** 与生产一致的前端
   在正常票据接口下可自动重连；若第一次重连申请票据遇到网络失败，则提前返回，后续不再重试。
   生产日志中断线后没有新的票据请求，既可能请求未到达服务端，也可能页面已关闭/后台暂停。
   现有服务端证据不能区分这些情况，也不能确定提供商为什么触发此次响应流超时。

## 生产证据时间线（Asia/Shanghai）

| 时间 | 实际证据 | 含义 |
| --- | --- | --- |
| 09:04:09.446 | comms 完成第一次会话鉴权 | 重置前会话存在 |
| 09:04:11.323 | PostgreSQL 任务 371–373 同时更新，score=0、interaction_count=0、status=pending、generation=1 | 目标场景的任务重置已持久化 |
| 09:04:11.328 | POST `/api/users/goals/reset-task` 200 | 任务重置响应成功 |
| 09:04:11.786–789 | AI 阶段重置日志、POST `/api/ai/reset-phase` 200 | 阶段重置也成功 |
| 09:04:12.706 | 旧客户端连接关闭 | 与前端重新开始后的刷新相符 |
| 09:04:14.388 | POST `/api/v1/realtime/tickets` 201 | 新连接票据成功 |
| 09:04:15.760 | comms 鉴权成功，会话 ID 与重置前不同（仅在内存比较） | 确实建立了新会话 |
| 09:06:30.850–894 | workflow 处理 task=371、3轮，delta=0；AI 日志明确 discarded stale generation，键后缀 `18:371:0` | 第一个旧代次窗口被拒绝 |
| 09:08:29.023–041 | 同任务再次3轮、delta=0；AI 再次 discarded stale generation，后缀仍为 `18:371:0` | 用户提供的日志已准确关联 |
| 09:13:26.890 | DashScope code=1007、Response stream timeout | 上游主动关闭 |
| 09:13:26.892 | comms `Forwarding connection_closed` | 断线通知已转发 |
| 09:13:27.267–274 | 网关 WS 请求结束，comms 客户端关闭、AI WebSocketDisconnect | 下游连接随即关闭 |

查询时 task=371 仍为 score=0、interaction_count=0、generation=1、pending；
评分表没有 09-24 新完成窗口，查询到的该任务历史窗口属于 generation=0、09-13/14。
查询使用 PostgreSQL readonly transaction，没有重置任务或写入评分。

### 来源与边界

- Zeabur `runtimeLogs` 必须指定当前 deploymentID 才返回本次有效日志；仅 service/environment
  查询返回空数组，不能据此声称没有日志。普通日志每页最多返回100条，本次按时间游标翻页。
- 高级 `searchRuntimeLogs` 返回 PERMISSION_DENIED（要求 Pro/Team）；改用可用普通日志，未升级套餐。
- ai、workflow、user、comms、client、gateway 当前部署记录均为 RUNNING，提交
  `60547784d7c87a00665bef46e24662fad4060b5c`，创建日期为09-21。
- AI `main.py`、`dashscope_config.py`、workflow `main.py`、`batch_evaluation.py`、user
  `user.js`、`userController.js` 的运行文件 SHA256 与本地对应文件逐一一致，避免仅依赖部署标签。
- 生产 client 的 `980.fa4e2d96.chunk.js` 与本地待测 bundle SHA256 相同：
  `7fbf8a632fb3d503ded016b961a4bea05ccdc293e6e2921d90884e7ff6985bff`。
- 生产 client 日志返回范围延伸到09:26:12；09:13:27后没有新的 realtime ticket 请求。
  不把没有服务端请求记录当作已证明的浏览器行为。
- 管理 API 用法依据 [Zeabur 官方 Public API](https://zeabur.com/docs/en-US/developer/public-api)。
  凭据从既有本机 CLI 配置在进程内读取，没有输出或写入文档。

## 真实调用链与缺陷位置

`userAPI.resetTask` → user-service `resetTask` 原子归零并提升代次 → AI `/reset-phase`
→ 前端重新建立会话 → AI `get_user_context` → `_evaluate_scene_turn_progress`
→ workflow `evaluate_window` → `_stale_result` → AI 丢弃旧窗口。

- `services/user-service/src/models/user.js` 已将数据库 generation 返回给 AI。
- `services/ai-omni-service/app/main.py:get_user_context` 有两个手动构造 current_task 的分支
  （场景匹配、全局 fallback），都没有复制 `scoring_generation`。
- 后续评分和 session_restored 使用 `int(current_task.get('scoring_generation') or 0)`，
  导致每次重连也继续使用0；仅刷新页面不能修复。
- workflow 正确拒绝与数据库代次不一致的结果；不应移除这道保护或强制增加分数。
- workflow 日志读取 `teaching_mode`，而当前批量评分结果没有这个字段，所以 `mode=None`
  不代表请求的学习模式为空。现有日志缺少 `evaluation_status`，把正常零分与 stale/pending 混在一起。
- `client/src/pages/Conversation.js:connectWebSocket` 在票据申请异常时仅设置错误并 return。
  原 socket 此前已销毁，新的 socket 尚未创建，所以不会再产生 close 事件去调度第二次重连。
  这与配置的最多5次重试不一致。
- `client/src/services/api.js:resetTask` 对第二步 `/reset-phase` 不检查 HTTP 状态，且吞掉异常；
  属于已确认的部分失败处理缺口。本次该接口是200，不能将这个缺口冒充此次根因。

## 本地实际复现（未修改应用代码）

1. 使用已有 `_omni_stubs.load_main()` 加载真实 get_user_context，mock 合法的 profile、goal、task
   响应，传入 generation=1；分别执行场景匹配与全局 fallback。
   两条路径输出均为 `mapped_generation=null`、`effective_scoring_generation=0`，断言复现成功。
   命令为 `PYTHONPATH=services/ai-omni-service/tests .venv/bin/python -`（内联诊断脚本），exit 0。
2. `node /tmp/oral_scene_browser_diag.cjs`，exit 0：用本地 HTTP 提供与生产一致的 build，
   真正 Chrome 加载应用；全部 REST/WS 为合成夹具，拦截外部请求。注入同样 code1007 超时通知后，
   前端以4002关闭旧连接，自动重连1/5；ticket请求2次、socket从1个变2个、新socket OPEN。
3. `DIAG_FAIL_RECONNECT_TICKET=1 node /tmp/oral_scene_browser_diag.cjs`，exit 0：相同流程，
   仅使第二次票据请求网络失败；等待8秒仍只有2次票据请求、1个已关闭socket，没有后续重试。
   此脚本用输出揭示缺陷，exit 0只表示诊断完成，不表示功能通过。
4. `python3 scripts/sdlc.py validate`，exit 0：旧根工件格式有效；不代表当前需求已审批。

首次浏览器运行因缺少 Playwright 自带 Chromium 未启动，exit 1；随后改用已安装的 Chrome
完成上述两次诊断，没有把首次失败记为通过。浏览器未登录生产、未录音、未调用真实模型或评分。

## 已批准的修复方案

1. **保留评分代次。** 两条上下文映射均传递 generation；覆盖“重置→新会话→三轮评分”及
   fallback 回归。对另一会话仍持有旧上下文的情形，识别 stale 并刷新权威任务上下文，
   不将旧窗口改成新代次重新评分，继续拒绝迟到结果。
2. **明确重置结果。** 校验阶段重置响应，区分数据库未重置与“进度已归零、会话阶段恢复失败”，
   避免显示已保留进度或虚假成功；成功后只保留新的任务代次和新会话状态。覆盖重复点击、
   第二步失败、旧窗口迟到和正常重置后的进度显示。
3. **补齐断线恢复。** 将票据请求网络错误/可重试服务错误纳入有上限的退避重试；认证拒绝、
   主动离开、手动重试、旧连接回调不能触发无限重连。测试真实 close 事件和票据先失败后恢复，
   验证新连接恢复进度、麦克风状态和任务，不仅断言 socket OPEN。
4. **补足可诊断日志与验收。** 批量评分记录 task、evaluation_status、请求/当前generation、
   delta；连接记录安全错误码和重试阶段，禁止记录凭据和对话。运行 ai/workflow/client 定向回归、
   前端构建、仓库verify与独立审查，整理PR；人工合并/发布后检查实际版本和真实重置后评分窗口。

不修改评分门槛，不为任务371补分，不删除用户历史，不在生产主动重置或重启来代替修复。
预计实施与本地验证20–35分钟；生产验收时间取决于人工发布与真实练习。
没有数据库迁移；回滚为恢复本次变更前的应用版本，保留任务代次与已存评分数据。

## 流程状态

本轮用户要求先观察生产日志并分析根因，并在审阅结论后明确批准上述具体实施方案。
根六工件仍属于 `ai-native-sdlc-bootstrap`，没有覆盖或虚构旧循环完成。
GitHub查询当前无open PR；实施分支从origin/master建立为fix/scene-reset-reconnect，原用户改动
`docs/TODO.md`和09-14未跟踪观测文档保持不变。
需求追踪：[Issue #62](https://github.com/happepls/oral_app/issues/62)。计划执行已获本轮用户批准，
PR合并和发布遵守AGENTS及oral-app-sdlc的人审门槛；本地修复不等于生产已恢复。

## 实施结果

- AI两条上下文映射保留任务代次。旧会话遇到stale结果仅发送一次重连通知并停止继续评分，
  新连接加载权威代次；不重新利用旧窗口、不改变评分门槛。
- 阶段重置身份来自经过验证的Cookie/Bearer profile；兼容旧客户端显式user_id并拒绝身份不符。
  不再依赖localStorage用户信息。部分失败保留已提交的任务代次，重试只执行阶段恢复。
- 重置立即使旧连接回调失效、取消录音及音频播放，UI归零；重复点击只提交一次。
  成功后移除历史URL中的会话参数，由正常初始化创建服务端新会话。
- 网络及429/5xx票据错误参与统一退避，最多5次；401/403停止自动重试。
  连接持续ready 30秒才恢复预算，避免上游反复刚连上就断开时无限重试；离页和手动重试清理计时器。
- 批量评分日志包含task、status、请求/当前代次、delta及完成标记。
  模型执行期间重置的事务保护同样返回实际当前代次。

## 实际验证结果

以下测试使用本地合成数据，不调用真实模型，不录制真实音频，不修改生产任务。

| 命令 | 退出码 | 实际结果 |
| --- | --- | --- |
| `npm run verify` | 0 | 最终score=100，findings=[]；覆盖根lint、契约、Node服务、Python、前端lint/test/build |
| verifier内client测试 | 0 | 50 suites、572 tests通过 |
| verifier内AI完整pytest | 0 | 最终250通过（含路由注解解析回归） |
| verifier内workflow完整pytest | 0 | 126通过（含模型执行期间重置回归） |
| verifier内`test_scenario_batch_and_daily_qa.py --scenario all --mock` | 0 | 25通过 |
| `docker compose build ai-omni-service workflow-service` | 0 | 最终Python源码重新构建成功，仅本地构建；没有启动或发布生产容器 |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3187 npm run verify:ui -- -- --config=/tmp/oral-scene-playwright.config.cjs e2e/scene-recovery.spec.js e2e/task-progress-guidance.spec.js --workers=2 --global-timeout=150000` | 0 | Chrome手机390px与桌面1440px共23通过、1明确skip、0 flaky、0 errors；110秒 |
| `python3 scripts/sdlc.py validate`、`python3 scripts/sdlc.py precommit` | 0 | 当前既有治理规则检查通过；不代表旧工件可充当本次发布审批 |
| `git diff --cached --check`、`gitleaks git --staged --verbose --config .gitleaks.toml` | 0 | 无空白错误、暂存变更无密钥泄漏 |

构建保留既有Browserslist/前端lint告警；没有将告警描述成零告警。
user-service套件162通过、3个原有数据库集成测试skip；不声称进行了真实数据库集成验收。
首次全仓verify因新增标记判断与测试MagicMock真值行为冲突而失败；改为显式`is True`后，
AI全量及整个verify重新执行通过。首次浏览器回归两项定位错误，修正为实际麦克风按钮名称后通过。
一次跨project浏览器运行手机10通过、桌面10未执行，最终因工具teardown超时exit1；
单独桌面12个用例通过后也因同类teardown超时exit1，均不算整条命令通过。
一次根npm转发参数缺少分隔符意外选中全部视口，主动中断exit130，不计为通过。

本机Chrome后台crash reporter/updater在测试浏览器退出后仍持有Playwright stderr管道，
已用`lsof`确认；没有关闭用户浏览器或后台更新服务。尝试安装Playwright自带Chromium因下载TLS连接重置失败exit1。
最终临时配置继承仓库配置，仅筛选手机与桌面项目、设置独立结果目录，并将可执行程序改为本机包装脚本：
`exec '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' "$@" 2>"/tmp/oral-scene-chrome-$$.log"`。
此方式只隔离浏览器stderr，保留实际Chrome、全部断言与退出码；配置及包装脚本不改仓库或应用。
最终报告`quality/artifacts/scene-recovery-results.json`确认23 passed、1 skipped、unexpected=0、errors=[]。
唯一skip是录音中重置的窄屏用例：该按钮产品设计仅桌面显示，桌面已执行通过。

## 首轮CI反馈与修正

[PR #63](https://github.com/happepls/oral_app/pull/63)首轮Python步骤exit2。
用户提供错误为`PydanticUndefinedAnnotation: name 'Optional' is not defined`；
这是新增`Optional[str]`遗漏导入，并非runner故障。本地AI镜像Pydantic 2.13.4没有在导入时暴露它，
按CI合并依赖的Pydantic 2.6.1及Python 3.10配置后复现收集失败。
补充`from typing import Optional`，新增`get_type_hints(reset_phase)`回归防止测试stub/较新依赖掩盖错误。
同一配置修复后246个运行测试通过；镜像内不运行4个依赖仓库目录布局的既有静态测试，
它们由本地完整250项套件覆盖。重新执行全仓verify、AI镜像构建均exit0。

对CI使用的CRA开发服务器补测时，两个重连用例错误地把HMR热更新WebSocket算入连接数。
已将断言限制为`/realtime`对话连接，保留“仅一个活动对话连接”和后续进度/麦克风恢复断言。
生产bundle不包含HMR，因此原先生产bundle验证未暴露这个测试范围错误。

治理日志也已核对：[SDLC run](https://github.com/happepls/oral_app/actions/runs/35945282992)
外层绿色来自shadow模式；旧release证据的base/head和auth/scoring/ui分类不匹配本次diff，
不能把外层绿色视为当前发布审批。PR保留draft，不覆盖旧根工件。

## 独立复审

- Scope: AI任务上下文、重置授权和阶段补偿、前端重连/重置/音频、workflow日志与回归测试。
- Diff: `origin/master` (`60547784d7c87a00665bef46e24662fad4060b5c`) 到本次工作区修复；未纳入用户原有改动。
- Commands: 独立AI定向pytest 31通过；独立workflow `test_batch_evaluation.py` 28通过；范围内diff检查通过。
- Risk areas: auth, scoring, websocket, audio, data, ui, deployment。
- Findings: 2项medium（反复ready清重试预算、重置未停止麦克风）及1项low（事务内stale缺少当前代次）
  均修复并补回归。录音中重置仅桌面可见，新增用例明确在窄屏skip。
- Unresolved high/critical: 0。
- Recommendation: 代码复审无剩余功能阻断；生产发布和真实练习验收仍需人工推进。

## 发布后待验收（尚未执行）

1. 人工合并并发布后读取client、ai-omni、workflow实际版本，核对本次合并提交；检查健康状态。
2. 由用户执行一次重新练习；确认新任务代次进入新会话，完成3–4个完整问答轮次。
   只按实际质量接受delta 0–3，不把零分直接视为失败；验证status不是stale、UI与数据库一致。
3. 持续观察上游超时与恢复。生产若再现断线，核对有界ticket重试和恢复后的任务/麦克风状态。
4. 不主动对用户任务补分或修改数据库；无迁移。回滚应用代码即可，但会重新暴露旧版本代次遗漏问题。
