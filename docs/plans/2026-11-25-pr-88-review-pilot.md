# PR #88 回溯审查 · 叶子

## Findings

No findings.

## 风险卡

- Base `7563e1e07675c9d9102fbf45b0e29645730c1a45`，Head `24e66bf0b1fc2d80f1362802e37af1f070fc53ea`。[PR 与实际差异](https://github.com/happepls/oral_app/pull/88/files)
- 用户目标是在关闭 JavaScript 时依然能读到公开联系邮箱并使用 `mailto:`。
- 沿首页预渲染脚本 → 静态中文首页及独立 SPA shell → nginx/边缘交付 → 桌面及手机浏览器追踪。React 负责客户端语言切换。
- 优先验证脚本关闭时可见文本与链接目标一致、排除块保持唯一，以及语言切换后仍保留正确的联系链接。
- 核对精确 Head 的 CI，并用隔离构建产物验证静态链接及桌面和移动端。若发布后首页邮箱不可用，回滚前端构建并以交付后的 HTML 复测。

## 证据

实际合并提交 `1512c1550603743ec298b83d2a4e9ad6a3902209` 的文件树与 Head 一致。本地隔离目录使用该 Head 的依赖锁文件，Node 为 `25.1.0`。历史 CI 使用 Node 20。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm ci --legacy-peer-deps --no-audit --no-fund` | 0 | 按 PR 的 `client/package-lock.json` 装依赖。 |
| `npm run build` | 0 | 生成独立预渲染首页和 SPA shell。 |
| `node scripts/verify-geo-build.mjs` | 0 | 首页唯一排除块，SPA shell 无排除标记。分别移除及重复排除块后，校验器均按预期退出 1。 |
| `npm --prefix client run test:seo` | 0 | 12 项通过。真实本地 nginx 和 Chrome 覆盖 320 像素中英文配置、1440 像素桌面、关闭 JS、语言切换及路由。 |

补测关闭 JS 的页脚，320 像素和 1440 像素均通过。[手机截图](evidence/2026-11-25-pr-88/mobile-no-js.png) · [桌面截图](evidence/2026-11-25-pr-88/desktop-no-js.png)

历史 CI 的 `test` 和 `ui-audit` 已在 PR Head 上成功。GitHub 的 PR reviews 列表为空。[test](https://github.com/happepls/oral_app/actions/runs/38345617399/job/115126220123) · [ui-audit 工件](https://github.com/happepls/oral_app/actions/runs/38345617399/artifacts/11789515295)

`sdlc-review` 对该公开页面变更无路径标签，日志仍因历史 `release.md` 的 Base/Head 不匹配在内层失败。[治理日志](https://github.com/happepls/oral_app/actions/runs/38345617276/job/115126219605)

## 结论与剩余覆盖

本轮可轻量评审。Cloudflare 边缘对该确切部署版本的转换、HTTP 跳转配置、生产部署 SHA 及回滚均为 `unknown`。本地 nginx 测试和截图仅证明被审构建的交付行为。
