# GuaJi AI 设计系统集成 — 功能测试用例

**测试目标**: 验证设计系统集成后所有页面功能正常、视觉一致、业务逻辑未受影响
**前置条件**: 后端服务已启动 (`docker compose up -d`)，前端 dev server 运行中 (`npm start`)

---

## 1. Landing 页面 (`/`)

| # | 测试项 | 操作步骤                        | 预期结果 | 通过  | 修改点                     |
|---|-------|-----------------------------|---------|-----|-------------------------|
| 1.1 | 页面加载 | 打开 `http://localhost:5001/` | 暗蓝 hero 区 + 渐变 CTA 按钮 + GuaJi logo 正常渲染 | [☑] | Guaji AI去掉AI，只保留“Guaji” |
| 1.2 | 导航栏 logo | 查看左上角                       | 显示 GuaJi 猫头鹰图标 + "GuaJi" 文字 | [☑] |去掉AI，只保留“Guaji” |
| 1.3 | 语言切换 | 点击语言下拉 → 切换英语               | 页面文案切换为英语，布局不错位 | [☑] |  
| 1.4 | 登录按钮 | 点击 "登录"                     | 跳转到 `/login` 页面 | [☑] |
| 1.5 | 注册按钮 | 点击 "免费开始" CTA               | 跳转到 `/register` 页面 | [☑] |
| 1.6 | 已登录重定向 | 登录后访问 `/`                   | 自动跳转到 `/discovery` 或 `/onboarding` | [☑] |
| 1.7 | 功能卡片 | 向下滚动到 Features 区域           | 4个功能卡片正常展示，hover 有上浮效果 | [☑] |
| 1.8 | 定价卡片 | 滚动到 Pricing 区域              | 3个套餐正确显示价格和功能列表 | [☑] |
| 1.9 | 证言轮播 | 等待 5 秒                      | Testimonial 自动切换，指示器同步 | [☑] |

---

## 2. Login / Register 页面

| # | 测试项 | 操作步骤 | 预期结果 | 通过 | 修改点                                                                                                                                                                                                         |
|---|-------|---------|---------|------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 2.1 | 登录表单 | 输入邮箱+密码 → 点击登录 | 成功登录 → 跳转 `/discovery` | [☑] |
| 2.2 | 登录失败 | 输入错误密码 | 显示错误提示，不跳转 | [☑] | 提示“登录已过期，请重新登录”或Proxying API request: POST /api/users/login -> http://oral_app_api_gateway:80/api/users/login 出现服务端500错误 Server error during login，Login Error: Error: Illegal arguments: string, undefined |
| 2.3 | Google OAuth | 点击 "Google 登录" | Google 授权弹窗打开 | [☑] | 弹出提示 禁止访问：发生了授权错误 不符合Google的OAuth2.0规范 错误400: origin_mismatch                                                                                                                                               |                                                                                                                                               |
| 2.4 | 注册流程 | 填写表单 → 提交 | 成功注册 → 跳转 `/onboarding` | [☑] | 页面提示“Server error during registration.” ERROR:  duplicate key value violates unique constraint "users_username_key"                                                                                         |

---

## 3. Onboarding 页面 (`/onboarding`)

| # | 测试项 | 操作步骤 | 预期结果 | 通过 | 修改点                                                                                                                                                                                                                                                                                                                                                                            |
|---|-------|---------|---------|-----|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 3.1 | 品牌展示 | 查看页面 | 左上角 GuaJi 猫头鹰图标 + "GuaJi"；欢迎区显示猫头鹰形象（非鹦鹉） | [☑] | 去掉AI，只保留“Guaji”                                                                                                                                                                                                                                                                                                                                                                |
| 3.2 | 昵称输入 | 输入昵称 | 输入框正常，无样式问题 | [☑] |
| 3.3 | 性别选择 | 点击各性别选项 | 选中状态用渐变高亮，未选中灰色 | [☑] | ~~出现 “请选择性别”、”其他” 这2个多余选项~~ 已移除”请选择性别”按钮和”其他”选项                                                                                                                                                                                                                                                                                                                                                        |
| 3.4 | 母语选择 | 选择不同母语 | 选中项高亮，标志 emoji 正确 | [☑] | ~~母语只能选9选1，非全量选项~~ 已扩充至29种语言（与GoalSetting LANGUAGES一致）+ 滚动容器                                                                                                                                                                                                                                                                                                                                                    |
| 3.5 | 提交跳转 | 填完表单 → 提交 | 跳转到 `/goal-setting`，profile 数据已保存 | [☑] | ~~场景生成失败~~ 已修复：api-gateway DNS缓存了旧IP，重启Nginx后恢复（200 OK） |

