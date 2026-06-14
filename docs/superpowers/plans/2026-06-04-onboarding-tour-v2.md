# Onboarding Tour v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Onboarding Tour 从 3 步扩展到 6 步并加「上一步」跨页回退导航。

**Architecture:** 复用已有自研 tour 系统（TourContext + Spotlight + useAnchorRect）。扩 `TOUR_STEPS` 到 6 项、加 `getPrevStep`/`prev()` 纯逻辑+编排、Spotlight 气泡加「上一步」按钮（首步禁用）、Discovery/Conversation 加 3 个新 `data-tour` 锚点、i18n 加新文案。

**Tech Stack:** React 19 + react-router v7 + motion@12 + react-i18next；TDD（jest / react-app-rewired）。

> 关联 spec：`docs/superpowers/specs/2026-06-03-onboarding-tour-design.md` §11-15
> 约定：纯逻辑测试 verbatim 复制（项目惯例）；前端改完 `npm run build`；CI build 既有 lint 债非本次回归（baseline 同失败）。

---

## 阶段 0 — 锚点勘察（只读）

- [ ] 0.1 确认 Discovery 今日任务 section 外层标签：`Discovery.js` ~L789 `{dailyProgress && (<section>` —— `data-tour="today-tasks"` 挂该 `<section>`。
- [ ] 0.2 确认 Discovery 4 格统计 section：`Discovery.js` ~L911 `{/* ── 4格统计 ── */}<section>` —— `data-tour="stats"` 挂该 `<section>`。
- [ ] 0.3 确认 Conversation CC 切换按钮：`Conversation.js` ~L3137 `{!ccMode && (<button onClick={() => setCcMode(true)}` —— 该按钮无独立容器，需包一层 `<div data-tour="cc-mode" className="contents">` 或直接在 button 加 `data-tour`。决定直接给 button 加 `data-tour="cc-mode"`（demo 态 `!ccMode` 恒为 true → 按钮恒在）。

**产出**：确认上述 3 行号当前值，写入勾选备注。

---

## 阶段 1 — 纯逻辑 TDD（getPrevStep）

**Files:**
- Test: `client/src/__tests__/tour-logic.test.js`（已存在，追加）

- [ ] **1.1 写 getPrevStep 失败测试**

在 `tour-logic.test.js` 的「Replicate from TourContext.js」段（`getNextStep` 后）加函数：

```js
// Returns the previous step index, or null when already on the first step.
function getPrevStep(idx) {
  if (typeof idx !== 'number') return null;
  return idx > 0 ? idx - 1 : null;
}
```

在 `describe('getNextStep', ...)` 之后加 describe 块：

```js
describe('getPrevStep', () => {
  test('goes back mid-sequence', () => {
    expect(getPrevStep(2)).toBe(1);
    expect(getPrevStep(1)).toBe(0);
  });

  test('returns null on first step', () => {
    expect(getPrevStep(0)).toBeNull();
  });

  test('returns null for invalid input', () => {
    expect(getPrevStep(undefined)).toBeNull();
  });
});
```

- [ ] **1.2 跑测试确认通过（test 自含函数）**

Run: `cd client && CI=true npx react-app-rewired test --watchAll=false tour-logic`
Expected: PASS（新增 3 例，共 17 例）。

- [ ] **1.3 Commit**

```bash
git add client/src/__tests__/tour-logic.test.js
git commit -m "test(onboarding-tour): getPrevStep 纯逻辑测试"
```

---

## 阶段 2 — TourContext：6 步 + prev() 编排

**Files:**
- Modify: `client/src/contexts/TourContext.js`

- [ ] **2.1 替换 TOUR_STEPS 为 6 步**

将现有 `export const TOUR_STEPS = [...]`（3 项）整体替换为：

