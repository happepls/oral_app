# 产品统计实施验证（2026-09-20）

实现批准：本会话用户“批准实施”。需求：#58；PR：<https://github.com/happepls/oral_app/pull/59>。
核心行为版本：`630c47807288d7461a119f42435bf40062f20465`；随后补充静态tour禁止统计fetch、注册默认快速面试的开始/完成采集及回归测试，综合验证已重跑。
对照主分支：`ff80676f6605e49e9ec0357d81fd70e3b2638257`。

## Ran

| 命令/验证 | 实际结果 |
| --- | --- |
| `npm run verify` | exit 0，pass，100；前端569测试通过；user-service162通过、3条既有跳过；ai-omni242通过；其他 verifier 项通过 |
| `.venv/bin/python -m pytest services/ai-omni-service/tests/test_quick_experience.py services/ai-omni-service/tests/test_analytics_hooks.py services/ai-omni-service/tests/test_product_analytics.py -q` | exit 0，28通过；覆盖默认快速面试、反馈失败、保存失败后重试及统计故障隔离 |
| user-service: `npm test -- --runInBand productAnalytics` | 9通过，涵盖普通账户拒绝、管理员 Cookie/Bearer、过期凭据、隐私字段筛除、投递重试 |
| `.venv/bin/python -m pytest services/ai-omni-service/tests/test_analytics_hooks.py services/ai-omni-service/tests/test_product_analytics.py -q` | exit 0，18通过，包括真实 callback 入口、欢迎语排除、ASR时序、模式、Redis重试、刷新后延迟恢复结束凭证 |
| client: `CI=true npm test -- --watchAll=false --runInBand ProductAnalytics` | exit 0，5通过，包括静态tour零统计请求 |
| user-service: `node src/scripts/test-product-analytics-db.js` | exit 0；实际隔离 PostgreSQL 验证幂等迁移、无旧用户回填、注册事务回滚、先结束后配对乱序、过时结束、跨用户隔离、6路并发去重、账号删除级联、跨日队列与7天分母 |
| user-service: `node src/scripts/smoke-umami.js` | exit 0；真实固定镜像 Umami 3.4.0：1次pageview及3种事件各1条，管理员事件 API 可读取；将1条测试事件设为91天前后，保留期脚本仅删除该条，余3条保留 |
| client: `npx playwright test e2e/product-analytics.spec.js --project=chromium-390 --project=chromium-desktop` | exit 0，2通过；隐私开关关闭后再次导航不采集，query不外发，无水平溢出；已查看移动端截图 |
| client: `npm run build` | exit 0；已有 lint/Browserslist 警告，产物已重建 |
| `docker compose build user-service ai-omni-service` | exit 0；仅重建本地镜像，没有重启应用或部署生产 |
| `python3 test_scenario_batch_and_daily_qa.py --scenario all --mock` | exit 0，25通过 |
| `npm run lint` | exit 0，32条既有warning，0error |
| `docker compose -f deploy/umami.compose.yml config --quiet` | exit 0，使用临时进程环境中的测试配置，没有输出或存储凭据 |
| `gitleaks git --staged --verbose --config .gitleaks.toml` | exit 0，无泄漏；提交hook再次扫描通过 |
| `git diff --check` | exit 0 |

真实 Umami 冒烟使用新建的本地临时数据库及独立容器，完成后清理；不连接生产 DATABASE_URL，不发送真实用户数据。该结果证明本地协议、持久化、管理员读取和保留期代码，不证明生产部署。

## 修复与复审

独立只读 reviewer 沿调用链审查 auth、data、scoring、ui、websocket_audio，最终无未解决高/中风险问题，建议提交 PR。修复了旧空会话结束拼接后续轮次、复习模式复用会话、代理后全站共享限流、Redis短暂不可用丢事件、刷新丢结束凭证及首次恢复早于后台持久化的竞态。

核对 Register 默认跳转后补齐快速面试。复审发现反馈保存失败后内存残留可能使重试误报完成，已在保存失败时清空未持久化反馈；回归验证重新生成并保存成功后才记完成。修复后复审无未解决高/中风险问题，重跑综合验证与 ai-omni Docker 构建通过。

验证期间发现新增认证测试导入现有 hourly token sweeper 导致 Jest 不退出；停止了明确仍存活的本轮测试进程，在测试中隔离该后台定时器，然后重跑综合验证通过。没有改生产认证行为。早期 `CI=true npm run build` 因既有警告视作错误而exit 1；按仓库标准 `npm run build`及综合verifier重跑成功。早期Playwright初始化脚本每次整页导航清空localStorage，误清了隐私偏好；修正测试初始化后两端通过。

## 未完成与发布门槛

- GitHub 最终提交 CI 结果以 PR checks 为准，不用本地成功替代。
- 根 SDLC 工件仍属于 `ai-native-sdlc-bootstrap`，其历史验收未被本需求覆盖。`scripts/sdlc-review.py --base origin/master --head HEAD` 实际报告旧根 release 的 base/head 和风险字段不匹配本 PR；现有治理 workflow 为 shadow，绿色包装检查不等于新的工件链已闭环。维护者需衔接当前循环，本 PR 保持草稿，不伪造旧循环的发布/维护完成。
- 未配置真实 Umami 服务、管理员账户、生产网站 UUID、专用 token、可信 Cloudflare IP 入口、每日保留期任务，未执行生产迁移或发布。
- 未验证 guajiguaji.top 实际流量/新注册账户的全链路看板可见性；用户原始目标仍未完成。
- 本轮只读生产检查：`https://guajiguaji.top/api/users/analytics/config` 返回404，确认不能声称已上线。
- 已知边界：Redis故障同时AI进程重启可能丢未持久化证据；Umami确认丢失可能重复投递；离线浏览器结束按服务端收到时间归入转化。精确去重账本和统计口径见 `docs/product-analytics.md`。

发布/回滚步骤、权限、配置名称和验收要求见 `docs/product-analytics.md`；合并及生产配置必须由人工批准。