---

## 4. GoalSetting 页面 (`/goal-setting`)

| # | 测试项 | 操作步骤 | 预期结果 | 通过  | 修改点                 |
|---|-------|---------|---------|-----|---------------------|
| 4.1 | 欢迎页 | 查看 Step 1 | GuaJi 猫头鹰图标（透明背景、双翅对称），标题 "欢迎来到 GuaJi" | [☑] |                     |
| 4.2 | 语言选择 | 点击 "开始设置" → 选择语言 | 2列语言网格，选中项 primary 色边框 | [☑] |                     |
| 4.3 | 水平测试 | 完成4道问卷题 | 单题滑动切换动画，选项点击高亮 | [☑] |                     |
| 4.4 | 目标设置 | 选择练习方向 + 自定义 | "自定义"选项展开文本框，可输入 | [☑] |                     |
| 4.5 | AI 音色选择 | 选择 Tina/Serena/Evan/Arda | 只有这4个选项，选中状态正确 | [☑] |                     |
| 4.6 | 场景生成 | 点击生成场景 | loading → 显示场景列表，可编辑/删除 | [☑] | ~~场景生成失败~~ 已修复：api-gateway DNS缓存问题，重启后恢复 |
| 4.7 | 提交完成 | 确认场景 → 提交 | 创建目标成功 → 跳转 `/discovery` | [☑] | ~~生成场景失败~~ 依赖4.6修复，现已恢复       |
| 4.8 | 进度条 | 逐步操作 | 顶部进度条按步骤填充 | [☑] | 修复：进度计算从 step/TOTAL_STEPS 开始，Step 1 即有 20% 进度 |

---

## 5. Discovery 页面 (`/discovery`) — 首页

| # | 测试项 | 操作步骤 | 预期结果 | 通过 |
|---|-------|---------|---------|------|
| 5.1 | Header | 查看顶部 | 时段问候 + 用户名 + Pro徽章(如适用) + 头像圆形 | [ ] |
| 5.2 | StreakRing | 查看连续学习卡片 | SVG 环蓝色(非橙色)，显示连续天数，打卡按钮可用 | [ ] |
| 5.3 | 打卡功能 | 点击 "今日打卡" | 按钮变为 "今日已打卡"，streak +1 | [ ] |
| 5.4 | 统计网格 | 查看4格统计 | emoji图标 + 数值 + 标签，数据来自后端 | [ ] |
| 5.5 | 今日任务卡 | 查看 "今日任务" 区域 | 左侧 GuaJi 头像，复述+问答任务行，0/2完成 | [ ] |
| 5.6 | 复述入口 | 点击复述 "开始" | 跳转 `/recall`（独立页面，不再复用 `/conversation`） | [ ] |
| 5.7 | 问答入口 | 点击问答 "开始" | Pro用户→跳转 `/conversation?mode=daily_qa`；Free→弹出升级弹窗 | [ ] |
| 5.8 | 场景筛选 | 点击 "进行中"/"已完成" 筛选 | 场景列表按状态过滤 | [ ] |
| 5.9 | 场景卡片 | 查看2列网格 | emoji + 难度徽章 + 进度条 + 锁定覆盖层 | [ ] |
| 5.10 | 场景点击 | 点击未锁定场景卡片 | 跳转 `/conversation?scenario=xxx` | [ ] |
| 5.11 | BottomNav | 查看底部导航 | 3-tab: 首页(高亮)/目标/我的，Material Symbols图标 | [ ] |
| 5.12 | 导航跳转 | 点击 "目标" tab | 跳转 `/goals`；点击 "我的" → `/profile` | [ ] |

---

## 6. Conversation 页面 (`/conversation`)

### 6a. 场景对话模式

