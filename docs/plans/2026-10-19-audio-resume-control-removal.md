# 对话页恢复语音控件清理与验收

## 范围与授权

用户要求 AI 导师回复时不出现“点击恢复语音播放”，允许清理删除该控件。
用户已确认 localhost:5001 的“问路”场景本地复测通过，并授权提交 PR；
人工审核后才可合并、发布生产。本记录不替换根目录既有 SDLC 工件，
不声明旧工件已完成生产部署或维护观察。

## 实现

- 删除底部恢复语音按钮、专用状态、被拦截 PCM 缓存及九种语言的闲置文案。
- PCM 失败时允许完整录音兜底，保留消息内播放入口。
- Web Audio 等待音频上下文恢复成功；HTMLAudio 的 play 成功后才显示播放状态，
  两次尝试均失败后清理状态，避免无声时显示“暂停”。
- 保留正常流式播放、响应隔离和录音前恢复 AudioContext 的行为。

## 实际验证

- 用户确认本地真实场景复测通过（后续 PR 检查增加了播放失败状态修正）。
- `npm run verify`：最终代码通过，decision=pass，100 分；前端 58 套、648 项测试通过。
- `cd client && npm run build`：通过，存在既有 lint/Browserslist 警告；
  全库验证也重新执行构建并通过。
- `npm run verify:ui -- -- e2e/audio-prepaid.spec.js --grep 'PCM prefix|autoplay rejection' --project chromium-390 --project chromium-desktop --project webkit-mobile`：6 项通过。
  验证乱序 PCM 与完整样本、被拦截时无恢复按钮、完整录音两次自动播放被拒后保持“播放”、
  单击重播、播放结束清理，以及后续回复正常流式播放。
- 浏览器使用 Web Audio/HTMLAudio 策略模拟；WebKit 结果不替代真实 iPhone 听音验收。
- 独立只读审查发现的无声“暂停”问题已修复并复审，未发现剩余可执行问题。
- `git diff --check`：通过。

证据保存在忽略的 `quality/artifacts/latest/` 和 `quality/artifacts/playwright-results/`。
PR 提交前另执行暂存区密钥扫描。未自动合并、部署或修改生产服务。

## 发布与回滚

等待人工 PR 审核及最终提交检查通过后，再发布 client-app；
验证部署提交、HTTP 前端文件版本、真实场景等待/回复/重播和 CC 模式。
生产验收尚未执行。回滚为恢复本 PR 之前的前端版本；无数据库迁移。