```js
// Step sequence (design §11). `anchor` matches data-tour="<anchor>" in pages.
export const TOUR_STEPS = [
  { id: 'today-tasks',   route: '/discovery',              anchor: 'today-tasks',
    titleKey: 'tour_step_tasks_title',  bodyKey: 'tour_step_tasks_body',  placement: 'bottom' },
  { id: 'recall-streak', route: '/discovery',              anchor: 'recall-streak',
    titleKey: 'tour_step_streak_title', bodyKey: 'tour_step_streak_body', placement: 'bottom' },
  { id: 'stats',         route: '/discovery',              anchor: 'stats',
    titleKey: 'tour_step_stats_title',  bodyKey: 'tour_step_stats_body',  placement: 'top' },
  { id: 'scenario-card', route: '/discovery',              anchor: 'scenario-card',
    titleKey: 'tour_step_scenario_title', bodyKey: 'tour_step_scenario_body', placement: 'top' },
  { id: 'mic',           route: '/conversation?mode=tour', anchor: 'mic', demoMode: true,
    titleKey: 'tour_step_mic_title',    bodyKey: 'tour_step_mic_body',    placement: 'top' },
  { id: 'cc-mode',       route: '/conversation?mode=tour', anchor: 'cc-mode', demoMode: true,
    titleKey: 'tour_step_cc_title',     bodyKey: 'tour_step_cc_body',     placement: 'top' },
];
```

- [ ] **2.2 加 getPrevStep 导出（紧跟 getNextStep 后）**

在 `export function getNextStep(...) { ... }` 之后加：

```js
// Returns the previous step index, or null when already on the first step.
// (Replicated in tour-logic.test.js — keep in sync.)
export function getPrevStep(idx) {
  if (typeof idx !== 'number') return null;
  return idx > 0 ? idx - 1 : null;
}
```

- [ ] **2.3 加 prev() 编排（紧跟 next 的 useCallback 后）**

在 `const next = useCallback(...)` 之后、`const skip = finish;` 之前加：

```js
  const prev = useCallback(() => {
    setStepIndex((idx) => {
      const pi = getPrevStep(idx);
      if (pi === null) return idx; // first step: no-op (button is disabled in UI)
      const step = TOUR_STEPS[pi];
      if (step && location.pathname !== step.route.split('?')[0]) navigate(step.route);
      return pi;
    });
  }, [navigate, location.pathname]);
```

- [ ] **2.4 把 prev 加入 context value**

将 `const value = { active, stepIndex, completed, start, next, skip, TOUR_STEPS };`
改为：

```js
  const value = { active, stepIndex, completed, start, next, prev, skip, TOUR_STEPS };
```

- [ ] **2.5 TourHost 传 onPrev + isFirst 给 Spotlight**

在 TourHost 的 `<Spotlight ... />` 中，现有 props 后加两行：

```jsx
      onPrev={ctx.prev}
      isFirst={ctx.stepIndex === 0}
      prevLabel={t('tour_prev')}
```

- [ ] **2.6 校验语法 + 跑既有前端测试**

Run: `cd client && CI=true npx react-app-rewired test --watchAll=false tour-logic`
Expected: PASS（纯逻辑不受影响，仍 17 例）。

- [ ] **2.7 Commit**

```bash
git add client/src/contexts/TourContext.js
git commit -m "feat(onboarding-tour): TOUR_STEPS 扩 6 步 + prev() 跨页回退编排"
```

---

## 阶段 3 — Spotlight：「上一步」按钮（首步禁用）

**Files:**
- Modify: `client/src/components/Spotlight.jsx`

- [ ] **3.1 扩展 props 签名**

将组件函数签名中的 props 解构追加 `onPrev`, `isFirst`, `prevLabel`：

```jsx
export default function Spotlight({
  anchor,
  title,
  body,
  stepIndex,
  total,
  isLast,
  isFirst,
  prefer = 'bottom',
  onNext,
  onPrev,
  onSkip,
  nextLabel = 'Next',
  doneLabel = 'Done',
  skipLabel = 'Skip',
  prevLabel = 'Back',
}) {
```

- [ ] **3.2 在气泡按钮行加「上一步」**

定位气泡底部按钮区。当前结构：左侧步数点 dots，右侧 `<div style={{ display:'flex', gap:8 }}>` 含 skip + next。
把右侧那个 `<div>` 整体替换为含「上一步」的版本：

```jsx
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={onSkip}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {skipLabel}
            </button>
            <button
              onClick={isFirst ? undefined : onPrev}
              disabled={isFirst}
              style={{
                background: 'transparent',
                border: '1px solid #E2E8F0',
                color: isFirst ? '#CBD5E1' : '#64748b',
                fontSize: 13,
                padding: '6px 12px',
                borderRadius: 10,
                cursor: isFirst ? 'not-allowed' : 'pointer',
              }}
            >
              {prevLabel}
            </button>
            <button
              onClick={onNext}
              style={{
                background: 'linear-gradient(135deg, #637FF1, #a47af6)',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                padding: '7px 16px',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              {isLast ? doneLabel : nextLabel}
            </button>
          </div>
```