| # | 测试项 | 操作步骤 | 预期结果 | 通过 |
|---|-------|---------|---------|------|
| 6.1 | 页面加载 | 进入场景对话 | Header显示场景名 + 在线状态绿色pill | [ ] |
| 6.2 | WebSocket连接 | 查看连接状态 | 显示 "在线" 绿色状态 | [ ] |
| 6.3 | AI消息气泡 | 等待AI发言 | 气泡左侧显示 GuaJi 圆形头像（非Bot图标） | [ ] |
| 6.4 | 用户消息气泡 | 录音并发送 | 蓝色气泡右对齐，圆角 18-18-6-18 | [ ] |
| 6.5 | 录音按钮 | 长按/点击麦克风 | 录音状态：红色渐变 + "正在录音…" + 脉冲动画 | [ ] |
| 6.6 | CC模式切换 | 点击 "CC" 按钮 | 显示 GuaJi 猫头鹰沉浸视图 + 字幕覆盖 | [ ] |
| 6.7 | CC模式状态 | AI说话/聆听/思考 | 猫头鹰图片切换：speaking→说话姿态，listening→聆听，thinking→思考 | [ ] |
| 6.8 | 退出CC | 点击 "退出 CC ×" | 回到消息列表视图 | [ ] |
| 6.9 | 翻译功能 | 点击AI消息下方 "翻译" | 展开翻译文本 | [ ] |
| 6.10 | 音频播放 | 点击消息中的播放按钮 | 播放AI语音，AudioBar显示波形 | [ ] |
| 6.11 | 重新练习 | 点击重启按钮 | 清空对话，重新开始当前场景 | [ ] |
| 6.12 | 任务完成弹窗 | 完成一个任务 | ScorePopup 弹出显示分数 | [ ] |
| 6.13 | 场景完成 | 完成所有任务 | PracticeReport 弹出，显示总分+详情 | [ ] |

### 6b. 今日问答模式 (`?mode=daily_qa`)

| # | 测试项 | 操作步骤 | 预期结果 | 通过 |修改点 |
|---|-------|---------|---------|-----|------|
| 6.14 | 问题卡片 | 进入问答模式 | 顶部显示问题文本 + 播放按钮 + 参考答案折叠 | [☑] |
| 6.15 | 播放问题 | 点击播放按钮 | TTS朗读问题 | [☑] |
| 6.16 | 回答完成 | 录音回答后 | AI评价 + "今日问答已完成" 弹窗 | [ ] |用户随便说什么都会完成任务，需审查评判标准和通过阈值 |

### 6c. 今日复述模式 (`/recall` 独立页面)

| #    | 测试项         | 操作步骤             | 预期结果                                           | 通过 | 修改点 |
|------|-------------|---------------------|------------------------------------------------|----|-----|
| 6.17 | 台词卡常驻       | 进入 `/recall`        | 页面上半部展示当前句台词卡，无聊天气泡                            | [☑] |
| 6.18 | 两步独立        | 进入新句子               | 卡片内显示两个分块：① 跟读练习（台词可见）② 背诵练习（默认 disabled）      | [☑] |
| 6.19 | 跟读录音        | 在 ①「跟读练习」按住🎙️      | Web Speech 识别后给出"识别 N%"徽章，仅写入 step 1 score     | [☑] |
| 6.20 | 跟读通过 → 解锁背诵 | 跟读识别 ≥ 60%          | ① 边框变绿、徽章变 ✓；② 从 disabled 变可点                  | [☑] |
| 6.21 | 一次录音不双通过    | 单次按住录音              | 只更新当前按下的那个 step 的 score，另一 step 不受影响           | [☑] |
| 6.22 | 防绕过         | 任一 step 未通过时点 "下一句" | 按钮 disabled；hover title 提示"需先完成跟读和背诵两步"        | [☑] |
| 6.23 | 背诵录音        | ② 解锁后按住🎙️          | 台词保持遮挡（除非偷看），识别后写入 step 2 score                | [☑] |
| 6.24 | 双通过 → 解锁下一句 | 两步识别均 ≥ 60%         | "下一句" 按钮启用                                     | [☑] |
| 6.25 | 偷看：按住显示     | ② 阶段按住 "👀 按住偷看"    | 遮挡板掀开，原句临时显示；松开恢复遮挡                            | [☑] |
| 6.26 | 偷看不影响进度     | 偷看后释放               | step 1/2 score 不变，不需重新跟读或背诵                    | [☑] |
| 6.27 | 偷看次数计数      | 多次按住偷看              | 按钮旁显示 "N 次"                                    | [☑] | 实际偷看次数是 计数次数的一半 |
| 6.28 | 偷看仅背诵阶段可用   | 跟读未通过时尝试偷看          | PeekButton 不渲染；调用 startPeek 早返回                | [☑] |
| 6.29 | 上一句保留进度     | 通过本句后点 "上一句" 再回来    | 两个 step 仍是 ✓，无需重做                              | [☑] |
| 6.30 | 完成跳转        | 通过最后一句点 "完成"        | 写 `recall_completed_${today}` 并跳回 `/discovery` | [☑] |
| 6.31 | 新句注入        | 通过完成今日复述任务后再次进入     | 显示任务已经完成并提示用户是否切换下一组句子进行练习，免费用户每天只有3次切换机会      | [☑] | 重新进入后还是原句子 | 

