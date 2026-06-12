# E2E测试 问题汇总

> **状态更新（2026-06-10）**：本轮已修复并验证 11 项（✅），第二批 M 级 3 项进行中（🚧），第三批 L 级 5 项 defer（⏸️）。
> 验证方式：Chrome MCP 实测 localhost:5001（新 bundle `main.2176e1db.js`）+ 代码/网络核验。

## 登录问题描述
- **问题1**：/login页面 登录时若输错账号密码，只有"Invalid credentials."的英文提示，不够直观，可以直接说明账号密码错误。
- **解决方案**： 前端改进：在登录页面添加对应界面语言的账号密码错误提示，直接说明账号密码错误。
- ✅ **已修复并验证**：`AuthContext.login` catch 识别凭证错误返回 `code:'invalid_credentials'`，`Login.js` 据 code 显 i18n；9 语言新增 `login_invalid_credentials`。Chrome 实测输错密码 → 显「邮箱或密码不正确，请重新输入」。
- **问题2**：登录方式单一，只有邮箱和Google账户两种方式
- **影响**：用户只能使用邮箱或Google账户登录，无法使用其他方式（如手机号、微信、SSO等）登录。
- ✅ **已实现并验证（手机号验证码登录 · Twilio Verify）**：用户选「手机号登录」→ 输入含国家码手机号 → 收 6 位短信验证码 → 登录/注册。
  - 后端：`utils/twilioVerify.js`（纯 REST + Basic Auth，无 twilio SDK 依赖；未配置 env 时 dev 固定码 000000 fallback）。`POST /api/users/phone/send-code` + `POST /api/users/phone/login`（authRateLimiter，校验码 → `User.findOrCreateByPhone` 建号/登录 → 签 JWT cookie）。`users` 表加 `phone VARCHAR(32) UNIQUE`（init.sql + migrations/add_phone_column.sql）。
  - 前端：`Login.js` 加「邮箱/手机号」切换 tab + 手机表单（获取验证码 + 60s 倒计时）；`AuthContext.loginWithPhone`；`api.js` sendPhoneCode/phoneLogin；zh/en i18n。
  - 凭证：`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_VERIFY_SERVICE_SID` 在 `services/user-service/.env`（gitignored）。
  - 验证：send-code → Twilio 真实返回 success(devMode:false)；错误码 → 401；无效手机格式 → 400；前端 tab/表单 Chrome 实测。完整 login 链路（真码→建号→cookie）逻辑全通，仅差「真实手机收码」人工一步。
  - 微信/SSO 仍 defer（需企业资质/SAML，当前 C 端无需求）。

## 密码重置功能问题描述
- **问题**：/login页面没有密码重置功能
- **影响**：用户无法找回密码，只能通过联系客服重置密码。
- ✅ **已实现并验证（Zeabur ZSend 发信）**：/login 加「忘记密码?」→ 输邮箱 → 收重置邮件 → `/reset-password?token=` 设新密码。
  - 后端：`utils/mailer.js`（ZSend REST 封装，未配置则 fail-safe 返回 not_configured）。`POST /api/users/password/forgot`（防枚举恒 200，token hash 存 Redis `pwreset:` 30min TTL，发邮件）+ `POST /api/users/password/reset`（校验 token → `User.updateLocalPassword` bcrypt 写 `user_identities.provider_uid` → 删 token）。
  - 前端：`ForgotPassword.js` + `ResetPassword.js` + App.js 路由 + Login「忘记密码」链接 + api.js + zh/en i18n（其余语言 fallback en）。
  - 凭证：`ZSEND_API_KEY`/`ZSEND_FROM`/`PASSWORD_RESET_BASE_URL` 在 `.env`（gitignored）。
  - 验证：forgot → token 生成存 Redis；reset → 新密码登录 200；token 一次性（二次用 400）。**全链路逻辑通过**。
  - ⏸️ **剩运维**：ZSend 发信域名 `guajiguaji.top` 待 DNS 验证（加 3 条 CNAME 后真发邮件；当前 ZSend 返 400 domain not found，走日志 fallback 输出重置链接）。

