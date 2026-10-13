# Scene Theater：原始音频测评证据修复

## 问题与授权

用户报告“自我介绍与职业背景说明”中导师评价高、任务进度与场景复盘分数都偏低，要求结合生产日志修复。此次修复授权来自该请求；生产发布仍待人工决定。原工作目录的未提交改动未修改，工作位于独立分支 `fix/scene-asr-evidence`。根目录六个 SDLC 工件保留原闭环，不覆盖。

2026-09-29 只读诊断关联生产版本 `a858b52fc1b510b815bde09a9f517ea4d6ed05e8`、用户指定场景与约 16:03 北京时间。持久化评测理由批评了转录中的同音词、专名和数字；多个窗口 delta=1。服务日志另有 expression feedback ValueError/TimeoutError，以及一次评分请求失败后重试成功。未回放该用户原始音频，因此不能把所有低分都认定为 ASR 错误。未保存真实用户对话、账户标识或原始生产日志到仓库，也未更改生产数据。

调用链存在两个不同问题：Realtime 导师听原始音频，评测仅看显示用 ASR；复盘从文字推测发音/语调、对不足三个空格分词和数字回答硬性限分，还在模型失败时生成启发式分数。前端总分环使用任务进度而非后端报告总分。

## 实现契约

- Scene Theater 在录音提交时复制 PCM16/16kHz，使用现有 3.8 Realtime 端点进行独立、纯文本返回的音频核验。不传显示转录、任务示范或导师回答给核验模型；不更换主 ASR、音色或流式音频输出。
- 核验返回 `status: clear|uncertain`、`heard_text`、`uncertain_spans`、可选 `speech_scores`。三个声学维度为 pronunciation/fluency/intonation，严格整数 0–100。失败为服务端 `unavailable`，等待为内存 `pending`。
- 清晰音频使用 faithful heard_text 进行窗口评分及表达点评。保留真实语法错误，不把导师示范计为学生表现；显示 ASR 内容不被偷偷改写。不确定、失败输入不进入评分窗口，导师用目标语言请求重说。
- 明确数字二选一即使可听清也标为不确定，不代选数字或补单位。此规则只暂缓评测，不生成分数或替用户改写答案。
- 音频核验总超时 12 秒，ASR/核验协调等待上限 13 秒。每次录音最多 90 秒；超限暂不评分。每话轮增加一个同提供方模型请求，增加费用与首回复等待。
- 用户/目标/任务/非零 scoring_generation/连接 epoch/输入序号绑定不可变话轮。乱序、重复 ASR、重复结束事件、旧连接排队事件、任务重置及中断不能占用新话轮。无法可靠配对的上游创建失败触发重连。
- 音频 URL 和核验结果随原 message ID 保存；历史重试不阻塞回复。Mongo 新增字段为可选字段，无迁移。浏览器历史快照不能注入核验数据，也不能用缺失字段抹掉已保存数据。
- 复盘只把清晰音频中的声学评分聚合；至少三个不同话轮才产生声学维度。词汇模型仅评价核验文本，文字输入不伪装成声学证据。旧 audioUrl 消息没有核验时不从其 ASR 生成能力评分。
- 四个维度齐全才计算总分和星级；不足/失败为 `analysis.evaluation_status=pending`、`overall_score=null`、`stars=null`，缺失维度为 null，不再伪造 40 分或用进度推算能力。真正 0 分保留。
- 报告模型与进度模型共用端点对应的凭据选择和 JSON 请求协议。报告生成要求 `X-Guaji-Internal-Auth`；三个 AI 调用入口均转发内部凭据。暂时失败的 pending 报告允许后续重试，已完成旧报告仍复用。
- 前端只显示后端有效总分/维度；九种语言补齐待测评文案。无建议卡、澄清卡或额外输入框。
- 进度 delta 映射、完成阈值、窗口锁、评分世代、已保存进度不变。其他学习模式不启动音频核验。

## 实验记录与局限

所有模型实验使用合成日语，不读取用户聊天或写入任务分数。原始音频由 macOS Kyoko 合成后转 PCM16/16kHz。记录文件：`docs/experiments/2026-09-29-scene-audio-evidence.json`。

