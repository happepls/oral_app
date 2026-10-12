# Guaji 官方联系邮箱与品牌搜索优化

日期：2026-10-12（Asia/Shanghai）。状态：用户已批准实施计划，独立分支实施与验证中；尚未发布生产。

## 用户目标

首页底部公开官方联系邮箱 `admin@guajiguaji.top`；提升 `guaji`、`guajiguaji`、`Guaji AI` 的品牌检索可见性。技术交付目标是公开页面可抓取、品牌身份一致、有效提交收录；排名与收录由搜索引擎决定，不能承诺完成代码后立即出现或排名第一。

## 工作流与边界

- 根工件仍属于 `ai-native-sdlc-bootstrap`，maintenance 尚未完成；GitHub #52 标记为 `sdlc:active`。保留根工件，本需求进入独立 `sdlc:queued` Issue。
- 用户 AGENTS.md 要求“计划执行和发布必须人工批准”；`.agents/skills/oral-app-sdlc/SKILL.md` 要求 Build 前明确计划审批。2026-10-12 用户明确回复“批准该计划”，授权本计划实施；不代表批准合并或生产发布。
- 可先做只读诊断、编写计划和排队；批准后按仓库流程开展独立分支实施，到 PR 为止。合并、部署及站长平台/DNS 操作另记录真实授权与证据。
- 诊断时原分支为 `fix/production-tts-access-translation`；实施时工作区位于 `master`，以当时 HEAD `adaedc4` 创建独立分支 `feat/guaji-brand-seo-83`。不改动根工件，不添加虚构审批。

## 已执行诊断与证据

| 检查 | 状态 | 实际结果 |
| --- | --- | --- |
| 用户截图 | Ran | `guajiguaji` 搜索展示其他站点；截图不包含 Search Console 证据 |
| 本地工作区 | Ran | 开始时 `git status --short` 为空 |
| 首页 HTTP | Ran | curl 获取 HTTPS 首页为 200，HTML，Cloudflare；未观察到 X-Robots-Tag；Last-Modified 为 2026-10-11 08:56:55 GMT |
| 线上 HTML | Ran | title/description、index/follow、主域 canonical、OG/Twitter、WebSite/Organization/SoftwareApplication/FAQPage 均已存在；主 bundle 为 `main.4b6bf8bd.js` |
| 线上 robots/sitemap | Ran | robots 允许首页及静态文件，限制业务/API 路径，指向有效 sitemap；sitemap 当前仅列主域首页 |
| 首页可读正文 | Ran | HTML 的 React root 为空，介绍与 FAQ 位于 noscript；常规启用 JS 的页面依赖 React 渲染 |
| 品牌身份 | Ran | 静态 title/description/schema 使用 Guaji AI；缺少明确 `guajiguaji` 品牌别名；React 页脚使用 Guaji，未包含所要求的邮箱 |
| www 域名 | Ran | curl 跟随跳转后最终仍为 `https://www.guajiguaji.top/`，返回 200；不是主域重定向 |
| 公开搜索 | Ran | 工具查询 `site:guajiguaji.top` 与 `"guajiguaji.top" "Guaji"` 未返回结果；不能当作 Google 未收录的权威结论 |
| web 抓取工具 | Ran | 工具打开首页/robots/sitemap 返回 Internal Error；curl 能获取，不据此断言搜索机器人被拦截 |
| 不存在路径线上检查 | Ran | curl TLS 连接失败，无有效状态码；不能声称线上已验证 soft 404 |
| SPA 路由/服务配置 | Ran | App.js 未知路由 Navigate 到 `/`；Zeabur nginx 使用 `try_files ... /index.html`，代码存在未知 URL 返回首页的风险 |
| SDLC validator | Ran | `python3 scripts/sdlc.py validate` 输出 `SDLC gate: clean` |
| 私有站长平台/CF 日志 | Skipped | 未访问 Search Console、Bing Webmaster、百度资源平台、Cloudflare verified-bot 日志，未得到账号或日志证据 |
| 性能/浏览器验证 | Planned | 本轮未运行 Lighthouse、Core Web Vitals 或浏览器渲染测试，不声称这些已通过 |