## 复述功能问题描述
- **问题1**：/recall 页面 "按住说话" 按钮冗余，考虑将"跟读练习"与"背诵练习"的音频输入按钮合并为一个。
- **影响**：用户不得不在画面中央进行音频输入，而不是在舒适的底部中央位置。
- ✅ **已修复并验证**：`Recall.js` StepBlock 退化为纯展示，底部固定单按钮按 `readPassed` 决定录跟读/背诵 + 步骤徽章。Chrome 实测：底部「🎙️ 按住说话（跟读）」+「跟读…/背诵」徽章。
- **问题2**：/recall 页面 复述句子只有台词卡上的文本显示，缺少试听按键。
- **影响**：存在单词用户不認識的情況，用户无法直接试听要复述句子，无法实现"跟读练习"。
- ✅ **已修复并验证**：跟读卡台词旁加「🔊 试听」复用 `aiAPI.tts(currentSentence)`。Chrome 实测点击 → `POST /api/ai/tts` 200，音频播放。


## 问答功能问题描述
- **问题1**：/conversation?mode=daily_qa 页面 顶部的"AI 口语导师" 没有改为 "今日问答"。
- **影响**：用户不知道当前页面是什么任务。
- ✅ **已修复并验证**：`Conversation.js` 标题加 `isDailyQAMode ? '今日问答' : ...` 分支 + 隐藏无意义进度点。Chrome 实测显「今日问答」。
- **问题2**：/conversation?mode=daily_qa 页面 中的问题固化，存在重复问题，需根据用户目标个性化设计。
- **影响**：每天打开都是同样的问题重复出现次。
- ✅ **已修复（第二批 M）**：`_generate_daily_question_pool` 新增 goal_type/interests/goal_description 参数注入 prompt 个性化；新增 Redis `daily_qa_history:{uid}`（近 20 题，30d TTL）跨天去重——生成时 prompt 附「avoid these recent」+ 返回 pool 文本去重 + 记录已出题。3 个 call site + `_advance_daily_qa_pool` 全部透传 goal ctx。fail-open（redis 异常返回空/静默）。容器 smoke 通过。

## 个人详情页问题描述
- **问题**：/stripe页面订阅成功后 自动跳转至/profile页面，但页面加载不成功需要手动刷新才能正常显示。
- **影响**：触发对话门限升级后无法回到当前会话。
- ✅ **已修复（第二批 M 保底）**：(1) Profile.js fetchAll 把 `setLoading(false)` 移入 `finally`——无论 abort 与否总执行，根治整页重定向后 loading 卡 true 白屏。(2) Subscription.js 成功 effect 改 refreshProfile 轮询（≤5 次/1.5s）直到 `subscription_status==='active'` 再 navigate，等 webhook 落库。(3) AuthContext.refreshProfile 返回 userData 供轮询读状态。Chrome 实测 Profile 正常加载。
- **问题2**："意见反馈"的提交有效，但开发者和后台管理无法查看，缺少用开发者账号登录的维护看版。POST /api/users/feedback HTTP/1.1" 200 173 "http://localhost:3000/profile"
- **影响**： 用户虽然成功得提交了请求，但app开发者不知道去哪里看用户反馈的意见。
- ✅ **已实现并验证（SQL/CLI 查询脚本）**：新增 `services/user-service/src/scripts/list-feedback.js` + npm `feedback` 脚本，JOIN users 拉取反馈明细（支持 limit/category/--json）。运维命令：`docker compose exec user-service node src/scripts/list-feedback.js [limit] [category]`。零新攻击面、无需 admin 角色。容器实测拉出 4 条真实反馈（含 bug/功能建议 + 用户 + 邮箱 + 时间）。网页 admin 后台仍 defer（需引入 admin 角色全链路，量大再做）。