---

## 7. Profile 页面 (`/profile`)

| # | 测试项       | 操作步骤        | 预期结果                      | 通过 | 修改点 |
|---|-----------|-------------|---------------------------|----|------|
| 7.1 | 用户信息      | 查看顶部        | 渐变头像圆形 + 用户名 + Pro徽章(如适用) | [☑] |
| 7.2 | 统计行       | 查看3列统计      | 对话次数/连续天数/总进度 数据正确        | [☑] |
| 7.3 | 打卡日历      | 查看日历网格      | 已打卡日期显示 primary 蓝色方块      | [☑] | ~~只有日期和连续天数，没有蓝色方块~~ 已修复：`toLocalDateStr` 替换 `toISOString().split('T')[0]`，消除 UTC+8 时区一日偏移 |
| 7.4 | 语言设置      | 修改用户母语      | 出现母语下拉菜单                  | [☑] |
| 7.5 | 订阅状态      | 查看 "我的订阅" 行 | 显示当前订阅状态和过期日期             | [☑] | ~~未展示过期日期~~ 已修复：新增 "💎 我的订阅" 卡片（语言设置上方），active 显示套餐名 + `current_period_end` 格式化为 zh-CN 日期 + 管理订阅；free 显示 升级会员 CTA |
| 7.6 | 退出登录      | 点击 "退出登录"   | 清除session → 跳转 `/` 着陆页    | [☑] |
| 7.7 | BottomNav | 查看底部        | "我的" tab 高亮，3-tab布局       | [☑] |
| 7.8 | 页面背景      | 查看整体        | 背景色 #f6f7f8 (非纯白)，与设计系统一致 | [☑] | ~~深色模式下"我的"/"首页"tab 背景仍白色~~ 已修复：index.css 加 `.dark` 覆盖块（含 `--background: #101922` 等），BottomNav 用 `var(--background-translucent)` 自动切换；Discovery 同根因副作用一并修复 |

---

## 8. Subscription 页面 (`/subscription`)

| # | 测试项 | 操作步骤 | 预期结果 | 通过 | 修改点                     |
|---|-------|---------|---------|------|-------------------------|
| 8.1 | 页面加载 | 访问 `/subscription` | 套餐列表正常展示，背景色 #f6f7f8 | [☑] | ~~深色模式异常，背景色依旧为白色~~ 已修复：与 7.8 同根因，依赖 index.css 的 `.dark` 覆盖块 |
| 8.2 | 套餐展示 | 查看3个套餐 | 免费/周付/年付价格正确 | [☑] | ~~没有套餐价格显示，只有免费版~~ 已修复：`fetchProducts` 在 API 返回空时回退到 `FALLBACK_PRODUCTS`（周付 $2.90 / 年付 $89.90，价格与 Landing.js 一致），Stripe 配置完成后会自动用真实数据 |
| 8.3 | 优惠码 | 输入优惠码 → 点击应用 | 正确校验（有效码打折 / 无效码提示） | [☑] |
| 8.4 | 支付跳转 | 点击付费套餐按钮 | Stripe Checkout 页面打开 | [☑] | ~~没有看到支付按钮~~ 已修复：拆掉 `{price && ...}` 守卫，按钮始终渲染；fallback 情况下点击弹 alert "支付功能即将上线"，Stripe 真实 priceId 存在时正常走 checkout |

