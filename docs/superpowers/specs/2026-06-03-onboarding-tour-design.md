# 设计：首次登录引导式演示动画 (Onboarding Tour)

> 状态：已批准（brainstorming 2026-06-03）
> 关联：[[Pricing_Unit_Economics.md]] · 复用 recall/daily_qa 持久化模式

## 1. 目标

新用户首次完成目标设置、落地 Discovery 时，自动启动一次跨页引导：用 spotlight 遮罩高亮口语练习核心操作路径，分步推进、可跳过，完成后持久化、永不重复。

## 2. 关键决策（brainstorming 结论）

| 维度 | 决策 |
|---|---|
| Tour 范围 | 跨页连贯引导（Discovery → Conversation） |
| App 端定义 | PWA = App 端，一套 React 响应式代码覆盖两端 |
| 持久化 | 后端 (users 表布尔字段) + localStorage 双层 |
| 触发时机 | GoalSetting.handleSubmit 完成 → navigate('/discovery') 落地时 |
| 实现选型 | 自研轻量组件（零新依赖，复用已装 motion@12） |
| 步骤序列 | ① Discovery 场景卡 ② Discovery 今日复述+进度环 ③ Conversation 麦克风（跨页，demo 态） |

## 3. 架构

自研 Tour 系统，零新依赖（motion@12 + getBoundingClientRect）：

```
TourProvider (Context, 挂 App.js 根)
  ├── 状态: { active, stepIndex, completed }
  ├── TOUR_STEPS[] (锚点选择器 + i18n 文案 key + 所在路由)
  ├── 跨页编排: 步路由 ≠ 当前路由 → navigate 到该步路由再高亮
  └── 持久化: 完成/跳过 → POST 后端 + 写 localStorage (双层)

<Spotlight> (Portal → body, active 时渲染)
  ├── 全屏 SVG mask 遮暗 + 挖洞高亮目标 rect
  ├── 气泡卡 (motion 过渡): 文案 + 「下一步/完成」+「跳过」
  └── useAnchorRect: getBoundingClientRect + MutationObserver + resize/scroll 重测 + 3s 超时降级
```

### 步骤序列 (TOUR_STEPS)

```js
[
  { id:'scenario-card', route:'/discovery',    anchor:'scenario-card',
    titleKey:'tour_step1_title', bodyKey:'tour_step1_body', placement:'bottom' },
  { id:'recall-streak', route:'/discovery',    anchor:'recall-streak',
    titleKey:'tour_step2_title', bodyKey:'tour_step2_body', placement:'top' },
  { id:'mic',           route:'/conversation', anchor:'mic', demoMode:true,
    titleKey:'tour_step3_title', bodyKey:'tour_step3_body', placement:'top' },
]
```

文案语义：
1. 场景卡 — "点这里选练习场景开始"
2. 复述+进度环 — "每日复述打卡，坚持出成效"
3. 麦克风 — "按住说话，AI 实时陪练纠错"

## 4. 数据流

```
新用户首次: Login → Onboarding(基础信息) → GoalSetting.handleSubmit
  → navigate('/discovery', { state: { startTour: true } })   ← 启动信号

Discovery mount:
  if (location.state?.startTour && !tourCtx.completed) → tourCtx.start()
  tourCtx.completed 来源 (TourProvider init):
    1. 读 localStorage('onboarding_tour_completed') 乐观值 (防闪现)
    2. 并行 GET /api/users/onboarding-tour → 后端权威值校正

推进:
  step0(scenario-card) → next → step1(recall-streak) → next
  → step2(mic, route=/conversation): navigate → Conversation mount 后
    Spotlight 重查 data-tour="mic" → 高亮
  → complete()/skip(): POST 后端 + 写 localStorage + active=false
```

## 5. 边界处理

