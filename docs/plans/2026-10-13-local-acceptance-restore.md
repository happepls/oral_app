# 本地验收环境恢复

范围：恢复 `http://localhost:5001/` 的落地页和场景等待动画联合验收环境，不发布生产，不合并远端 PR。

## 原因与处理

- PR #84 的邮箱/SEO 和 PR #86 的等待动画尚未合并到主分支。在等待动画分支重新构建会覆盖此前本地落地页 bundle。
- 本地分支 `test/guaji-seo-tutor-local` 合并两项改动；保留等待动画翻译和当前后端代码，解决首页元数据、SEO 验证器和翻译文件冲突。
- Discovery 的权威目标请求返回 503：developer-api 获取 user-service 权限快照时收到 404。user-service 已挂载当前源文件，但运行中的 Node 进程仍缓存旧路由；重启后内部权限快照恢复 200。
- 重启 client-app 重新挂载被原子替换的 nginx 配置文件。保留宿主 `client/build` 挂载，重新构建前端。

## 已完成验证

- `npm --prefix client run build`、`npm run verify:geo`、`git diff --cached --check`：通过。
- 本地 19 个活跃目标对应的内部权限快照均返回 200；用户随后在真实登录浏览器确认“已正常显示场景”。没有重置目标或修改用户数据。
- `PLAYWRIGHT_BASE_URL=http://localhost:5001 npm --prefix client run test:e2e -- expression-feedback.spec.js --project chromium-320 --project chromium-desktop --project chromium-390-dark-en`：3 passed。使用实际 HTTP 构建，测试内 API/AI WebSocket 为受控替身；不宣称真实模型端到端回合已验证。
- 无 API mock 的独立浏览器检查：首页只有一个邮箱链接，滚动后可见，正常和悬停样式均无下划线；HTML 包含预渲染内容。截图：`quality/artifacts/local-5001-contact.png`。
- 宿主、容器、HTTP 的 `/static/js/main.e48e95ef.js` SHA256 一致：`846a3a7f0a82e95349f1ca02be2a11007848fffff46bc6567ef0c943d19e5878`。
- 后端 `prompt_manager.py`、`scene_teaching_policy.py` 与 `ai-tutor-stable-2026-10-13` 无差异。

- `docker compose up -d --build --no-deps client-app`：退出 0，镜像构建成功，容器已重新创建并启动；随后 `docker compose exec -T client-app nginx -t` 通过。
- `python3 scripts/sdlc.py validate`：`SDLC gate: clean`；暂存区 gitleaks 检查无泄漏。

保留组合后的本地验收分支与运行中的服务。本记录不替代 PR 人工审核、CI 或生产发布批准。
