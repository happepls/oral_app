# 音频与支付宝双轨实施验证

日期：2026-10-07。分支：`fix/conversation-audio-alipay`。
授权：本会话“批准执行”；对应 [完整计划](2026-10-06-conversation-audio-alipay.md)。本记录不覆盖根目录 bootstrap 工件，不声明生产修复已验证。

## 已实现

- WS binary Blob 在接收时交给有序响应路由，避免包装器转换先完成者抢跑。音频按 responseId 隔离，取消使旧异步操作失效；320ms 首缓冲、抖动后有界重缓冲，done 释放短尾。
- 录音按钮同步恢复 AudioContext。恢复失败保留 PCM，页面提供“点击恢复语音播放”；已调度与实际播放分别记录，阻止完整录音重复自动播放。COS 上传缓冲与 URL 按响应隔离。
- 信用卡 Checkout 保留订阅；支付宝固定周卡 USD499/年卡 USD9900 使用 payment 模式的一次性项目。付款方式从 Stripe Dashboard 动态提供，功能默认关闭，不能从测试配置推定生产资格。
- PostgreSQL 本地订单、请求幂等、同用户行锁、签名 webhook、支付身份/金额/币种/模式核验、乱序/重复履约、退款重算、7天与日历年期限。独立订阅来源与 prepaid 期限共同决定权益，长连接受限操作重新检查到期。
- 预付会员到期显示、手动续购、成功页等待服务器 fulfilled；Cookie/Bearer 鉴权与跨用户订单隔离。

## 实际检查

| 检查 | 命令/结果 |
|---|---|
| User 全量（含真实 PostgreSQL） | `PREPAID_TEST_DATABASE_URL=<disposable-db> npm test -- --runInBand`：23 suites，217 passed，17 skipped（原有非本次集成测试） |
| Client 单元 | `CI=true npm --prefix client test -- --watchAll=false --runInBand`：54 suites，603 passed |
| AI | `.venv/bin/python -m pytest services/ai-omni-service/tests -q`：314 passed；12 原有弃用警告。包含实际 callback 的交错响应上传与 cached context 跨到期反例 |
| Developer API | 在服务目录 `npm test -- --runInBand`：22 passed |
| 场景契约 | `python3 test_scenario_batch_and_daily_qa.py --scenario all --mock`：25 passed |
| 浏览器 | `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5003 npm --prefix client run test:e2e -- e2e/audio-prepaid.spec.js --project=webkit-mobile --project=chromium-390`：6 passed |
| 仓库质量 | `npm run verify`：pass / 100；`python3 scripts/sdlc.py validate`：clean |
| 构建 | `npm --prefix client run build` 成功，有仓库既有 lint 警告；`docker compose build ai-omni-service user-service` 成功，仅构建未部署 |
| 静态与密钥检查 | scoped ESLint：0 errors / 4既有 warnings；`git diff --check` clean；提交前 `gitleaks git --staged --verbose --config .gitleaks.toml` 与 pre-commit scan 均无泄漏 |

PostgreSQL 测试使用隔离临时容器及独立 schema，无生产写入。Stripe API 边界由模拟器替代，签名验证使用官方 SDK；不能视为真实 Stripe Checkout 支付验收。迁移重复执行、真实默认新用户、重复并发履约、退款先到、身份篡改、订单互斥均覆盖。

浏览器经过实际 WebSocket 包装器→Conversation→路由→调度器，以模拟 AudioContext 检查8680个PCM样本的完整顺序、下一响应短尾、旧响应忽略及用户手势恢复；并检查订单处理中不提前报成功。WebKit移动截图人工查看，无横向溢出，axe 无 serious/critical。截图与trace位于忽略目录 `quality/artifacts/playwright-results/`。

独立只读审查的五项发现已修复；另修复 Checkout `expires_at` 卡30分钟最小边界，改1小时并加入跨秒延迟验证。审查未发现未关闭 high/critical；其独立执行4 suites/20 tests通过。

## 发布条件与回滚

### 最新 master 集成

PR 创建后发现 master 已包含 PR69–72（Qwen3.8/current-turn teaching/audio evidence）。在 `/tmp/oral-audio-alipay-review` 隔离工作区合并 `4765da6`，未修改用户原工作区的未提交文件；Conversation 与 AI 自动合并无文本冲突。集成回归：client55 suites/634 tests、AI368 tests、六项 Chromium/WebKit 回归及 client build 全通过。初次隔离 `npm run verify` 因缺服务 node_modules / Python环境失败，随后链接本机依赖重跑；不是将失败伪记为通过。