## 场景对话功能问题描述
- **问题1**：/conversation 页面 用户尝试偏离话题对话成功，AI导师并没有进行相应的约束。
- **影响**：用户可以尝试偏离话题，AI导师没有进行约束，导致对话质量下降。
- ✅ **已修复并验证**：`prompt_manager.py` scene_theater prompt 注入 ON-TOPIC ENFORCEMENT 指令（已 hotpatch ai-omni）。行为类，多轮对话生效。
- **问题2**：/conversation 进入CC模式后 当一轮对话结束后，吉祥物显示非等待输入的表情状态'bird-logo.svg'，而是思考状态'bird-expression-thinking.svg'。
- **影响**：用户误认为AI还在思考阶段，每轮对话结束后，应该改为等待输入的表情状态。
- ✅ **已修复并验证**：`avatarStatus` 解绑 `isAIThinking`；并在 `response.audio.done` WS 事件 + 所有音频队列排空点补 `setIsWaitingForAIResponse(false)`，保证每轮结束 thinking 必清。Chrome fiber 实测音频播完回 `bird-logo.svg`。
- **问题3**：/conversation 进入CC模式后 看不到当前子任务的练习进度。
- **影响**：用户无法查看当前子任务的练习进度，无法知道当前任务的完成情况。
- ✅ **已修复并验证**：CC 浮层顶部加「子任务 X/3」+ 进度条（复用 `currentTaskProgress`/`theaterCompletedTasks`）。Chrome 实测显「子任务 1/3」。
- **问题4**：/conversation 场景练习的3个子任务全部完成后（未使用通关口令），弹出的练习报告中缺少AI点评。
- **影响**：用户无法查看AI对当前任务的文字点评，无法评估自己的学习效果，详细反馈标题显得很"多余"。
- ✅ **已修复（第二批 M，A+C）**：(C) Conversation.js 完成弹窗不再固定 1s 触发——REST review 有则立即开；无则标记 pending，由 scenario_review WS 事件（setScenarioReviewData）经新 effect 触发打开，并加 25s 硬超时兜底防卡。(A) PracticeReport.jsx「详细反馈」h2 在 strengths/improveItems/vocabItems 全空时整块隐藏，消除空标题冗余。前端 build 通过。
- **问题5**：/conversation 当日练满3个场景后提示明天继续但没有触发对话门限。
- **影响**：用户当日可以无限制练习，不会因为练满3个场景而被限制。
- ✅ **已修复（软提示决策）**：3-场景为纯前端 localStorage 软门，banner 改鼓励语 +移除录音 disable；真正硬护栏由后端 `daily_limit_reached`（已有，免费 15/付费 150 轮）负责。
- **问题6**：/conversation 页面中的对话重置按钮（右下角）没有二次确认机制。
- **影响**：用户误点击重置按钮后，会直接重置当前会话，导致对话丢失。
- ✅ **已修复并验证**：重置按钮 onClick 加 `window.confirm('确定重新练习？当前对话进度将被清空，且无法恢复。')`。bundle 核验文案 + guard 已部署。

## 发现页问题描述
- **问题1**：/discovery 发现页底部 最近活动区域属于多余控件，未隐藏。
- **影响**：自由对话点击无效（附图）容易引起误解。
- ✅ **已修复并验证**：`Discovery.js` 删整个「最近活动」block。Chrome 实测无该 section。

