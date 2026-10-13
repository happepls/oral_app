# Guaji 品牌搜索发布与收录操作

适用：GitHub #83，2026-10-12 用户批准的邮箱与 SEO 优化。技术代码经 PR 审核后发布；域名验证与站长平台操作需要站点所有者登录。当前没有平台提交或索引成功证据。

## 发布检查

1. 人工审核 PR，确认 CI 通过，再批准合并与 Zeabur 发布。记录实际部署 commit，不以 health=200 代替代码版本核对。
2. 部署完成后保存 `https://guajiguaji.top/` 的响应头和 HTML：200，index/follow，主域 canonical，可读正文含 `Guaji AI（guajiguaji）`、FAQ 与 `mailto:admin@guajiguaji.top`。不是只有空 React root。
3. 浏览器确认中英文页脚邮箱可见、链接正确，价格加载失败时介绍仍可读。关闭 JS 后首页正文和注册链接可用。
4. `http://guajiguaji.top/` 与 `https://www.guajiguaji.top/` 应归一到 `https://guajiguaji.top/`，保留查询参数，不能循环。代码只规范公开首页；API/WS 不纳入该跳转。若 Cloudflare 已执行 HTTP 重定向，避免新增相互冲突规则。
5. `/robots.txt` 为文本并声明 sitemap，`/sitemap.xml` 为 XML 且只列真实公开 URL；不存在 URL 和静态文件返回 404。`/discovery` 等有效深链返回空 root 的 noindex 应用 shell。
6. 对照 build 的 `static/js/main.*.js` 与线上 HTML 引用及 HTTP 下载内容。自托管 compose 如启用 build 挂载，先运行 `cd client && npm run build`；改 nginx/Dockerfile 时重建前端容器。

## Google Search Console

1. 站点所有者打开 [Search Console](https://search.google.com/search-console/about)，添加域名属性 `guajiguaji.top`；若已有该属性，使用现有属性。
2. 如平台要求 DNS TXT，使用其实际给出的验证值。通过实际 DNS 管理员操作并保留验证结果；不复用其他站点值、不虚构验证文件或 token、不提交凭据。
3. Sitemaps 提交 `https://guajiguaji.top/sitemap.xml`，保存处理状态与时间。
4. URL 检查 `https://guajiguaji.top/`：先看当前索引状态、上次抓取、抓取允许状态、用户声明及 Google 选择的 canonical；执行实时测试，查看抓取页面/渲染内容，确认品牌与邮箱可见。
5. 如果实时测试正常，申请编入索引。提交成功不是收录成功；后续重新检查实际索引状态。
6. 如果被拒绝抓取或出现挑战页，查看同时间的 Cloudflare verified-bot 事件与源站日志，再针对真实原因调整。不能把普通 curl 或伪造 Googlebot User-Agent 当作真实机器人可达的证明。

## Bing 与中文搜索

- 在 [Bing Webmaster Tools](https://www.bing.com/webmasters/about) 验证现有站点，提交同一 sitemap，检查 URL 抓取与索引诊断。只有页面确认成功才记录已提交。
- [百度搜索资源平台](https://ziyuan.baidu.com/) 的具体提交权限以登录后显示为准；本轮公开访问超时，未确认当前账号开放能力。不能声称已验证/已提交。

## 每周观察与增长

记录以下字段：日期与时区、引擎、查询词、国家/地区、设备、品牌词展现/点击/平均排名、首页索引状态、实际 canonical、上次抓取、最近部署版本、下一步动作。查询词先跟踪 `guaji`、`guajiguaji`、`Guaji AI`。

先排除“未发现、抓取失败、渲染失败、重复 canonical、未收录”，再讨论排名与竞争。针对真实产品功能发布有用的口语练习内容；从官方介绍与正常社区资料链接到主域。没有证据的学习效果、用户数量、评分和社交账号不进入结构化数据。

`llms.txt` 是现有机器阅读辅助资料，不替代 sitemap、Search Console、可抓取正文或网站质量。不存在保证立即收录或排名第一的技术标签。

## 回滚

回退对应 PR 与前端部署到此前版本；同步构建产物和 nginx 配置。新版 nginx 要求 build 中存在 `homepage.html`，不能只回退 HTML 或只回退 nginx。任何额外 Cloudflare/DNS 修改都保存原值并单独回退，不改动学习数据或认证信息。

官方依据：[JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)、[站点名称](https://developers.google.com/search/docs/appearance/site-names)、[重新抓取请求](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)。
