# Scene Theater 同轮点评：已实现，本地真实模型验收阻断

> UI 最新要求为取消所有建议卡/澄清卡，改由导师回复呈现；见
> [最终 UI 验证](2026-09-29-scene-tutor-only-ui.md)。本文保留原实验时的协议与界面记录。

日期：2026-09-29。用户指定场景：**自我介绍与职业背景说明**。
用户最新指示为先完成实现及本地验证；本次没有生产发布、合并或修改已有进度。

## 当前结论

实现已完成至可本地测试的草稿状态。离线回归、构建和浏览器测试通过，
但完整 workflow → Realtime 联测未达到九次全通过的门槛，**不可启用或发布**。
本地试验结束已关闭 `SCENE_CURRENT_TURN_TEACHING_ENABLED`；仓库默认也为 false。
原计划要求失败后暂停主链路推进，本次停在验收关口，草稿 PR 不表示可合并。

根目录六个 SDLC 工件属于既有活跃循环，本次未覆盖；本文件记录独立实验与验证。
原工作区已有改动保留，开发位于独立 worktree。

## 实验与反例

原始合成数据的可审查副本：[实验 JSON](../experiments/scene-current-turn-2026-09-29.json)。
不含用户历史、凭证或真实会话内容。之前的失败实验也保留，未挑选成功样本。

| 实验 | 结果 | 判断 |
| --- | --- | --- |
| 原始本轮判定指令，9 次 | 分支 9/9，必要动作 6/9 | 不通过；见 9 月 28 日记录 |
| 基础教学提示 + 固定稿，9 次 | 8/9 精确，有一条澄清转中文 | 不通过 |
| 独立 speech-renderer 指令，第一次 9 次 | 7 次精确，2 次连接超时 | 保留网络失败 |
| 同一独立指令，完整重跑 9 次 | 9/9 完成且逐字一致 | 仅固定、已审核稿的口播门槛通过，随后实现 |
| 本地真实 workflow 生成稿 → Realtime，第一组 9 次 | 3/9 机械检查通过 | 纠错 3 次无有效结果；advance 3 次约 6 秒失败；澄清漏金额或追问额外背景 |
| 缩短输出并收紧约束后的第二组 9 次 | 3/9 机械检查通过；完整验收 0/9 | 见下表，停止启用 |

机械检查只检验分支标签、传输与逐字口播，**不检验事实或教学判断正确性**。
脚本的 `semantic_pass=null` 明确表示未自动做语义判断，不能当作通过。

第二组逐条复核：

| 输入 / 次数 | 失败原因 |
| --- | --- |
| correct 1、2 | workflow 返回 data:null，无可用反馈 |
| correct 3 | correction_explanation 使用中文，另附中文 explanation_l1，超过允许的一句母语解释 |
| clarify 1 | 漏问预算金额，并自行给出单位示例 |
| clarify 2 | 把不确定预算引向「500万円」，用户未提供「万円」 |
| clarify 3 | Realtime 连接 TimeoutError；评测问题本身也没有明确确认预算金额 |
| advance 1 | 把正确的「予約システム」判成错误，要求改成「予約管理システム」并重说 |
| advance 2 | 对正确自然输入选择 polish，另有 Realtime 连接 TimeoutError |
| advance 3 | 再次把正确的「予約システム」判成错误 |

额外 3 次合成诊断中，一次校验拒绝的具体原因是日语示范省略「私」，触发第一人称校验；
另两次 schema 通过，其中一次追加字段语言表。这不是九次验收，不作为放行证据。
未放松 schema 去掩盖失败，也未改用 3.5、换 ASR 或修改评分映射。

## 已实现调用链与协议

- Scene Theater 开关开启时：录音提交 → 最多 5 秒等 ASR → 最多 7 秒评测
  → 从结构化反馈组装稿 → Realtime 生成 → 校验完整文本后发反馈卡及音频。
  评测服务内部请求 6 秒上限，AI 侧 7 秒覆盖 Redis 去重及请求；语音生成另设 20 秒上限。
- 冻结 user / goal / task / generation / scenario / input / connection epoch。
  重置、换任务、断线、新输入使未完成结果失效。旧响应占位保留，迟到回执不能绑定下一轮；
  提交缺少回执或被拒绝时放弃整个连接代次，重新建立连接。
- 新接口：`POST /internal/scene-current-turn-feedback`，内部认证，返回 protocol_version=2。
  原接口和默认关闭路径继续可用。新增 clarify；不确定时示范为空、先确认文本。
- WS 增加 `teaching_state`：transcribing / analyzing / rendering / ready / retry。
  v2 teaching_state、user_transcript、expression_feedback、ai_message 绑定
  input_id、turn_id、goal_id、task_id、scoring_generation、scenario。
  前端同时校验本地输入 ID 和权威任务代次。
- 新版不读取上一轮 pending_directive。反馈卡与口播来自同一冻结结果。
  初学者或重复相同错误允许一条母语说明；目前真实模型仍能在其他字段夹带母语，这是阻断项。
