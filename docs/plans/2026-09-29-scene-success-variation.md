# 窄范围子任务：成功后引导等价表达

> 后续 UI 要求已变更为取消所有卡片，最终实现与 3000/5001 验证见
> [仅导师回复呈现教学内容](2026-09-29-scene-tutor-only-ui.md)。本文件的卡片描述保留为当时记录。

用户要求：明确子任务已成功复述后，Tutor 应引导相关的另一种表达，不能反复只表扬。
本次修改命中当前默认路径（同轮开关 false、表达点评开关 true），也同步更新草稿 v2 提示。
不启用尚未通过日语语义门槛的同轮点评。

## 行为

1. 正确自然的表达：简短具体肯定，给一种同意图、同事实的新说法，邀请学生开口。
2. 等价说法不是纠错，不因成功句简短就要求加长，也不要求再说已经成功说过的版本。
3. 重复原句时仍保持同一交际意图；下一步参考对话历史和当前输入。
4. 航班准点练习可由 `is my flight on time` 转向 `is my flight on schedule`，
   后者成功后再练 `will my flight be on time`，不跳到行李或登机口。
5. 旧版上一轮点评的候选提示只在仍适用、尚未练过时使用；候选为空也不能只表扬收尾。

真实诊断同时发现：原 `_student_voice` 一概拒绝 `Can/Could/Would you`，会把
`Could you tell me if my flight is delayed?` 这样的学生请求错当成老师话术。
现允许包含学生第一人称的请求，保留服务人员 offer、老师指令以及
`repeat after me` / `say my sentence` 等跟读指令拦截。

## 验证

真实脚本：`scripts/scene_success_variation_probe.py --live --env-file <本地已有 env> --output <报告路径>`，
使用 3.8 Realtime、Tina、实际 Scene Theater 提示和本地 v1 workflow 接口。
每组同一 Realtime 会话中连续发送三轮合成文本：原句、重复原句、on schedule 版本。
评测结果在下一轮加入，遵循当前旧链路的真实时序；不读历史或写入评分。

| 运行 | 结果 | 限制 |
| --- | --- | --- |
| 提示词更新后、学生请求校验修复前 | 8 条完成回复均邀请继续练习；仅 2 条反馈有效；另 1 轮超时 | 保留失败，不算完整验收 |
| 学生请求校验修复后 | 2 组共 6 条完成回复、6 条有效反馈；另一组连接超时 | 缺失的 3 轮不算通过；不能称 9/9 |

第二次完成回复人工复核：均简短肯定并邀请一种相关表达；没有将原句判错、
没有声称航班实际准点、没有转向其他子任务；说对 on schedule 后均邀请 will ... be on time。
其中一次 workflow 候选仍重复了刚成功的 on schedule，Realtime 按新输入与历史规则
改选 will ... be on time。因此不能把该实验当作 v2 评测稿已可靠的证明。

脚本自动区分 transport_pass、feedback_available 与待人工复核的 semantic_pass；
只有九条语音完成且九条有效反馈才退出 0，退出 0 本身也不代表语义通过。
本次两份完整合成记录保留在 [实验附件](../experiments/scene-success-variation-2026-09-29.json)。

新增 11 项离线回归：学生向工作人员发问保留为示范，服务人员口吻及老师跟读指令被拒绝。
最终统一 `npm run verify` 为 pass / 100；workflow 全量 197 passed、AI 337 passed、前端 599 passed，lint/build 通过。
本次无 UI 改动，沿用此前浏览器验证；提示词行为以真实模型试验为主要依据，未用字符串断言冒充效果测试。

## 本地与发布

本地 AI、workflow 镜像及容器已更新；AI 挂载副本的 prompt SHA 与工作树一致。
刷新浏览器、重新进入场景即可测试此引导调整，不需要用户再次 build。
`SCENE_CURRENT_TURN_TEACHING_ENABLED=false` 保持不变；生产未发布，PR 仍为 Draft。
本次小范围英语实验不替代日语九次验收，不解决此前同轮点评的事实补造和误纠错问题。

复查发现并修复了放宽学生请求后误放行 `repeat after me` 的回归。
若回滚本项，恢复本提交前的四个教学文件并重建 AI/workflow，重新进入会话。

## 建议卡简化

按用户后续反馈，普通表达建议卡移除自由文本输入和单独的发送按钮，只保留示范句点选发送。
识别不确定的 clarify 卡继续保留文本修正入口；发送失败、禁用及发送成功提示仍可见。
现有组件测试更新后 6 passed；手机/桌面 Playwright 2 passed，确认普通卡没有输入框、
键盘点选仍发送一次、失败可重试，clarify 仍可编辑发送。已查看手机截图。
前端 build 和 lint 通过（0 error、168 条既有 warning）；本地产物已更新，
host/容器/HTTP 的 `main.cd7adb81.js` hash 一致，无需重建后端容器。
