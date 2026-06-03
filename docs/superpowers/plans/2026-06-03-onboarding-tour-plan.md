# 实施计划：首次登录引导式演示动画 (Onboarding Tour)

> 关联设计：`docs/superpowers/specs/2026-06-03-onboarding-tour-design.md`
> 执行约定：TDD（先测后码）；每阶段后 `python3 -m py_compile`(py) / `node --check`(js)；
> 全部完成跑回归 + build。Python 源改不加 --no-cache；前端改完 `npm run build`。

---

## 阶段 0 — 锚点与现状勘察（只读，无改动）

**目的**：确认每个 spotlight 锚点的确切 DOM 容器，避免 data-tour 加错位置。

- [ ] 0.1 Discovery.js：定位场景卡 grid（`grid grid-cols-2`，~L952）首张 `<ScenarioCard>` 外层容器；今日复述卡容器（~L814 区）；`<StreakRing>`（~L893）+ 进度 StatCard（~L906）。决定 `data-tour="scenario-card"` 挂 grid 还是首卡、`data-tour="recall-streak"` 挂复述卡还是含进度环的区块。
- [ ] 0.2 Conversation.js：定位 `<MicBar>` 渲染处 + 其父容器；确认 tour demo 态如何避免建 WS（查 connectWebSocket 触发条件，spec §5）。
- [ ] 0.3 GoalSetting.js：确认 handleSubmit 的 `navigate('/discovery')`（~L274，含 1200ms setTimeout）改为带 `state:{startTour:true}`。
- [ ] 0.4 App.js：确认 Provider 嵌套层级（AuthProvider/Router 位置），决定 `<TourProvider>` 插入点（须在 Router 内，能用 useNavigate/useLocation）。
- [ ] 0.5 api.js：确认 userAPI 现有方法 fetch 写法（credentials:'include'、API_BASE_URL），作为新方法模板。
- [ ] 0.6 userController.js / userRoutes.js：确认 db require 模式 + protect 中间件 + 现有 recall/dailyQA handler 作模板。

**产出**：一张「锚点→DOM 容器」对照表，写入本 plan 勾选项备注。

---

## 阶段 1 — 后端持久化（独立，可先行）

### 1.1 Schema
- [ ] init.sql：users 表内加 `onboarding_tour_completed BOOLEAN NOT NULL DEFAULT FALSE`（紧跟 updated_at 前/后，风格对齐）。
- [ ] update_db.sql：加 `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_completed BOOLEAN NOT NULL DEFAULT FALSE;`（带注释）。

### 1.2 TDD — 端点测试先行
- [ ] 写 `services/user-service/src/__tests__/onboardingTour.test.js`（jest，db mock 复刻 dailyQA.test.js）：
  - getOnboardingTour：有行返回 completed 值；无行返回 {completed:false}；DB error → 500。
  - markOnboardingTourComplete：UPDATE 置 TRUE 幂等；返回 {completed:true}；error → 500。
- [ ] 跑测试确认 RED（handler 未实现）。

### 1.3 Controller + Routes
- [ ] userController.js：`exports.getOnboardingTour` (SELECT onboarding_tour_completed WHERE id=req.user.id)、`exports.markOnboardingTourComplete` (UPDATE ... = TRUE RETURNING)。参数化查询，user_id 取 req.user.id，500 on error。
- [ ] userRoutes.js：`GET /api/users/onboarding-tour` + `POST /api/users/onboarding-tour/complete`，均 protect。
- [ ] 跑测试确认 GREEN。`node --check` 两文件。

---

## 阶段 2 — 前端 API + Tour 纯逻辑（TDD）

### 2.1 api.js
- [ ] userAPI 加 `getOnboardingTour()` + `markOnboardingTourComplete()`（credentials:'include'，复刻 getDailyQAPassStatus）。

### 2.2 TDD — 纯逻辑测试先行
- [ ] 写 `client/src/__tests__/tour-logic.test.js`（纯逻辑复制约定，不渲染 React）：
  - `getNextStep(idx, total)` → idx+1 或 null(末步)。
  - `shouldStartTour(completed, startTourFlag)` → true 仅当 !completed && startTourFlag。
  - `computePlacement(rect, viewport, prefer)` → 气泡定位（目标上/下放不下时翻转）。
  - 超时降级判定 `shouldSkipStep(elapsed, timeoutMs)`。
- [ ] 这些纯函数从 TourContext/Spotlight 抽到可复制位置（或 test 内复制 verbatim）。RED→实现→GREEN。

---

## 阶段 3 — Tour 核心组件（自研）

### 3.1 useAnchorRect hook
- [ ] `client/src/hooks/useAnchorRect.js`：入参 anchor(string)。查 `[data-tour="<anchor>"]`；getBoundingClientRect；MutationObserver 等元素出现；resize/scroll 重测；3s 超时 → 返回 `{ rect:null, timedOut:true }`。卸载清理 observer/listener。