本地证据路径：`client/src/pages/Landing.js`、`client/src/App.js`、`client/public/index.html`、`client/public/robots.txt`、`client/public/sitemap.xml`、`client/src/i18n/locales/*.json`、`client/client.nginx.zeabur.conf`、`scripts/verify-geo-build.mjs`、`client/e2e/pre-react-fallback.spec.js`。

前端参考目录 `figma_app_template/src/` 当前不存在；可用静态品牌参考为 `figma_app_template/Guaji AI_Design_System/guajiguaji.top/index.html`。本次保留现有视觉设计，只在既有页脚布局增补联系信息。

## 原因判断

已确认：基础 SEO 标签并非缺失，robots 没有禁止首页；名称没有清楚关联品牌检索词；正文依赖 JS；www 存在第二个可访问入口。

待证实：Google 是否发现/抓取/渲染/收录首页、采用哪个 canonical、Cloudflare 是否阻止真实爬虫、品牌外部引用是否不足。普通 HTTP 200 与伪造 Googlebot User-Agent 均无法证明真实 Googlebot 可达。先查 URL 检查与日志，再决定 WAF 调整。

## 已批准实施计划

### 1. 页脚官方邮箱与品牌文案

- 在 `Landing.js` 页脚显示“官方联系：admin@guajiguaji.top”，使用 `<a href="mailto:admin@guajiguaji.top">`；保持键盘可访问、清晰焦点、320px 可换行。邮件地址来自本需求，只作为公开联系地址，不宣称邮箱投递已验证。
- 文案接入现有 i18n；所有支持语言提供对应联系标签，邮箱字符串保持一致。
- 首屏介绍自然补充“Guaji AI（guajiguaji）是浏览器中的 AI 口语练习应用”；英文为相同品牌与功能含义，不发明中文品牌名。
- 建议首页 title：`Guaji AI（guajiguaji）｜AI 口语练习应用`；description 包含品牌、AI 语音对话、真实场景任务、反馈和进度记录，不堆砌关键词。
- 同步静态 HTML 与 `landing_meta_title` / `landing_meta_description`，避免 `PageMetadata` 在 React 启动后覆盖新文案。
- WebSite 添加 `alternateName: ["Guaji", "guajiguaji"]`；Organization 添加用户给出的 email，并与页面可见信息一致；保持现有稳定 @id。
- 保持 FAQ schema 与可见 FAQ 同步，不添加虚构评分、评论、社交账户或价格。

### 2. 首页初始 HTML 与业务页面隔离

- 实施构建期首页预渲染，独立输出公开首页文件，只对精确 `/` 服务该文件；业务深链继续使用空 root 的 SPA shell。内容与 React 首页共用文案来源，访客与爬虫获取相同内容。
- 首页首个响应可读到品牌介绍、功能、FAQ、官方邮箱和有效链接，无须执行 JS；不预渲染用户会话、个人资料或动态订阅价格，不写入 build 时临时 API 值。
- 处理首屏 splash、motion 初始隐藏与 React 挂载/水合，保证正文不会被永久 opacity:0 隐藏，且首屏不出现两份页面；价格查询失败不阻止静态介绍展示。
- 同步本地、prod、Zeabur 使用的 nginx 配置及构建流水线，检查真实 Docker/静态文件入口，不只修改一个环境。
- 更新 `scripts/verify-geo-build.mjs`：当前明确要求 root 为空；新契约分开验证“首页正文可读”和“业务 shell root 为空”。保留 `pre-react-fallback.spec.js` 对 `/discovery` 的防闪烁保护。
- 预渲染涉及构建和渲染契约；若实现中出现超出上述边界的框架迁移需求，先回报具体设计，不直接迁移框架。

### 3. URL、抓取与状态码

