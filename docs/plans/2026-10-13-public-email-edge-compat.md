# 官方邮箱与 HTTP 首页跳转兼容修复

## 范围与证据

用户授权修复生产验收发现的邮箱混淆和 HTTP 302 问题；真实录音回合已由站点所有者确认通过。以 `7563e1e` 为基点，不修改后端提示词、对话或评分逻辑。

- 生产邮箱链接被改写为 `/cdn-cgi/l/email-protection`，文本为 `[email protected]`。普通浏览器可解码，关闭 JS 不可读。
- HTTP 首页带参数返回 `302 Location: https://guajiguaji.top/`，参数丢失。nginx 首页代码已经返回 301 并保留参数。
- `Server: cloudflare` 不能单独证明 302 是 Cloudflare 生成的，也可能是转发的 Zeabur 响应。无代理直连探测被重置，不作为成功证据；管理面规则尚待查证。

## 邮箱修复

构建时仅将一个官方 mailto 链接包在 `<!--email_off-->…<!--/email_off-->` 中。零个或多个匹配均让构建失败，防止默默遗漏或扩大排除范围。保留其他邮箱的既有防护，不改变 React 组件、链接样式或浏览器语言行为。

产物校验要求只有一个排除块，块内只含官方邮箱链接；业务 SPA shell 不得含该标记。真实 nginx 无 JS 回归检查文字及正常/悬停样式。

依据：[Cloudflare Email Address Obfuscation](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/)。本地验证构建契约；Cloudflare 是否实际按标记处理，须人工合并发布后验证线上无 JS 页面。

## HTTP 跳转查证与待审核配置

1. 在 [Cloudflare Trace](https://developers.cloudflare.com/rules/trace-request/how-to/) 输入 `http://guajiguaji.top/?utm_source=check`，GET，执行 Send Trace。
2. 记录命中配置类型、规则名称/ID、匹配条件、目标、状态码和查询参数设置，不记录令牌/cookie。若没有 redirect 命中，检查 Worker 与 Zeabur 域名跳转。
3. 修改前保存生效规则原值和顺序。不能盲目禁用全站 HTTPS、修改 DNS 或覆盖整组规则。
4. 若确认由 Cloudflare 处理，可审阅以下**尚未应用**的首页规则。现有规则覆盖其他路径时，必须保留其其他行为；调整优先级前再次 Trace。

候选条件（仅 HTTP 公开首页 GET/HEAD）：

```text
(not ssl and http.host in {"guajiguaji.top" "www.guajiguaji.top"}
 and http.request.uri.path eq "/" and http.request.method in {"GET" "HEAD"})
```

候选重定向参数：

```json
{
  "from_value": {
    "target_url": { "value": "https://guajiguaji.top/" },
    "status_code": 301,
    "preserve_query_string": true
  }
}
```

依据：[Cloudflare Single Redirects settings](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/)。候选不代表已生效配置，本轮未应用 Cloudflare/Zeabur 变更。

## 发布、验收与回退

- 发布后关闭 JS：邮箱文本必须为 `admin@guajiguaji.top`、链接必须是 mailto。普通中英文页仍仅一个邮箱，正常/悬停无下划线。
- HTTP 首页带 `utm_source=check&x=1`：首跳 301，保留参数，最终 HTTPS 200 且不循环；www HTTPS 规范跳转保持通过。
- 有效深链、未知路径 404、API/WS 和录音等待保持通过。本地 nginx 通过不等于边缘验证通过。
- 邮箱回退：revert PR 并重建发布，不修改 Cloudflare 设置。边缘回退：按保存的 ID、原值和顺序恢复实际修改的那条规则。
- 根 SDLC 工件保留既有流程，通过独立 Issue/PR 交付，人工合并与生产发布。

## 验证

- `npm run verify`：退出 0，decision=pass，final_score=100，构建与仓库检查通过。日志：`quality/artifacts/public-email-edge-verify.log`。
- `npm run verify:geo`：通过。
- 前端 58 suites / 648 tests 通过。
- `npm --prefix client run test:seo`：12 passed，含无 JS 标记/邮箱/样式和真实 nginx 路由。日志：`quality/artifacts/public-email-edge-seo.log`。
- `PLAYWRIGHT_BASE_URL=http://localhost:5001 npm --prefix client run test:e2e -- --grep 'landing has|tutor replies' --project chromium-320 --project chromium-desktop --project chromium-390-dark-en --project webkit-mobile`：7 passed，含 3 个原始首页截图比较与 4 个等待回归；未更新截图基线，AI/API 为测试替身。日志：`quality/artifacts/public-email-edge-ui.log`。
- 实际差异检查：构建脚本仅包裹完整邮箱链接，失败时关闭构建；校验器限制唯一链接与 shell 隔离。后端、React 渲染、nginx 与根 SDLC 工件无 diff。本记录不替代独立人工审核。
