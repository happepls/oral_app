# AI tutor 快照与场景等待动画

日期：2026-10-13（Asia/Shanghai）。来源：用户明确要求建立后端提示词 tag 快照，并仅修改场景对话 UI 添加等待动画，禁止改动后端 prompt。

## 范围与实施

- 根 SDLC 工件属于其他活跃需求，保持不变；本需求独立分支 `feat/ai-tutor-waiting-ui`，不混入尚未合并的 SEO PR #84。
- 用户给定的两项工作作为本次实施范围：先保存最新主分支提示词快照，再复用既有等待状态增加 UI；不改提示词、消息处理、WebSocket 协议、录音、音频和评分处理。
- 当前工作区原先位于 SEO 分支，提示词版本落后于 `origin/master`。已 fetch 后选择最新主分支 `9a1262425d97fdc48bcd0e4e3ba79b20320f99ea` 作为快照及新分支基点，不宣称该 commit 已在线上核验。
- annotated tag：`ai-tutor-stable-2026-10-13`，已推送 origin。`prompt_manager.py` Git blob：`51ecefc67d6ac96180ceab8d1bb8aa25c49d1ff0`。完整 tag 同时保留其依赖 `scene_teaching_policy.py`。
- 对话末尾及 CC 模式显示“AI 导师正在回复…”和跳动圆点，只渲染一处；9 种语言提供翻译。语音发出至首个回复间立即显示；空 AI 占位仍显示，可读回复文本出现后隐藏，无需等待音频。
- 复用当前连接、录音、错误及等待状态决定可见性，不增加消息、请求或计时器；等待提示不进入聊天历史。录音中、连接错误、恢复连接、重置、其他学习模式不显示。减少动态效果时圆点静止。
- `figma_app_template/src/` 不存在；沿用当前对话页面设计和已有 CSS Token。

## 验证记录

- Issue：https://github.com/happepls/oral_app/issues/85 （queued；根活跃流程未改动）。
- `npm run verify`：退出 0，decision=pass，final_score=100；前端 58 suites / 648 tests passed，构建通过。保留仓库既有 warnings，不宣称零 warnings。日志：`quality/artifacts/ai-tutor-waiting-verify.log`。
- 场景录音至回复 UI 回归首轮 4 passed；补充实际英文界面后发现旧测试中文录音按钮选择器不适用，修正选择器后英文单独复测 1 passed。超时轮次的 worker 清理未结束，已停止该轮；不记为成功。
- 最终 `npm --prefix client run test:e2e -- expression-feedback.spec.js --project chromium-320 --project chromium-desktop --project chromium-390-dark-en --project webkit-mobile`：4 passed（35.1s），包括真实英文/深色显示、动画确实运动/减少动态效果时静止，以及提示自身 serious/critical a11y 检查。验证发出录音后无后端事件即显示、CC 单一提示、空 AI 占位、旧帧不影响等待、文本到达先于音频时隐藏、retry/error 隐藏、任务进度及历史保存不受影响。日志：`quality/artifacts/ai-tutor-waiting-final-e2e.log`。
- `npm --prefix client run test:e2e -- ui-audit.spec.js --grep 'conversation has' --project chromium-320 --project chromium-desktop --project chromium-390-dark-en`：3 passed，含原始截图比较、overflow、控件与 serious/critical a11y 检查；没有更新基线。首次带 `^` 的过滤条件未匹配测试，纠正后正常运行。
- `python3 scripts/sdlc.py validate`、`git diff --check`：通过。
- `git ls-remote origin 'refs/tags/ai-tutor-stable-2026-10-13*'`：远端 annotated tag 存在，指向 `9a12624`。工作区 `prompt_manager.py` 与 tag 文件 SHA256 均为 `90b13767712a671f588b7d45869ae63ce5a01c4817fafef77dc71ea9997d18a5`；`git diff -- services` 为空。
- 未执行：生产发布、独立人工 PR 审核及生产提示词版本核验；无模型请求或真实用户会话参与本轮浏览器回归。

## 回退快照的使用

查阅保存版本（只读）：

```bash
git show ai-tutor-stable-2026-10-13:services/ai-omni-service/app/prompt_manager.py
git diff ai-tutor-stable-2026-10-13 -- services/ai-omni-service/app/prompt_manager.py services/ai-omni-service/app/scene_teaching_policy.py
```

未来需要回退时，先保护工作区未提交改动，在独立修复分支执行：

```bash
git restore --source=ai-tutor-stable-2026-10-13 -- services/ai-omni-service/app/prompt_manager.py services/ai-omni-service/app/scene_teaching_policy.py
```

检查后续调用接口是否兼容，运行相关提示词/教学策略回归，再提交 PR 并人工审核发布。Tag 不包含模型服务端配置、环境变量或密钥；单独恢复提示词不等于完整服务回滚。不重置分支、不自动部署或回退生产。

本次 UI 回退：revert 对应前端变更并重新构建发布，不恢复/修改后端 prompt。