1. 初轮音频核验 8/9：数字选择“十五か五十”一次误判 clear，转录仍保留选择。加入只拒绝评分的数字歧义守卫后 9/9。加入声学维度后再次 9/9，核验耗时 4.273–8.199 秒。真实语法错误保留，数字歧义不补造单位，正确表达保留。
2. 首轮真实窗口模型 9/9，但复盘因凭据选择错误收到 401，返回 pending。该 401 是本地联调证据，不推断生产也发生相同错误。
3. 共用凭据后复盘成功；重复窗口实验只有 7/9，两个正确且完成任务的简短回答被降档或要求第四轮。保留失败记录，并补充“仅按任务要求判定完整，不索取额外业绩”的提示约束。
4. 最终重复窗口分类 9/9、复盘计算契约通过（退出码 0）。这些是小样本语义检查，不是学习者口音、噪声环境或分数校准的证明。重复同一句话的词汇评分在两次调用中有明显波动，模型理由仍可能出现语言不一致；不宣称消除全部偏差。

此实验不等于旧 `SCENE_CURRENT_TURN_TEACHING_ENABLED` 的完整语义验收，该开关继续关闭。

## 自动化与本地验证

修改前已完成 AI 337 项及 workflow 相关 99 项基线。当前回归覆盖：原始 PCM、超时关闭、真语法错误、数字歧义、证据投影、三轮评分窗口、generation=3 刷新/重置、乱序/重复、中断/重连、欢迎语残留、旧 epoch 排队事件、慢历史写入、可信历史往返、报告总分与 null、内部认证及 endpoint-specific key。

执行命令：

```sh
/Users/sgcc-work/IdeaProjects/oral_app/.venv/bin/python -m pytest services/ai-omni-service/tests -q
/Users/sgcc-work/IdeaProjects/oral_app/.venv/bin/python -m pytest services/workflow-service/tests -q
node --test services/history-analytics-service/test/*.test.js services/conversation-service/test/*.test.js
QUALITY_PYTHON=/Users/sgcc-work/IdeaProjects/oral_app/.venv/bin/python npm run verify
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/expression-feedback.spec.js e2e/task-progress-guidance.spec.js e2e/scene-recovery.spec.js --project=chromium-390 --workers=2
```

已完成：AI 366、workflow 210、前端 628、history/conversation 15 项通过；`npm run verify` score=100，lint 无错误（存在既有 warning），前端构建通过。浏览器 15 项断言通过、1 项按手机视口跳过，但 worker 退出卡住，发送 SIGINT 后打印同样汇总并以 130 退出；不将该次 CLI 算作完整通过。随后以单 worker、60 秒总时限重跑两个相关测试，断言 2/2 通过但 suite/report teardown 再次超时，退出问题仍待处理，PR 保留草稿。首次总验证使用系统 Python 导致缺依赖，改用项目虚拟环境；另修正九语言扁平 key 和旧静态路由测试后通过，未跳过失败检查。

本地 AI、workflow、history、conversation、client 容器已重建/更新；源码与容器 hash 已核对。前端 `main.797c15a1.js` 的宿主、容器、HTTP 内容一致。`localhost:3000` 开发服务器已切换到本分支，`localhost:5001` 提供构建版。浏览器回归使用模拟 WebSocket；真人麦克风端到端仍由用户本地实测。

额外本地服务验证：conversation 内部历史接口返回 201，Mongo 中原始显示文本与核验文本/声学评分均保留；仅创建的合成测试会话随后删除。无内部凭据的复盘请求返回 403。独立审查发现的欢迎语残留、旧 epoch 占用新队列、重复结束事件、pending 报告不能重试等问题均已修复并补测试，最终复审无新增问题。

## 发布与回滚

新增 `SCENE_AUDIO_EVIDENCE_ENABLED` 默认 true，独立于仍关闭的同轮教学开关。现有已保存进度不回填、不清零。

人工批准后，先发布 history/conversation 的附加字段和客户端 null 协议；再发布带内部认证头的 AI，最后 workflow 的认证校验及新复盘。这样旧 workflow 可接受新 AI 请求头，避免先启用服务端认证阻断旧 AI。发布后须验证真实日语录音、核验证据、非零世代进度窗口、持久化/重连及复盘；health/RUNNING 不是业务验收。

临时停止音频核验：AI 设置 `SCENE_AUDIO_EVIDENCE_ENABLED=false` 并重启，恢复旧 ASR 评分时序。新的报告仍不会伪造缺失声学分，可能显示待测评；完整代码回滚需回退本 PR 对应服务（先放宽 workflow 为旧版本，再回退 AI）。无需改写数据库进度或删除新增历史字段。

当前没有生产部署，也未自动合并。