- 复核 HTTP→HTTPS 与 www→主域链路，公开首页最多一次规范跳转到 `https://guajiguaji.top/`；只在明确负责该入口的 nginx/Cloudflare 层修改，避免代理 scheme 引起循环；不改业务 API/WS 路由语义。
- 区分有效 React 业务深链与未知路径，未知路径返回真实 404；保留登录、注册、找回密码、所有有效业务深链与静态资源路径。
- 精确服务 robots/sitemap，文件不存在时返回 404 而不是首页 HTML；保持 sitemap 只列真实可索引公开 URL，不伪造 lastmod。
- 首页保留 index/follow 与自引用 canonical；业务页面禁止带首页结构化数据参与索引，必要时补服务端 X-Robots-Tag，不能依赖 robots disallow 实现移除索引。
- 仅在 verified-bot 日志或站长实时测试证实 WAF 阻断时提出定向修正，不整体关闭 Cloudflare 安全策略。

### 4. 搜索平台验收与后续增长

- Google Search Console 使用域名属性验证所有权，提交 `https://guajiguaji.top/sitemap.xml`；URL 检查首页，查看发现/抓取、渲染截图、索引状态、Google 选择的 canonical，申请重新抓取。所需 DNS TXT 仅使用平台实际提供值。
- Bing Webmaster Tools 验证域名、提交 sitemap 并检查抓取。面向中文市场再核实百度搜索资源平台当前开放的验证/提交能力；缺少权限时记录待办，不假报提交成功。
- 部署后保存首页、robots、sitemap 的状态码/内容与发布版本；确认 JS/CSS 可取且正式 bundle 包含邮箱。以“代码完成 / 已发布 / 已提交 / 已收录 / 品牌词展现”五种独立状态报告。
- 每周查看 `guaji`、`guajiguaji`、`Guaji AI` 的展现、点击、平均排名与收录状态，记录地区/设备/查询时间；搜索无结果不等于已经定位单一原因。
- 技术收录链路健康后，再以真实使用场景写公开内容页并增加内部链接；在真实产品介绍与授权官方渠道使用同一品牌和主域链接。新内容页另按真实功能验收，不创建空页面、不购买垃圾外链、不保证通用词 guaji 的第一名。
- `llms.txt` 可保持现有用途，不能当作 Google 排名或收录的替代方案。

## 验证与回滚

以下是批准后待执行的检查，本轮未执行：

1. 邮箱在中英文/其他语言页脚可见，mailto 正确；320px/桌面、浅深色、键盘焦点与换行检查。
2. `cd client && npm run build`，然后 `npm run verify:geo`；检查产物和部署配置确实使用独立首页 HTML。
3. 浏览器禁 JS 的 `/` 可读介绍与邮箱；启用 JS 后切换语言仍保持品牌 title，结构化数据与可见 FAQ 一致；价格请求持续 pending 时内容可用。
4. 阻止 bundle 后访问 `/discovery` 不出现首页内容；正常访问所有有效深链能启动应用；未知 URL 为 404；不存在静态文件不返回 HTML。
5. 首页 canonical/robots/schema 解析、www/HTTP 跳转、robots/sitemap 内容类型、资产状态码验证；随后运行仓库要求的 `npm run verify` 和风险对应检查。
6. PR 提交前执行 `gitleaks git --staged --verbose --config .gitleaks.toml`；生产发布由人工批准。

回滚：按 PR revert 邮箱/文案与 SEO 构建配置，回到前一静态首页及 shell；如涉及 Cloudflare 规则，保存原值并单独回退。不会重置用户数据、改认证/计费或删除现有 build 后不重建。

## 官方依据

- [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)：抓取、渲染、索引是不同阶段，建议服务端/预渲染并正确返回状态码。
- [Google site names](https://developers.google.com/search/docs/appearance/site-names)：站点名称和 WebSite 的 alternateName 应一致表达品牌。
- [Google 重新抓取](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)：通过 URL 检查或 sitemap 发起发现/重新抓取，不能保证即时收录。
- [Bing Webmaster Tools](https://www.bing.com/webmasters/about)：站点所有者进行验证、提交与检查；本轮未访问私有控制台。