| 场景 | 处理 |
|---|---|
| 锚点元素未渲染（异步数据未到） | useAnchorRect MutationObserver 等元素出现，超时 3s 则自动跳过该步 |
| 跨页后目标页加载慢 | step2 navigate 后，Spotlight 等 `data-tour="mic"` 出现再画 |
| 用户中途刷新 | 中间步**不持久化**（只持久化"完成"）；刷新=未完成时从 step0 重起。YAGNI |
| 用户中途点别处偏离 | overlay 拦截背景点击（仅气泡卡按钮 + 跳过可点） |
| resize/scroll | 监听重测 getBoundingClientRect 重画 mask |
| 已完成用户 | TourProvider 读 completed=true，start() no-op，永不展示 |
| Conversation step 真实会话成本 | step2 用 **demo 态**：tour 高亮时不建 WS、不触发 AI 调用，仅高亮 MicBar UI + 文案；点「完成」结束 |

## 6. 后端接口（复用 recall/daily_qa 模式）

### Schema（users 表加布尔字段，非新表）
```sql
-- init.sql users 表内 + update_db.sql ALTER 迁移
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_completed BOOLEAN NOT NULL DEFAULT FALSE;
```

### 端点（userController + userRoutes，protect 中间件，cookie 鉴权）
```
GET  /api/users/onboarding-tour          → { completed: bool }
POST /api/users/onboarding-tour/complete → 置 TRUE, 幂等 → { completed: true }
```

### api.js
```js
userAPI.getOnboardingTour()            // credentials:include
userAPI.markOnboardingTourComplete()
```

## 7. 文件清单

**新增**
- `client/src/contexts/TourContext.js` — Provider + Context + TOUR_STEPS
- `client/src/components/Spotlight.jsx` — overlay / SVG 挖洞 / 气泡卡
- `client/src/hooks/useAnchorRect.js` — 锚点测量 hook（rect + observer + 超时）
- `client/src/__tests__/tour-logic.test.js` — 纯逻辑测试
- `services/user-service/src/__tests__/onboardingTour.test.js` — 后端端点测试

**改动**
- `client/src/App.js` — 包 `<TourProvider>` + 根渲染 `<Spotlight>`
- `client/src/pages/Discovery.js` — mount 查 `location.state.startTour` → start()；场景卡/复述卡/StreakRing 容器加 `data-tour`
- `client/src/pages/Conversation.js` — MicBar 容器加 `data-tour="mic"`；tour demoMode 时不建 WS
- `client/src/components/MicBar.jsx` — 透传/容器加 `data-tour`
- `client/src/pages/GoalSetting.js` — handleSubmit navigate 带 `state:{ startTour:true }`
- `services/user-service/init.sql` + `update_db.sql` — onboarding_tour_completed 字段
- `services/user-service/src/controllers/userController.js` — getOnboardingTour / markOnboardingTourComplete
- `services/user-service/src/routes/userRoutes.js` — 2 路由
- `client/src/services/api.js` — userAPI 2 方法
- `client/src/i18n/index.js` — tour 文案 key（9 语言；zh/en 全译，其余 fallback en）

## 8. 测试策略（复用项目纯逻辑约定）

- **前端 `tour-logic.test.js`**：复制纯逻辑——`getNextStep(idx,total)`、`shouldStartTour(completed, startTourFlag)`、placement 计算、超时降级判定。不渲染 React（沿用 stripAIMarkers/discovery-paywall 约定）。
- **后端 `onboardingTour.test.js`**（jest, db mock 复刻 dailyQA.test.js）：getOnboardingTour 无行/有行、markComplete 幂等、错误路径。
- **手动 E2E**：build + 全套回归无破坏；spotlight 视觉手动验证步骤记入 plan。

## 9. YAGNI（明确砍掉）

- 不持久化中间步进度（刷新重来）
- 不做"重看引导"按钮（第四问未选）
- step2 不进真实会话（demo 态，省 AI 成本）
- 不支持 Taro/原生（当前栈为 PWA）

## 10. 验收标准

1. 新用户首次完成 GoalSetting → 落 Discovery 自动启动 tour
2. 3 步依次：场景卡 → 复述/进度环 → (跳转)麦克风
3. 每步「下一步」推进，任意步「跳过」立即结束
4. spotlight 高亮目标区，余处半透明遮暗
5. 完成/跳过后刷新或重登录，不再展示（后端 + localStorage 双层校验）
6. 移动端 (PWA) + 桌面 Web 响应式正常，触摸/点击均可
7. 全套测试回归绿，build 通过