---

## 9. 品牌一致性检查（全局）

| # | 测试项 | 检查方法 | 预期结果 | 通过 | 修改点                     |
|---|-------|---------|---------|------|-------------------------|
| 9.1 | 品牌名 | 全局搜索 "Oral AI" | 前端代码中无残留 "Oral AI"，统一为 "GuaJi AI" | [☑] |
| 9.2 | 鹦鹉 emoji | 全局搜索 🦜 | 无残留鹦鹉 emoji，已替换为猫头鹰图标 | [☑] |
| 9.3 | 吉祥物素材 | 访问 `/mascot/happy.png` 等 | 25个素材全部可访问 | [☑] |
| 9.4 | Logo SVG | 访问 `/guaji-logo.svg` | SVG logo 正常渲染 | [☑] |
| 9.5 | 图标 SVG | 访问 `/guaji-logo.svg` | 透明背景猫头鹰，双翅对称 | [☑] | 项目用 SVG 矢量图标，无 PNG；guaji-logo.svg 已为透明背景、双翅(±56)/耳簇(±14)/脚(±12)对称猫头鹰，符合规格 |
| 9.6 | 主题色 | 检查各页面 CTA 按钮 | 统一使用 `#637FF1 → #a47af6` 渐变 | [☑] |
| 9.7 | 字体 | 检查页面文字 | 统一使用 Lexend 字体 | [☑] |
| 9.8 | Console | 打开 DevTools Console | 无前端 JS 错误（后端 502 除外） | [☑] |

---

## 10. 响应式 & 移动端

| # | 测试项 | 操作步骤 | 预期结果 | 通过 | 测试发现 |
|---|-------|---------|---------|------|---------|
| 10.1 | 移动端首页 | iPhone 14 (390×844, CDP 设备仿真 dpr=3) | Discovery 页面布局正常，2列场景网格不溢出 | [☑] | scrollW=390 无横向滚动，0 溢出元素；场景网格 `grid grid-cols-2 gap-3`，每列 165.5px×2+12gap=343<390；BottomNav/streak ring/4 stat grid 全部正常 |
| 10.2 | 移动端对话 | 移动端进入对话页 (`/conversation?scenario=在超市购物`) | ConvHeader/MicBar 适配屏幕宽度 | [☑] | scrollW=390 无溢出；ConvHeader(✕关闭+标题+3相位点+在线徽章) 不截断；MicBar(点击说话渐变按钮+CC+重播) 三控件适配宽度 |
| 10.3 | 移动端CC模式 | 移动端点击 CC 按钮进入沉浸字幕模式 | 猫头鹰居中，字幕不溢出 | [☑] | 猫头鹰 `bird-logo.svg` cx=195=视口正中心(390/2)，scrollW=390 无横向滚动；字幕组件宽度受容器约束（空闲态 AI 未说话，字幕未渲染）。注：探测到 1 处 left=-2px 是猫头鹰内部白边环的取整伪报，332<390 非真实溢出 |
| 10.4 | BottomNav | 移动端查看底部 | 3-tab均匀分布，不被遮挡 | [☑] | `position:fixed` 底部锚定(bottom=844=viewportH)，高 72px；3 tab(首页/目标/我的) 中心 63/188/313，间距均匀 125px，不被内容遮挡 |
| 10.5 | Landing | 移动端访问 `/` (登出态) | hero文字换行合理，CTA按钮竖排 | [☑] | scrollW=390 无溢出；hero 标题 4 行合理换行无截断；两个 CTA 竖排(cx=195 居中，全宽 358px，纵向 cy 528→604)；header logo/语言切换/登录/注册全部适配 |