> 注意：步数指示点 `total` 现为 6，dots map 自动按 total 渲染 6 个，无需改。

- [ ] **3.3 build 验证（JSX 编译）**

Run: `cd client && npm run build`
Expected: `Compiled with warnings.`（EXIT=0；新代码无新增 error）。

- [ ] **3.4 Commit**

```bash
git add client/src/components/Spotlight.jsx
git commit -m "feat(onboarding-tour): Spotlight 加「上一步」按钮（首步禁用）"
```

---

## 阶段 4 — 锚点接线（3 个新 data-tour）

**Files:**
- Modify: `client/src/pages/Discovery.js`（2 处）
- Modify: `client/src/pages/Conversation.js`（1 处）

- [ ] **4.1 今日任务 section 加锚点**

`Discovery.js` 定位 `{/* ── 今日任务（合并卡片） ── */}` 下一行 `{dailyProgress && (` 后的 `<section>`：

```jsx
        {/* ── 今日任务（合并卡片） ── */}
        {dailyProgress && (
          <section data-tour="today-tasks">
```

- [ ] **4.2 4 格统计 section 加锚点**

`Discovery.js` 定位 `{/* ── 4格统计 ── */}` 下的 `<section>`：

```jsx
        {/* ── 4格统计 ── */}
        <section data-tour="stats">
```

- [ ] **4.3 CC 切换按钮加锚点**

`Conversation.js` 定位 `{!ccMode && (` 后的 `<button onClick={() => setCcMode(true)}`，在该 button 的 className 同级加 `data-tour="cc-mode"`：

```jsx
                {!ccMode && (
                  <button
                    data-tour="cc-mode"
                    onClick={() => setCcMode(true)}
```

- [ ] **4.4 build 验证**

Run: `cd client && npm run build`
Expected: `Compiled with warnings.`（EXIT=0）。

- [ ] **4.5 Commit**

```bash
git add client/src/pages/Discovery.js client/src/pages/Conversation.js
git commit -m "feat(onboarding-tour): 加 today-tasks/stats/cc-mode 锚点"
```

---

## 阶段 5 — i18n 文案（zh/en，其余 fallback en）

**Files:**
- Modify: `client/src/i18n/locales/zh.json`
- Modify: `client/src/i18n/locales/en.json`

> 旧 key `tour_step1/2/3_*` 已不被引用（新 TOUR_STEPS 用语义 key）。**保留旧 key 不删**（无害，避免误删他处引用）；新增以下 key。

- [ ] **5.1 zh.json 加新 key**

把 zh.json 现有 `"tour_skip": "跳过"` 行（及其后的旧 step key 区块）替换/追加为含新 key。在 `"tour_skip": "跳过"` 之后（同一对象内）追加：

```json
  "tour_prev": "上一步",
  "tour_step_tasks_title": "今日任务",
  "tour_step_tasks_body": "每天 3 个任务：复述、问答、练习，坚持完成。",
  "tour_step_streak_title": "每日打卡",
  "tour_step_streak_body": "每日打卡，坚持下去就能看到进步。",
  "tour_step_stats_title": "学习进度",
  "tour_step_stats_body": "这里查看你的对话数、学习天数与总进度。",
  "tour_step_scenario_title": "选择练习场景",
  "tour_step_scenario_body": "点这里选一个场景，开始你的口语练习。",
  "tour_step_mic_title": "按住说话",
  "tour_step_mic_body": "按住麦克风开口说，AI 会实时陪练并纠正发音。",
  "tour_step_cc_title": "沉浸体验模式",
  "tour_step_cc_body": "开启沉浸体验模式，边说边看字幕辅助理解。"
```

> 若 `tour_skip` 后已是对象结束 `}`，需把 `"tour_skip": "跳过"` 改成 `"tour_skip": "跳过",` 再接上面。

- [ ] **5.2 en.json 加新 key**

en.json `"tour_skip": "Skip"` 之后同样追加：

