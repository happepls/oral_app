# 对话实时音频修复与 Stripe 双轨会员计划

状态：approved / implementation in progress。
审批证据：用户于 2026-10-07 在本会话明确回复“批准执行”；授权本文实施与验证，发布仍待人工决策。
日期：2026-10-06。范围与完整实施计划均已在本会话获得批准。

## 1. 已确认目标、证据与边界

- 用户反馈：iPhone/iPad 对话场景实时语音卡顿或无声，历史回放完整。保持短缓冲流式播放。尚无真实场景、故障北京时间、iOS/浏览器版本或生产部署 SHA，不能将代码风险当作已证实的生产根因。
- 支付采用 Stripe 双轨：信用卡继续自动续费；支付宝周卡 $4.99、年卡 $99，一次付款、手动续购。两项统一完成验证后交付。
- 本地 Stripe 只读核验：测试目录存在 USD 499/week、9900/year recurring Prices；测试 payment method configurations 的 Alipay unavailable/off。尚未核验生产资格、价格或部署版本。
- 当前 Checkout 已省略 payment_method_types，但固定 mode=subscription。支付宝方案必须用 mode=payment 和一次性行项目。
- 代码风险：音频在 requestAnimationFrame 内释放，后到的块可先进入调度器；异步转换读取可变 responseId；调度过音频被当作已播放，导致无声时完整录音补播被抑制；AudioContext 解锁未在录音按钮的同步点击阶段执行。
- COS 上传与浏览器播放独立。后端音频 URL 按“最后一个没有 URL 的 AI 消息”绑定存在串轮风险，但未证明上传丢失。本计划修复响应归属并核对完整性，不以播放卡顿推定 COS 数据缺失。
- 保留现有未提交文件。根目录六个 SDLC 工件仍属于 bootstrap，maintenance 未完成；本候选计划不覆盖旧工件。启动新正式循环前按 docs/ai-sdlc.md 核实并处理旧循环，而非伪造完成记录。

## 2. 实时音频实施

主要入口：client/src/pages/Conversation.js、client/src/utils/pcmStreamScheduler.js，以及录音按钮真实点击调用链。

1. 在录音/重播按钮同步用户手势中创建或恢复播放 AudioContext，早于 getUserMedia 等 await；录音 context 与播放 context 分开管理。显式处理 suspended、interrupted、closed 和 resume 失败；页面恢复时保留当前有效音频，恢复失败提供“点击播放”操作。首次欢迎语无法自动解锁时也提供操作，不假定浏览器允许自动播放。
2. 每条响应建立独立播放状态，身份为 connection attempt + responseId + playback generation。接收时立即登记队列位置，Blob 转换和文字显示只能控制释放，不能改变音频到达顺序。捕获身份进入异步回调；切换、取消、重连、卸载后旧回调和定时器全部失效。未知未来响应短暂保留到 turn-start；被取消响应直接丢弃；无 responseId 的旧包仅绑定当前唯一有效响应。
3. 初始缓冲设为 320ms，时间调度提前量 40ms。每轮发生 underrun 后将重缓冲阈值增加 160ms，上限 800ms；新响应恢复 320ms。保持连续时间线，合并待调度小块以减少 source 数量；保留 PCM16 奇数字节拼接。done 在之前所有入队转换结束后 flush，低于阈值的尾部也完整播放；迟到旧 done 不结束新回复。
4. 分离 received、scheduled、playing、completed、blocked、failed、cancelled，按响应记录。只有 context 正在运行且播放时间线实际推进，才视为开始播放；仅收到/调度不能设置 audioPlayed。完全未开始的有效回复可用完整 COS 录音补播一次；已经播放部分的失败回复显示重播操作，不自动重播整段造成重复。用户打断、重播、换任务后不触发旧轮补播。
5. 保持现有 WS 二进制协议和业务单连接约束。音频 URL 按 responseId 绑定前后端消息；已携带 ID 却尚未找到消息时暂存，禁止退回绑定另一轮。后端上传任务捕获该轮 PCM、responseId 和消息身份，上传完成后严格绑定；检查音频字节数、样本时长及消息归属。仅增加脱敏诊断指标：首音频等待、缓冲、underrun、context 状态、接收/播放样本数及结果，不记录用户语音或对话内容。