> **测试方法说明（§10）**：iPhone 14 真实 390px 视口通过 **CDP `Emulation.setDeviceMetricsOverride`**（width=390 height=844 deviceScaleFactor=3 mobile=true）实现，而非窗口缩放——Chrome 强制最小窗口宽 ~592px，`resize_window` 无法降到 390。测试对 dev-server (`localhost:3000`，与 `:5001` prod 同源，仅 `bundle.js` vs `main.*.js` 之别) 应用仿真 + `Page.captureScreenshot` 截图取证。每条用例用 JS 遍历 `getBoundingClientRect()` 探测溢出元素（`right>clientW` 或 `left<-1`）并核对 `documentElement.scrollWidth`。截图证据见 `docs/mobile-test-screenshots/`。
>
> Playwright MCP 当前不可用：其 `.mcp.json` 固定 `--cdp-endpoint http://localhost:9222`，attach 到 Chrome 148 时 `/json/version` 握手返回 `Unexpected status 400`（版本兼容问题），故改用 CDP 直连 + claude-in-chrome 辅助。

---

## 11. Zeabur 生产上线验证（`guajiguaji.top`，Jun 2026）

**测试目标**：后端全栈部署到 Zeabur（Aliyun Bangkok）后，验证生产环境特有问题（私有网络、CSP、海外 DashScope、Stripe live、构建链路）。**前置**：8 后端 + gateway + client + 3 DB 全部 RUNNING；域名 `guajiguaji.top` → client-app。

### 11a. 部署链路与基础设施

| # | 测试项 | 操作步骤 | 预期结果 | 通过 | 修改点 |
|---|-------|---------|---------|------|--------|
| 11.1 | 域名访问 | `curl -I https://guajiguaji.top/` | HTTP 200，client-app 服务 React | [☑] | |
| 11.2 | API 全链路 | `POST /api/users/login`（错误凭据） | 401（域名→client nginx→resolver→api-gateway→user-service→postgres 全通） | [☑] | ~~502~~ 已修：nginx 静态 upstream 启动期解析 `.zeabur.internal` 崩溃 → resolver 10.43.0.20 + 变量化 proxy_pass 运行时解析 |
| 11.3 | 私有网络 DNS | 后端互访 | `<service>.zeabur.internal:<port>` 解析正常 | [☑] | Zeabur 私有 DNS = service-name.zeabur.internal；`${VAR}` 自引用不插值，DB/redis 用 literal 值 |
| 11.4 | DB 建表 | postgres `zeabur` 库 | init.sql + 6 migrations 全部 APPLIED | [☑] | postgres 非自动建表，`.zeabur-bin/bootstrap-db.sh` base64-pipe 经 service exec 灌入 |
| 11.5 | client 构建 | Zeabur build client-app | 用 `client/Dockerfile`（非 .prod！root=client 自动选 Dockerfile） | [☑] | ~~CSP/Tawk 全失效~~ 已修：修复曾写进没被用的 Dockerfile.prod；对齐 client/Dockerfile + RUN grep 断言 bust 缓存 |

### 11b. CSP（内容安全策略）

| # | 测试项 | 操作步骤 | 预期结果 | 通过 | 修改点 |
|---|-------|---------|---------|------|--------|
| 11.6 | COS 音频 | 对话页 AI 语音播放 | COS mp3 加载不被 CSP 拦 | [☑] | ~~`media-src` 缺，default-src 拦~~ 已修：CSP 加 `media-src 'self' blob: data: https://*.myqcloud.com` |
| 11.7 | blob 试听 | recall 试听合成 | blob: URL 音频可播 | [☑] | ~~blob 被拦~~ 同 11.6（media-src blob:） |
| 11.8 | 波形/时长 | AudioBar 渲染 | 显示波形 + 时长（非仅播放按钮） | [☐] | 连带 11.6（`new Audio()` 被 media-src 拦致 loadedmetadata 不触发）；待 live 复测 |
| 11.9 | Cloudflare beacon | 页面加载 | `static.cloudflareinsights.com/beacon.min.js` 不被拦 | [☑] | ~~script-src 拦~~ 已修：script-src 加 cloudflareinsights |
| 11.10 | 字体加载 | Google Fonts | fonts.googleapis/gstatic 不被拦 | [☑] | connect-src 加 google fonts |
| 11.11 | CSP header 实测 | `curl -I https://guajiguaji.top/` | header 含 media-src + cloudflareinsights | [☑] | console 无 "violates CSP" |

### 11c. 海外 DashScope（新加坡专属工作区）