```json
  "tour_prev": "Back",
  "tour_step_tasks_title": "Daily Tasks",
  "tour_step_tasks_body": "Three tasks a day: recap, Q&A, and practice — keep it up.",
  "tour_step_streak_title": "Daily Check-in",
  "tour_step_streak_body": "Check in every day — consistency drives progress.",
  "tour_step_stats_title": "Your Progress",
  "tour_step_stats_body": "See your total chats, learning days, and overall progress here.",
  "tour_step_scenario_title": "Pick a Scenario",
  "tour_step_scenario_body": "Tap here to choose a scenario and start practicing speaking.",
  "tour_step_mic_title": "Hold to Speak",
  "tour_step_mic_body": "Hold the mic and speak. The AI coaches and corrects you in real time.",
  "tour_step_cc_title": "Immersive Mode",
  "tour_step_cc_body": "Turn on immersive mode to follow live captions while you speak."
```

- [ ] **5.3 JSON 合法性校验**

Run: `node -e "require('./client/src/i18n/locales/zh.json');require('./client/src/i18n/locales/en.json');console.log('JSON_OK')"`
Expected: `JSON_OK`

- [ ] **5.4 Commit**

```bash
git add client/src/i18n/locales/zh.json client/src/i18n/locales/en.json
git commit -m "feat(onboarding-tour): i18n 6 步文案 + tour_prev (zh/en)"
```

---

## 阶段 6 — 验证与回归

- [ ] **6.1 前端纯逻辑测试**

Run: `cd client && CI=true npx react-app-rewired test --watchAll=false tour-logic`
Expected: PASS（17 例）。

- [ ] **6.2 后端 jest 不回归**

Run: `cd services/user-service && npx jest`
Expected: 48 passed（v2 不动后端）。

- [ ] **6.3 build + 部署（client-app bind-mount）**

Run: `cd client && npm run build`
Expected: `Compiled with warnings.` EXIT=0。

验证服务 hash：`curl -s http://localhost:5001/ | grep -oE 'main\.[a-z0-9]+\.js'`，且
`grep -oE "tour_step_tasks|cc-mode|today-tasks" client/build/static/js/main.*.js | sort -u` 含三者。

- [ ] **6.4 手动 E2E（用户走，Claude 监控）**

后端 reset test 用户：
`docker compose exec -T postgres psql -U user -d oral_app -c "UPDATE users SET onboarding_tour_completed=FALSE WHERE username='test5';"`

新账号或重走 goal-setting → 落 Discovery：
1. tour 6 步依次：今日任务→打卡环→统计→场景卡→(跨页)麦克风→CC按钮
2. 「上一步」每步可回退；首步置灰禁用；step5→上一步→回 /discovery step4
3. demo 态 header 显「演示」
4. step6「完成」→ 落 /discovery，POST onboarding-tour/complete
5. 刷新+重登录 → 不再出现

- [ ] **6.5 更新 QWEN.md**

QWEN.md「首次登录引导 Onboarding Tour」段更新步序为 6 步 + prev() 说明。

---

## 阶段 7 — 收尾

- [ ] 7.1 勾选本 plan 完成项。
- [ ] 7.2 不提交临时产物（`.claude/wf-*.js` 已 ignore）。
- [ ] 7.3 等用户决定 push / PR。

---

## 依赖顺序

```
阶段0(勘察) → 阶段1(纯逻辑TDD) → 阶段2(TourContext) → 阶段3(Spotlight)
            → 阶段4(锚点) ∥ 阶段5(i18n) → 阶段6(验证) → 阶段7(收尾)
```
阶段 4 与 5 可并行（锚点 vs 文案无依赖）。阶段 2 依赖 1（getPrevStep）。阶段 3 依赖 2（prop 契约）。

## 风险

- **跨页 prev 时序**：step5→step4 navigate 后 discovery 锚点须就绪 → useAnchorRect observer + 3s 超时兜底已覆盖。
- **CC 按钮 demo 态可见性**：`!ccMode` 恒 true（demo 不进 CC），按钮恒在；若未来 demo 默认开 CC 则锚点失效 → 超时跳过兜底。
- **旧 i18n key 残留**：保留 `tour_step1/2/3_*` 不删（无害）；新代码只引用语义 key。
- **CI build 警告即错**：既有 lint 债 baseline 同失败，本次只确认无 *新增* error（新文件/新代码干净）。
```