## 3. Stripe 双轨、订单与会员权益

### Checkout 与目录接口

- POST /api/stripe/checkout 保留 priceId、promotionCode，新增 billingMode=subscription|prepaid，缺省 subscription，兼容旧客户端。客户端不传金额、货币或会员天数。
- prepaid 只接受服务端验证的 guaji_ai 有效 weekly/annual 套餐；关联一次性行项目，固定 USD 499/9900，product 复用已验证的现有产品。可用服务端 price_data 创建一次性项目，不将 recurring Price 直接传入 payment mode，不自动修改 Stripe 商品。
- 付款前校验生产目录对应套餐金额和币种；不匹配则暂不销售该固定套餐，报告配置差异。优惠码继续使用现有服务端验证与 Stripe discounts，以最终已确认付款为准。动态支付方式继续由 Dashboard/configuration 控制，不添加 payment_method_types。
- 产品目录向后兼容，附加 prepaidOffers（套餐、金额、币种、期限），仅在该环境配置核验完成并开启独立开关后返回可购买状态。单次付款 Checkout 必须实际展示支付宝；信用卡仍可由 Stripe 动态展示，不承诺专用支付宝入口必定唯一展示该方式。
- 新增已认证 GET /api/stripe/checkout/:sessionId/status，仅返回该用户订单的 pending|fulfilled|failed|expired 状态与有效权益；其他用户订单不可读。成功页只有服务端确认 fulfilled 后展示开通成功，挂起显示处理中并提供重试，不因 URL 存在 session_id 宣告成功。

### 数据与履约

- 新增 prepaid_orders：本地订单 ID、user_id、套餐/金额/币种快照、创建时间、支付确认时间、Checkout Session/PaymentIntent ID、状态、授予期限和退款金额。Stripe 标识建立唯一约束。Checkout 请求支持每次用户购买操作的幂等键；数据库订单和 Stripe create 共用稳定身份，网络重试复用订单。
- 新增独立 stripe_subscription_status 及 prepaid_expires_at；现有 subscription_status 作为有效权益输出兼容字段。迁移从旧状态初始化订阅状态，保留旧 active 用户的行为；新 prepaid 支付不伪造 stripe_subscription_id。
- Webhook 保持 raw body 和官方签名验证。subscription 事件更新订阅来源；payment 事件按本地订单身份处理，核验 mode、用户/customer、套餐、币种、最终金额、livemode 和 payment_status。处理 checkout.session.completed 与 async_payment_succeeded；unpaid、failed、expired 不授予权益。经核验的全额优惠订单可以 no_payment_required 履约。
- 在一个数据库事务内锁订单与用户、记录履约、更新期限；重复和并发回调只授予一次。周卡增加 7×24 小时，年卡增加 UTC 日历一年，闰日夹到目标月最后一天。从 max(支付确认时间, 既有 prepaid 到期时间) 续接；乱序回调按支付确认时间和稳定订单 ID 重算订单账本，避免处理顺序改变期限。
- 有效权益 = 订阅来源 active/trialing 或未退款 prepaid 期限未到。所有 profile/auth/订阅查询、AI 用户上下文、每日额度、Daily QA、音色门控和开发者资料接口使用同一来源的有效状态。长连接每次受限操作重新检查 prepaid 到期；仅有效预付过期不能被缓存的 active 状态继续放行。无需等待 cron 才失效。
- v1 禁止自动续费订阅与有效 prepaid 同时购买，前后端均校验：订阅有效时不卖 prepaid；prepaid 有效时可续购 prepaid，开启自动订阅须待预付到期。创建订阅已处于 incomplete/处理中时也不能开始另一轨。已有未完成 Checkout 复用或明确到期后再创建，不修改用户现有自动订阅。
- 接收成功退款事件：全额退款撤销对应预付授予并从未退款订单重算期限，不影响独立订阅权益；部分退款记录金额并保留原期限。退款失败不撤销。处理退款早于履约的乱序；重复退款不得重复扣除。此改动不发起真实退款。

### 页面与兼容