### 3.2 Spotlight 组件
- [ ] `client/src/components/Spotlight.jsx`：Portal→body。props `{ anchor, title, body, stepIndex, total, isLast, onNext, onSkip }`。
  - 全屏 SVG `<mask>` 暗层 + 挖洞 rect（rect 来自 useAnchorRect；padding 8px）。
  - timedOut → 自动 onNext（降级跳过）。
  - 气泡卡（motion 入场过渡）按 computePlacement 定位；含 title/body、步数指示、「下一步/完成」「跳过」。
  - 背景遮罩拦截点击（仅卡内按钮可点）。

### 3.3 TourContext
- [ ] `client/src/contexts/TourContext.js`：
  - `TOUR_STEPS` 常量（spec §3，3 步，i18n key）。
  - Provider state `{ active, stepIndex, completed }`。
  - init：读 localStorage 乐观值 + 并行 `userAPI.getOnboardingTour()` 校正。
  - `start()`：completed → no-op；否则 active=true, stepIndex=0；若当前路由≠step0.route 则 navigate。
  - `next()`：末步→complete()；否则 stepIndex++；若新步 route≠当前路由→navigate。
  - `skip()`/`complete()`：active=false；POST `markOnboardingTourComplete()` + 写 localStorage；completed=true。
  - useNavigate/useLocation 跨页编排。

---

## 阶段 4 — 接线（锚点 + 触发 + 渲染）

- [ ] 4.1 App.js：Router 内包 `<TourProvider>`；根（Router 内）渲染 `<TourHost>`（消费 ctx，active 时渲染 `<Spotlight>` 当前步）。
- [ ] 4.2 GoalSetting.js：handleSubmit `navigate('/discovery', { state:{ startTour:true } })`（保留 1200ms setTimeout 语义）。
- [ ] 4.3 Discovery.js：
  - mount useEffect：`if (location.state?.startTour) tourCtx.start()`（消费后清 state 防重入：navigate(replace) 或 ref guard）。
  - 加 `data-tour="scenario-card"`（首卡/grid，按 0.1）、`data-tour="recall-streak"`（复述+进度环区，按 0.1）。
- [ ] 4.4 Conversation.js + MicBar.jsx：MicBar 容器加 `data-tour="mic"`；tour demoMode（ctx.active && step.id==='mic'）时**不建 WS / 不触发 AI**，仅展示静态 UI。
- [ ] 4.5 i18n/index.js：加 `tour_step1/2/3_title/body` + 按钮 `tour_next/tour_done/tour_skip`，zh/en 全译，其余语言 fallback en（沿用现有 i18n 结构）。

---

## 阶段 5 — 验证与回归

- [ ] 5.1 `node --check` 所有改动 .js；Recall/Discovery/Conversation/Spotlight/TourContext JSX 经 babel 校验。
- [ ] 5.2 后端 jest：`cd services/user-service && npx jest`（含 onboardingTour.test.js）→ 0 fail。
- [ ] 5.3 前端 jest：`cd client && CI=true npx react-app-rewired test --watchAll=false`（含 tour-logic.test.js）→ 0 fail。
- [ ] 5.4 前端 build：`cd client && npm run build` → Compiled（CI=true 警告即错，须无新增 unused/警告）。
- [ ] 5.5 手动 E2E（记录步骤）：
  1. 新用户走完 Onboarding→GoalSetting→落 Discovery → tour 自动启动。
  2. 场景卡高亮→下一步→复述/进度环高亮→下一步→跳转 Conversation 麦克风高亮（无 WS 连接，console 无 AI 调用）→完成。
  3. 任意步「跳过」立即结束。
  4. 刷新 + 重登录 → tour 不再出现（后端 + localStorage 双层）。
  5. 移动端宽度 (DevTools 375px) spotlight 定位正常、触摸可点。
- [ ] 5.6 docs/TODO.md：feature 标记 Done。

---

## 阶段 6 — 收尾

- [ ] 6.1 拆 commit：`feat(onboarding-tour): 后端持久化端点` + `feat(onboarding-tour): 前端 spotlight 引导组件`（或单 feat commit，按改动耦合度）。
- [ ] 6.2 不提交临时产物（`.claude/wf-*.js` 已 ignore）。
- [ ] 6.3 更新 QWEN.md（CLAUDE.md 要求：完成开发后同步）+ 本 plan 勾选完成项。

---

## 依赖顺序

```
阶段0(勘察) → 阶段1(后端,独立) ∥ 阶段2(前端API+纯逻辑TDD)
            → 阶段3(组件) → 阶段4(接线) → 阶段5(验证) → 阶段6(收尾)
```
阶段 1 与 2 可并行（后端 vs 前端纯逻辑无依赖）。阶段 3 依赖 2.2 纯逻辑。阶段 4 依赖 1+3。

## 风险

- **跨页 navigate 时序**：step2 跳转后锚点未就绪 → useAnchorRect observer + 超时兜底覆盖。
- **Discovery startTour state 重入**：消费后须清（replace navigate / ref），否则返回 Discovery 重触发。
- **CI build 警告即错**：新文件勿留 unused import；新 hook 依赖数组正确。
- **demoMode 漏建 WS 反致空白**：确认 demo 态仍渲染 MicBar 静态 UI，仅跳过连接逻辑。
