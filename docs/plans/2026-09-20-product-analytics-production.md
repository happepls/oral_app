# 产品统计生产实施记录

状态：生产访问采集、转化事件队列和管理员报表已启用；实际新用户完整对话验收及可信访客IP链仍待观察/确认。

授权：本会话用户合并 PR #59 后要求“请继续下一步吧”，指定 Umami 管理员账户名 `sjx18094552`。仅推进本需求的统计部署，不替换旧根 SDLC 工件或伪造其历史维护验收。

代码：<https://github.com/happepls/oral_app/pull/59>；合并提交 `dbe0d54184a500acd1daaa7e228e43d63369dfcd`。
环境：现有 Zeabur oral-app 项目，production；没有新建项目或采购服务器。

## 已执行

- 生产 backup-service 的 `/opt/oral-backup/health.sh` 返回 ok；最近成功备份时间 `2026-09-19T18:30:08Z`。
- 同一 PostgreSQL 实例中创建独立 `umami_analytics` 数据库与同名专用角色：NOSUPERUSER、NOCREATEDB、NOCREATEROLE。实测该角色无业务 users 表 SELECT 权限。Umami 未使用业务数据库初始化。
- 应用幂等业务迁移 `20260920_product_analytics.sql`；确认事件账本与会话证据表存在。
- 部署 Umami 3.4.0 私有服务，服务 ID `6aaf3a1b70d93ba329f9dfa3`。
- 将默认管理员替换为 `sjx18094552` 和随机密码，验证新账户登录成功且默认 admin/umami 不再有效。秘密仅存在本机受限环境文件及运行环境，不写入本记录。
- 创建生产站点 guajiguaji.top 与独立验收站点；独立站点实际接收1次访问和三种里程碑事件，管理员事件 API 能读取。此项不等同于真实业务对话验收。
- 绑定 HTTPS 管理入口 <https://guajiguaji-analytics.zeabur.app>；证书初次签发过程中曾失败，随后 heartbeat 验证返回200，没有跳过证书验证。
- 部署独立每日清理服务 `umami-retention`，服务 ID `6aaf3afd70d93ba329f9dfde`，使用本次 `user-service:dbe0d54` 镜像和已验证的保留期脚本；仅配置独立统计数据库，不配置业务数据库。生产/测试站点首次实际执行均返回 `apply:true, expired:0`；周期86400秒。
- Redis persistence 查询：RDB 最近保存成功，AOF未开启。没有修改现有 Redis 配置。

## 核查发现与待办

- 合并后的镜像构建和安全扫描成功。CI 首次运行 test成功、ui-audit失败：2个登录页截图失败，另9个测试重试后通过；只重跑失败job后，仍有2个登录页截图失败。本地查看实际候选截图为Suspense加载转圈，基线是完整表单；原测试只等待body可见，不能证明lazy页面完成加载。后续修复先等待根App出现及路由/auth加载状态消失，并等待登录表单入场动画结束；不修改基线、截图容差或跳过检查。
- Zeabur user-service 的部署记录虽指向合并SHA，实际 source.dockerfile 固定为旧 `user-service:d5da6cb`；运行容器没有统计模块，公网统计config返回404。需以实际文件/接口和固定镜像核验发布，不能只看部署记录。
- 进一步核对：AI与前端均使用正常Git构建；AI实际存在统计模块，前端容器bundle为 `main.d81a88f6.js`。只有user-service固定了旧镜像；后续修正与验收见下文。
- `sjx18094552` 是新建的 Umami 账户。用户随后提供现有网站登录邮箱；精确查询只匹配一个业务账户，已加入 `ANALYTICS_ADMIN_USER_IDS` 并回读验证，保留既有白名单。本文不记录该账户的邮箱或UUID。
- 可信 Cloudflare IP 链尚未确认；origin HTTP可到达并返回302，不能据Host校验宣称Cloudflare-only。启用时保持 `ANALYTICS_TRUST_PROXY=false`，访客去重可能受代理影响；访问量/转化事件不等同于已验证的独立访客数。
- 用户首次登录后需绑定自己的2FA；未替用户确认或伪造已启用。
- 网站实际新注册→有效回答→AI反馈→结束的完整业务验收尚未完成。