- 澄清、评测失败、口播不匹配不进入评分窗口；编辑文本或再次录音作为新话轮。
  已校验且释放的完整回复绑定其原用户输入评分，后续输入不会取消已完成轮次的评分。
  评分提示明确学生能力、数字和业绩只能来自学生输入，不得采用 AI 示范。
  现有 3–4 轮窗口、delta 映射、score>=9 完成、锁和代次保持不变。
- 九语言等待/澄清文案；澄清卡可编辑 ASR 文本后发送。正常纠错说明与示范 chips 保留。

音色仍为现有 Realtime 音色，前端仍接收 PCM 分块。为防止错误音频先播出，
当前实现会缓存完整模型回复，逐字校验后才释放分块；这会改变首音频时机，
**不是边生成边立即播放**。不得将其宣传为保留原首包延迟。
完整稿校验只能防止口播偏离稿件，不能证明稿件事实正确。

## 自动化与本地容器验证

修改前基线：AI 312 passed，workflow 138 passed。
最终 `QUALITY_PYTHON=<原工作区>/.venv/bin/python npm run verify` 返回 pass / 100。
该仓库分数不覆盖真实模型语义验收，不能据此放行功能。

| 检查 | 实际结果 |
| --- | --- |
| AI 服务 pytest | 337 passed；12 条既有弃用警告 |
| workflow pytest | 186 passed |
| 前端 Jest | 53 suites / 599 passed |
| 前端及根 lint、前端 build | 通过；前端 lint 有 168 条警告、0 error |
| 场景 mock、其他服务测试、契约与密钥扫描 | 全部包含于 verifier，通过 |
| `python3 scripts/sdlc.py validate` | clean |
| `git diff --check` | 通过 |
| Playwright expression-feedback | chromium-390、chromium-desktop：2 passed |

新增离线测试覆盖纠错、澄清后恢复、空 ASR、超时、提交失败、上游拒绝、断线、
重复回执、迟到 response.created、旧失败与新输入竞争、输出不一致及跨学习模式隔离。
generation=3 测试经过真实提示词刷新与真实 accumulator，三完整轮后断言输入绑定；
重置至 4 后旧 snapshot 不发事件或补分。只 mock 外部窗口评测，未 mock accumulator。
这不是新功能的真实数据库落库＋真人麦克风完整链路证据。

浏览器检查使用模拟业务 WS / API，验证键盘发送、等待状态、旧输入过滤、
澄清编辑、进度保持及重置。已查看 390px 澄清卡截图，无横向溢出。
跳过通用全站视觉扫描：本次沿用原组件布局，以新增状态的定向浏览器证据为准。
首次浏览器运行的 500 来自 Colima 不共享 /tmp 挂载；改为原工作区 ignored artifact
目录下的构建副本后恢复。随后修正了测试中同时匹配“在线”和“分析中”的 status 选择器。

本地 workflow / ai-omni 已重新 build，前端已 build 并挂载新产物；
先启动兼容的 workflow/client，再启动 AI。健康检查通过，页面返回 200。
验收失败后 AI 新开关已关闭；无数据库重置、无已保存进度变更。

## 延迟与剩余门槛

第二组 workflow 耗时 2,386–3,877 ms；5 次完成的 Realtime 首 chunk 为
1,193–1,594 ms，response.done 为 3,096–10,357 ms。
评测耗时与生成完成耗时相加，预估放行时间 5,482–14,138 ms。
这不含 ASR、连接建立、浏览器播放，也不是生产 P95；两次连接超时单独保留。
原 JSON `validated_release_ms` 只是当时的加和字段，连接失败行的该数值无意义；
脚本已更名为 `estimated_release_ms`，且只在传输与精确文本检查通过时生成。

下一步需要重新设计评测约束及可验证的事实边界，解决单位补造、错误纠错、语言串扰
及 schema 可用率，再重新跑三类各三次且全部语义通过。不能仅多跑直到碰巧通过。
之后仍需真人日语录音验收（ASR 不变）、端到端等待时间和持久化进度恢复验证。

## 开关、发布与回滚

`SCENE_CURRENT_TURN_TEACHING_ENABLED=false` 为默认及本地最终状态。
本地 override 位于原工作区 ignored 的
`quality/artifacts/scene-current-turn/local-override.yml`，仅用于实验。
若后续验收全部通过：先发布兼容协议的 workflow 和 client，再发布 AI；
完成日语语音验收后才能启用新开关。生产发布仍为人工步骤，不自动合并。
回滚关闭该开关并重建/重启 AI 服务，刷新会话；恢复原时序，不清库、不修改历史进度。

## Review evidence

- Scope: Scene Theater opt-in protocol, evaluator, Realtime controller, scoring input binding, UI and tests.
- Diff: isolated worktree diff based on 3637bfef1f21bd2de0c069098b94f0c7e2fac916.
- Commands: full verifier; scoped current-turn tests; Playwright two viewports; synthetic live probes.
- Risk areas: scoring, ws_audio, frontend, docker_release, data.
- Findings: 复查发现的空 ASR、提交失败恢复、旧失败取消新话轮及文本发送异常均已修复；真实评测稿仍有事实补造、语言错误及误判。
- Unresolved high/critical: 1
- Recommendation: blocked — keep flag disabled and PR draft until real-model semantic gate passes.