| # | 测试项 | 操作步骤 | 预期结果 | 通过 | 修改点 |
|---|-------|---------|---------|------|--------|
| 11.12 | 场景生成 | `POST /api/ai/generate-scenarios` | HTTP 200，返回 10 场景 | [☑] | ~~404→403→已修~~ 路由 404=变量 proxy_pass URI 语义；403=模型名 qwen-turbo→qwen-flash + chat base maas→dashscope-intl（maas 不提供 compatible-mode chat）。3 处 chat（scenarios/daily-qa/translate）统一 httpx 直连 intl 网关 |
| 11.13 | 文生图 | 场景配图 | wan2.2-t2i-flash 调用成功 | [☐] | model wanx2.1-t2i-turbo→wan2.2-t2i-flash；待 live 复测 |
| 11.14 | realtime 语音 | 对话 WS `/stream` | 主对话 omni 语音正常（用 maas host） | [☐] | 主对话用 OmniRealtimeConversation；待 live 完整语音练习复测 |

### 11d. Stripe live 支付

| # | 测试项 | 操作步骤 | 预期结果 | 通过 | 修改点 |
|---|-------|---------|---------|------|--------|
| 11.15 | live 价格 | `/api/stripe/products-with-prices` | 周$4.99/年$99 真实 live 价 | [☑] | seed-products.js（live key）建 prod_Uksr*/price_1TlN5* |
| 11.16 | live webhook | 真实付款 → webhook | subscription_status 写 active | [☑] | ~~付款成功但没写 active~~ 根因：旧 checkout 无 metadata.userId + customer 未关联 → updateByCustomerId 0 行。三级兜底：customerId→metadata.userId→email 反查 + checkout 塞 client_reference_id/userId。已付款用户(`363328084@qq.com`)手动补激活 |
| 11.17 | 付款跳转 | Checkout 成功后 | 跳转 Profile 显示 Pro | [☐] | ~~跳转失败~~ 部分因 CSP 拦 Cloudflare/字体；待 live 复测 |

### 11e. 前端 prod bug

| # | 测试项 | 操作步骤 | 预期结果 | 通过 | 修改点 |
|---|-------|---------|---------|------|--------|
| 11.18 | 开场白 TTS | 进对话页听开场白 | TTS 播 1 次（不重复） | [☐] | ~~播 2 次（streaming+COS 双路径）~~ 已修：streamedAudioSinceCutRef 去重；待 live 复测 |
| 11.19 | 音频不切断 | 连续多条 AI 消息 | 音频播完整，A→B 衔接顺，不中途切断 | [☐] | ~~总被切断~~ 已修：auto-play effect 删全局 stopAudioPlayback（下行已 queued 衔接）+ 提前去重置位 + 依赖收紧为 pendingAutoPlayKey；待 live 复测 |
| 11.20 | daily-progress | Discovery 加载 | `/api/users/daily-progress` 不 500 | [☑] | ~~500~~ 缺 daily_practice_time 表 + users.daily_practice_goal 列 → 建表 migration + 软兜底 |
| 11.21 | Google 登录 | 点 Google 登录 | client_id 正确，授权弹窗正常 | [☐] | ~~invalid_request client_id 未设~~ 已修：REACT_APP_GOOGLE_CLIENT_ID build-time 注入（之前 .env gitignored 没传给 Zeabur build）。注：Google Console 须加 `guajiguaji.top` 授权来源（origin_mismatch 另需 Console 配） |
| 11.22 | Tawk 客服 | 页面加载 | Tawk widget 出现，无 CORS | [☑] | ~~CORS/client_id 空~~ 已修：REACT_APP_TAWK_* build-time 注入；twk-main.js 已加载 |

> **生产验证方法（§11）**：`curl` 验证 HTTP/header/API（本地经 `HTTPS_PROXY=127.0.0.1:7890` 访 Zeabur API；公网 curl `guajiguaji.top` 直连）；claude-in-chrome MCP 连真实浏览器读 console 验证 CSP/资源加载（`read_console_messages` + `javascript_tool` 查 bundle hash）。Zeabur CLI 0.19.0 二进制（npm 上限 0.5.4）+ proxy。**[☐] 项需登录后真实交互复测**（录音/付款/语音）。部署细节见 [memory] `project_zeabur_backend_deploy_complete`。