- 订阅页按套餐显示“自动续费”和“单次购买”，后者明确支付宝、期限和不自动扣费。会员页区分来源、到期时间；prepaid 可手动续购，Stripe Portal 仅用于真实订阅。
- 保留 Cookie/Bearer 认证、credentials、订阅查询 soft-fail、价格失败时禁购、跳转域名白名单及九语言翻译。采用现有页面组件和 tokens；仓库 figma_app_template/src 不存在，使用实际 design-system 目录作为参考并记录缺失。
- GET /api/stripe/subscription 保留 subscription/status，并附加 billing source、prepaid expiry、是否允许续购；Profile 返回有效 subscription_status 和来源字段供旧页面兼容。表迁移是增量式，先服务端兼容，再客户端。前端在到期时刷新资料，服务端始终是权限依据。

## 4. 验证与验收

- 音频：通过真实页面 handler 测试 PCM 到达先于文本、首批在 rAF 前后交错、Blob 乱序完成、旧 generation、旧 done、短尾 flush、多次 underrun、context suspended/interrupted/恢复失败、COS URL 早到/迟到、无声补播、部分播放重播、主动打断和仅一个业务 WS。测试输入输出样本数与顺序一致，不能只复制实现公式。
- 设备：Playwright WebKit 做流程回归，再以真实 iPhone/iPad Safari 验收至少 10 个未主动打断的完整回复，覆盖欢迎、短/长句、文字编辑重说、录音打断、页面后台恢复和 Wi-Fi/移动网络切换。正常网络应完整、无自动重复和无静默失败；抖动测试每个样本保留且能恢复，真实断线明确提示。记录首音频延迟与 underrun，不用模拟测试声称已听音通过。
- 支付：测试单次/订阅 mode 分流、金额/产品篡改、跨用户查询、Cookie/Bearer、优惠码、重复请求与并发回调、未付款/迟到/乱序/失败事件、支付成功但未返回网页、7 天/闰年/年末/到期瞬间、预付续购、双轨互斥、退款和 test/live 隔离。测试完整 DB→profile→AI context→限额/Pro 页面链路，覆盖长连接跨到期。
- 执行受影响服务测试、AI pytest（权益与上传归属改变）、场景 mock 契约、client 测试/lint/build、UI 检查、数据库迁移测试和 npm run verify。提交前运行 staged gitleaks。未执行项目不得写为通过。
- 当前实际基线：`CI=true npm --prefix client test -- --watchAll=false --runInBand --runTestsByPath src/utils/pcmStreamScheduler.test.js src/__tests__/audio-playback-logic.test.js`，exit 0，2 suites / 19 tests passed。`python3 scripts/sdlc.py validate`，exit 0。支付新实现和生产验收尚未执行。

## 5. 发布、审批与回滚

- 独立音频修复与 prepaid 开关，统一交付验收；不擅自先发布其中一项。先验证备份与迁移，再发布兼容后端（user/AI/comms 按实际改动），之后构建并发布 client，核对 host/container/HTTP bundle hash 和实际部署 SHA。
- 支付开关默认关闭。启用前必须在目标 live Dashboard 确认 Alipay 可用、付款方式已启用、USD/套餐金额正确、webhook 事件已配置并通过测试环境端到端。不将测试配置 off 等同于生产不可用，也不自动更改 Dashboard。
- 两项最终验证通过后打开人工评审 PR；合并、Zeabur 发布及真实支付验收仍由人工决定。上线证据关联真实场景、北京时间、设备、订单和部署版本。
- 回滚先禁用新的 prepaid 下单入口，保留已付订单履约和权益读取；数据库新表/列不删除。音频可恢复旧调度，但保持响应身份隔离与可手动重播。禁止回退到不识别已售 prepaid 权益的旧后端；必要时提供兼容补偿版本。
- 开始业务实现前需要完整计划审批。依据 .agents/skills/oral-app-sdlc/SKILL.md："stop after plan.md is ready; Build needs explicit plan approval and evidence"，以及 AGENTS.md 的计划执行人工批准规则。本会话于 2026-10-07 已批准本文实施与验证；生产迁移、合并和发布仍待人工决策。

参考：[Alipay Checkout](https://docs.stripe.com/payments/alipay)、[Checkout 履约](https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted)、docs/ai-sdlc.md。