依赖补齐后集成 `npm run verify` 再次 pass/100；集成 AI Docker镜像构建成功；staged gitleaks clean。独立集成复审额外跑 AI teaching/audio52项与client14项通过，无未关闭high/critical。PR最终代码在隔离工作区，原工作区保留原提交及用户dirty文件，未强制更新覆盖。

首轮 GitHub CI 全量test与两项SDLC checks通过，UI audit7项失败：3个订阅截图因支付宝关闭时仍增加说明改变高度，4个教学用例仅发送171ms音频却未发送done。修正为仅在提供双轨时展示新增说明，原信用卡页面保持原截图；教学fixture补完整短回复的done事件。未放宽断言或替换截图。客户端634项再次通过，320px与desktop订阅截图/教学回归通过，CI需要重跑确认。

1. 人工评审 PR；禁止自动合并或直推 master。真实 iPhone/iPad Safari 至少10轮听音、后台恢复和网络切换尚未执行，不能声明线上卡顿已消失。
2. 备份目标数据库后，在 user-service 运行 `node src/scripts/migrate-prepaid.js`。增量迁移初始化已有来源，新增默认free与NOT NULL；先后端再前端。此命令尚未对生产执行。
3. live Stripe 核对产品 metadata、weekly499/year9900 USD目录、Dashboard Alipay资格及开启状态。Webhook 配置 completed、async_payment_succeeded、async_payment_failed、expired、charge.refunded 和原订阅事件，保留 raw body/签名校验与 WAF Skip。
4. 测试模式实际支付宝成功/取消、重复通知、退款验收后，人工决定设置 `STRIPE_PREPAID_ENABLED=true`（user-service环境变量）。当前默认关闭，无新价格对象或真实支付创建。
5. 后端兼容权益与迁移验证后统一发布两项，再发布 client并核对host/container/HTTP bundle hash、真实场景及部署SHA。尚未发布。
6. 回滚先关闭新 prepaid 销售，保留订单履约、独立权益和数据库新增列/表。禁止回退至不识别已售预付权益的旧后端；音频回退仍须保留响应身份隔离。

后续验收记录必须关联实际设备、北京时间、场景、订单和部署SHA，不记录用户对话原文或密钥。

## 本地 Checkout 验收后修正

用户实测支付宝年卡支付成功，并要求套餐页只保留立即订阅、直接进入 Stripe Checkout。启用预付资格时，新购买入口使用一次付款 Session，Stripe 动态展示信用卡、支付宝等符合条件的方式；同一入口不承诺信用卡自动续费。预付未启用/不可用时保留既有订阅入口；已有自动续费会员仍可管理原订阅。

- 实际沙盒订单已 fulfilled，数据库与 cookie 认证会员接口均为 active/prepaid，有效期至 2027-10-07T14:24:48Z。此前立即订阅按钮属于预付会员续购入口，标签造成误解，并非支付失败。
- 有效会员的套餐按钮显示已订阅且禁用；预付续购须点击明确的续购会员入口。成功回跳保留开通确认与有效期，等待履约期间禁止发起另一笔购买。
- 成功状态使用服务端会员快照，不再被旧认证缓存或迟到的订阅查询覆盖；页面回到前台重新查询会员状态。
- 旧 409 为不同计费方式的待付款订单冲突。显式切换先在用户锁内恢复原幂等请求，再关闭仅 open/unpaid 的 Session；已付款/处理中的订单及不确定失败保持原预约，返回明确处理状态。
- User 全量含真实 PostgreSQL：23 suites、223 passed、17 原有 skipped。Client 全量：55 suites、634 passed；构建成功（原有告警）。新增付款回归 Chromium 320px/desktop、WebKit mobile 共 9/9 通过，覆盖直接请求、主动续购、履约确认、迟到旧查询、无横向溢出和 axe serious/critical。
- 真实浏览器、实际已付款测试账号、无 API mock：会员有效期可见，两个已订阅按钮禁用，立即订阅按钮数量为 0。另用未付款测试账号点击立即订阅，真实跳转 checkout.stripe.com，Session 为 payment，动态方式共 8 种，含 card/alipay；未支付并主动关闭该探针订单。
- 自动浏览器初始验收脚本未恢复登录缓存，另一次在目录未完成加载时过早计数；修正脚本初始化与等待条件后完成上述实际页面验证，未把失败记录算作通过。

本地前端 bundle 已重新构建并通过 host/HTTP hash 核验，后端容器源文件与修正源码一致。生产没有发布。用户实际支付宝成功已有 Stripe webhook→订单履约→数据库→会员接口证据；真实 iPhone/iPad 听音验收、live 支付及退款验收仍须单独执行。