## CI修复验证

- 独立只读复审确认加载状态选择器对应App实际结构，登录tab和Motion结束条件存在；未发现具体问题。
- `git diff --check` 通过。
- 本地默认macOS基线运行4个登录视口：3通过、深色英文1失败；查看后发现旧macOS基线仍有客服悬浮按钮及不同位置，未修改该基线。
- 改用仓库已存在的Linux基线，移动端浅色6个页面及深色英文6个页面逐项报告通过。多项目运行在浏览器切换时停滞，已停止明确属于本轮的测试进程；深色单项目最终报告6通过，但120秒全局时限/插件收尾超时，exit 1。逐项通过不等于整条命令成功，最终以修复PR的Linux CI为准。
- 阻断期间未切换user-service或启用业务开关；PR #60及合并后CI通过后继续执行下述生产步骤。

## PR #60合并后的生产启用

- 用户在本会话确认 PR #60 已合并；提交 `3f7e7f2df50b2a885df239b51237fcd05469498b`。合并后的 [CI](https://github.com/happepls/oral_app/actions/runs/35483693707) 成功，安全扫描成功，PR #60四项检查也全部成功。
- 与PR #59合并提交比较，PR #60只修改E2E与记录，`services/`和`client/src/`运行代码没有变化。
- 从Registry实际读取 `user-service:3f7e7f2` 成功，digest为 `sha256:0a62090ac86d76f50e71558363c65f240ef431f9b2480352b06e46098631fdd4`。该镜像的构建/推送步骤已成功；全量Docker流水线仍在AI依赖构建，不将其标记为整体成功。
- 保留user-service原Dockerfile `FROM ghcr.io/happepls/oral_app/user-service:d5da6cb`，替换为 `FROM ghcr.io/happepls/oral_app/user-service:3f7e7f2` 并部署。部署 `6aaf44cd342483d22ad860c5` 于 `2026-09-20T02:29:23Z` RUNNING；运行统计模块哈希与批准的master一致。
- user-service设置生产Umami URL/网站UUID、开关、专用共享token、管理入口，保留管理员白名单；`ANALYTICS_TRUST_PROXY=false`。
- AI设置相同token与开关。AI自动构建仍在进行，运行容器的 `main.py`、`product_analytics.py`、`quick_experience.py` 哈希逐一与批准master相同；重启现有正确代码以加载环境。未声称待完成的新AI镜像已部署。
- 前端部署 `6aaf42f005eafacd1103b7ee` 已RUNNING，提交为PR #60合并SHA。

## 实际线上验收

- 公网 `GET /api/users/analytics/config` 返回200、`enabled:true`。
- 使用用户授权的管理员账户，在服务端内存中生成60秒诊断JWT，验证真实report路由：Bearer与Cookie均200，匿名401。没有打印/保存JWT，没有读取个人列表；注册/开始/完成人数当时均0，pending/retrying均0，旧账户不回填。
- 真正浏览器打开生产首页，pageview返回204，路径为 `/`，URL测试query没有外发；打开隐私弹窗关闭采集后访问登录页，没有第二条pageview。脚本正常exit 0。
- 使用独立Umami角色查询生产站点，实际已持久化1条pageview（本次验收访问）。
- AI运行中的worker成功处理Redis探针并确认队列条目已删除。探针使用随机、不存在的账户，服务端确认后丢弃，不创建用户、不产生虚假注册或转化事件；此结果证明队列/凭据/HTTP投递，不冒充完整真实用户对话验收。
- Umami公开HTTPS登录及生产网站可见性验证通过。管理员登录信息只保存在本机受限环境文件，默认凭据已失效。
- 最后健康复查曾遇到本机外联TLS/Zeabur EOF瞬时错误；只读重试后公网user-service健康200、管理员报表再次通过、AI容器health200。没有因单次外联异常重启或回滚应用。

回滚：关闭两个业务服务的统计开关；恢复变更前已记录的精确镜像Dockerfile。保留新增账本与统计数据库，不删除业务数据。当前生产配置及后续实际结果以本记录更新为准。
