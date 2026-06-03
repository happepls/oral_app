# App 后台 Live Activity 方案规划

> 对应 backlog [Feature] "Tell me a good way to plan a live activity for when I background the app."
> 目标：用户把 App 切到后台 / 锁屏后，仍能感知正在进行的练习状态（如复述进度、对话计时、打卡提醒），降低中断流失。
>
> ⚠️ **前置决策（需产品/技术拍板，见文末）**：当前代码栈是 **React Web (PWA)**，不是原生 iOS/RN。
> 真正的 iOS "Live Activity"（灵动岛/锁屏卡片）需 **ActivityKit（原生 Swift / WidgetKit）**，Web/PWA 无法直接调用。
> 因此方案按「平台能力」分档给出，落地范围取决于打包方式。

---

## 一、术语澄清：三种"后台活动"

| 概念 | 平台 | 能力 | 本项目当前可达性 |
|---|---|---|---|
| **iOS Live Activity** (灵动岛/锁屏实时卡片) | iOS 16.1+ | ActivityKit + WidgetKit，最长 8h，远程 push 更新 | ❌ 需原生壳 (Capacitor+原生插件 / RN / 纯原生) |
| **Android Foreground Service + Ongoing Notification** | Android | 常驻通知 + 可更新进度条 | ❌ 需原生壳 |
| **Web 后台能力** (PWA) | 浏览器 | Notification / Badging / 有限 background | ⚠️ 部分可达，受浏览器限制大 |

---

## 二、按平台分档方案

### 档位 A — 纯 Web / PWA（当前栈，今天就能做的子集）

Web 在后台被浏览器严格限流（JS 计时器节流、连接可能被杀）。**不能**做真正的实时灵动岛，但可做：

1. **Notifications API（本地通知）**
   - 复述/对话进行中切后台 → 发一条「练习进行中，点此继续」通知。
   - 完成/打卡里程碑 → 通知提醒回流。
   - 需用户授权 `Notification.requestPermission()`；iOS Safari 仅在**已安装 PWA**时支持。

2. **App Badging API** (`navigator.setAppBadge`)
   - PWA 图标角标显示「今日待办环」未完成数（复述/问答/练习）。
   - 与现有 `daily_practice_time` / daily-QA / recall 三环数据天然契合。

3. **Page Visibility API**（已可用，无需授权）
   - `visibilitychange` 监听切后台：暂停音频、记录"离开时进度"、回前台恢复。
   - 对 `Conversation.js` 的 WebSocket/音频队列尤其重要（防后台跑飞）。

4. **Service Worker + Push（可选，重）**
   - 服务端推送「该复习了/连续打卡别断」——但 iOS PWA push 限制多，ROI 需评估。

> **WebSocket 后台存活**：浏览器后台可能断 WS。回前台应走现有重连逻辑（`Conversation.js` 已有 reconnect）。建议切后台时**主动暂停**而非维持连接，省成本 + 避免半死连接。

### 档位 B — Capacitor / 原生壳包 Web（中等改造）

若用 Capacitor 把现有 Web 包成 App：
- iOS Live Activity：写一个**原生 ActivityKit 插件**（Swift），JS 通过 bridge 调用 `start/update/end`。
- Android：原生 Foreground Service 插件 + Ongoing Notification。
- 复用现有全部 React 业务，只加原生通知/活动层。**性价比最高的"真 Live Activity"路径。**

### 档位 C — 纯原生 / RN（重）

仅当决定放弃 Web 栈、转原生时考虑。成本最高，不建议为单一功能上马。

---

## 三、推荐落地路线（增量）

```
Phase 1 (Web，低成本，先上)：
  Page Visibility 切后台暂停/恢复（Conversation + Recall）
  + 本地 Notification 里程碑/回流提醒
  + App Badging 三环未完成角标

Phase 2 (Capacitor 壳，若已计划上架 App Store)：
  原生 ActivityKit/Foreground Service 插件
  → 复述进度 / 对话计时 真·灵动岛/锁屏卡片

Phase 3 (可选)：
  Service Worker Push 召回（评估 iOS PWA 限制后再定）
```

**Live Activity 内容设计（Phase 2，承载什么）**：
- 复述模式：`X / N 句` 进度 + 当前阶段（跟读/背诵）
- 对话模式：练习计时 + 当前任务标题
- 打卡：今日三环完成度，点击回 App 对应页

---

## 四、待决策（阻塞落地，需用户/产品确认）

- [ ] **目标平台**：iOS / Android / Web-PWA 各自优先级？（决定档位 A/B/C）
- [ ] **打包方式**：维持纯 Web，还是引入 Capacitor 壳？（决定能否做真 Live Activity）
- [ ] **是否已规划上架 App Store/Play**？（IAP 合规见 Commercialization_Guide 第三阶段）
- [ ] Phase 1 是否现在就做？（纯 Web 子集，无需平台决策即可启动）

---

_最后更新：2026-06-03 · 关联 [[Commercialization_Guide.md]] · 落地范围取决于平台/打包决策_