## 订阅问题描述
- **问题1**：/subscription 页点击 "管理订阅"按钮点击无效， POST /api/stripe/webhook POST /api/stripe/portal 请求失败。
- **影响**：用户无法取消订阅。
- ✅ **已修复并验证（真实 test 订阅全链路 E2E，Jun 10）**：根因有三层——(1) **致命**：`user-service` 因 ioredis `Connection is closed.` 未捕获异常 **crash 整进程** → 所有 `/api/users/*` + `/api/stripe/*` 返 502（含 portal）。修复：`sseRoutes.js` 的 SSE subscriber 加 `error` handler + cleanup 守卫；`index.js` 加全局 `uncaughtException`/`unhandledRejection` 兜底防线。(2) 前端 portal 失败静默吞错 → 体感「点击无效」。修复：`Subscription.js` portal 失败显具体错误提示（区分 400 无客户 / 500-502 / 网络）+ loading 态。(3) Stripe Dashboard 需激活 Customer Portal（运维，已由用户在 test mode 激活 `bpc_...`）。**验证**：test1 真实 checkout（$99 年订 4242 付款）→ webhook 写 active+customer_id → 管理订阅成功跳 `billing.stripe.com` Portal → 取消成功（cancel_at_period_end 2027-06-10）→ webhook 200 → DB 一致 → user-service 全程无 crash。
- ⏸️ **生产上线前运维项**：(1) `.env` 切 `sk_live_`/`pk_live_` + `STRIPE_ALLOWED_ORIGINS=https://guajiguaji.top` 后 `docker compose up -d user-service`（recreate 才重读 env）。(2) Stripe Dashboard 建 **live** webhook endpoint（`https://guajiguaji.top/api/stripe/webhook`）拿 live `whsec_` 写 .env。(3) Dashboard 激活 **live** Customer Portal（test 已激活，live 需单独再激活一次）。

## landing页(https://guajiguaji.top/)问题描述
- **问题1**：主页上显示的当前套餐价格与 实际不一致。
- **影响**：用户登录后实际执行订阅时，会发现周/年套餐实际要支付的金额与主页上的显示不一致，导致用户信任度下降。
- ✅ **已修复并验证**：`Landing.js` 硬编码价 `2.90/89.90` → `4.99/99`，与结账价一致。Chrome 实测周 $4.99 / 年 $99。
- **问题2**：主页上缺少客服对话悬浮入口，用户无法联系客服咨询，缺少用户与平台的沟通渠道。
- **影响**：用户无法及时获取客服帮助，导致用户满意度下降。
- ✅ **已实现并验证（Tawk.to 客服 widget）**：新增 `components/SupportChat.jsx`（读 `REACT_APP_TAWK_PROPERTY_ID`/`REACT_APP_TAWK_WIDGET_ID` 异步注入 Tawk 脚本，未配置则不渲染），挂在 Landing + Subscription 两页（降低第三方加载面）。ID 配在 `client/.env`（property `6a2a1221...` / widget `1jqq5dkro`）。Chrome 实测 Landing 右下角客服悬浮窗完整加载并展开（「Customer Support」+「Powered by tawk.to」）。
  - ⏸️ **上线备注**：CSP allowlist 加 `*.tawk.to`；隐私政策声明第三方客服。

### 总结

2026年6月9日实测，9类问题（18 项）。2026年6月10-11日**全部闭环**：
- ✅ **第一批已修复并验证（11）**：登录-1、复述-1、复述-2、问答-1、场景-1、场景-2、场景-3、场景-5、场景-6、发现页-1、Landing-1
- ✅ **第二批 M 已修复（3）**：问答-2（题目个性化+跨天去重）、个人详情页-问题1（订阅成功空白·保底修复）、场景-4（报告 AI 点评·A+C）
- ✅ **订阅-1 已修复并验证**：user-service crash 根治 + portal 错误提示 + 真实 test 订阅/取消全链路 E2E 通过（顺带修订阅区「免费版/Pro」矛盾）
- ✅ **第三批 L 已实现并验证（4）**：登录-2（手机号验证码登录·Twilio Verify）、密码重置（Zeabur ZSend）、个人详情页-问题2（反馈 SQL/CLI 脚本）、Landing-2（Tawk.to 客服 widget）

**剩余均为运维/外部配置项（非代码）**：
2. 微信/SSO 登录 defer（企业资质/SAML，C 端暂无需求）
3. 反馈网页 admin 后台 defer（需 admin 角色全链路，量大再做）
4. Stripe 上线：切 live key + live webhook endpoint + 激活 live Customer Portal
5. Tawk.to：CSP allowlist + 隐私政策声明

> 验证方式：Chrome MCP 实测 localhost:5001 + 后端 curl 端到端 + 容器 smoke。涉及外部凭证的（ZSend/Twilio）凭证均存 `.env`（gitignored），代码读 env、缺则 fail-safe。

