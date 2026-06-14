# 每日对话轮次上限 — 设计文档

**日期**: 2026-06-08
**状态**: 设计待审

## Context

Stripe 订阅上线后,定价为周 $4.99 / 年 $99（≈$8.25/月）。app 用 `qwen3.5-omni-flash-realtime`,音频输出 107 元/百万 token（~$14.86 USD/M）为主成本,每轮 AI 语音回复 ~$0.0054。

**问题**:年订阅 $8.25/月 < 中度用户月成本 $13（重度 $32+）→ **无上限的年订阅对中重度用户必亏损**。同时 `Subscription.js` UI 文案写「免费版每日 3 次 AI 对话」,但代码中**从未实现**该限制（探索确认:WebSocket endpoint 无任何日计数拦截）。

**目标**:实现每日对话轮次上限,**两档都限**:
- 免费用户:每日 15 轮 → 用完引导订阅（促转化 + 补 UI 文案漏洞）
- 付费用户:每日 150 轮 → 仅封顶防极重度用户亏损（多数达不到,体验近乎无感）

## 需求（已确认）

| 决策 | 选定 |
|---|---|
| 限制对象 | 两档都限（免费 15 / 付费 150 轮/日）|
| 「一轮」定义 | 每轮 AI 语音回复（复用 `response.audio.done`）|
| 计数作用域 | 全局每日总轮次（所有模式合计:scene_theater / oral_tutor / recall / daily_qa）|
| 超限行为 | 硬拦 + 引导（免费弹订阅 modal,付费弹「明日再来」）|
| 计数存储 | Redis `INCR`（`daily_turns:{uid}:{date}` + 48h TTL）|
| 拦截位置 | ai-omni-service WebSocket endpoint |

## 架构

### 数据流

```
用户输入（user_audio_ended / text_message / input_text）
  → [拦截] ai-omni 查 Redis daily_turns:{uid}:{date} >= limit?
      ├─ 是 → 不触发 conversation.commit()/response.create
      │       → 推 WS 事件 daily_limit_reached {tier, used, limit}
      │       → 前端:免费弹 DailyQAPaywallModal / 付费弹「明日再来」提示
      └─ 否 → 正常 commit → DashScope 生成 → AI 语音回复
              → response.audio.done（main.py:1876）
              → upload_ai_task 内 INCR daily_turns + 重设 48h TTL
```

**关键时序**:第 N 轮正常完成 → `response.audio.done` 时 INCR 到 N → 第 N+1 轮**输入时**查 `count >= limit` → 拦截。即 limit=15 → 用户实际得到 15 轮完整 AI 语音,第 16 轮被拦。符合直觉,且拦截发生在生成**前**,省下被拦那轮的 audio output 主成本。

### 组件

**1. 计数模块**（ai-omni-service,新增 helper,贴近现有 daily_qa redis 用法）
- `_daily_turn_key(user_id) -> f"daily_turns:{user_id}:{_today_utc_str()}"`（复用现有 `_today_utc_str()` helper,main.py:927,UTC 日期,与 daily_qa 一致 → 每日 UTC 0 点重置）
- `async def _incr_daily_turns(user_id)`:`await redis.incr(key)` + `await redis.expire(key, 48*3600)`（首次 INCR 后设 TTL,48h 与 `_DAILY_QA_TTL_SECONDS` 一致,容忍跨日）
- `async def _get_daily_turns(user_id) -> int`:`int(await redis.get(key) or 0)`
- `def _daily_turn_limit(user_ctx) -> int`:`PRO_DAILY_TURNS if subscription_status=='active' else FREE_DAILY_TURNS`
- 常量:`FREE_DAILY_TURNS = int(os.getenv("FREE_DAILY_TURNS", "15"))`,`PRO_DAILY_TURNS = int(os.getenv("PRO_DAILY_TURNS", "150"))`

**2. 拦截**（WebSocket endpoint,`user_audio_ended` / `text_message` / `input_text` 处理入口,main.py ~L2844-2890）
- 在 `conversation.commit()` / response 触发**前**:
  ```python
  used = await _get_daily_turns(user_id)
  if used >= _daily_turn_limit(user_ctx):
      await websocket.send_json({
          "type": "daily_limit_reached",
          "tier": "pro" if is_pro else "free",
          "used": used,
          "limit": limit,
      })
      continue  # 不 commit、不生成
  ```
- `user_id` / `user_ctx` 已在连接建立时由 `get_user_context`（L132）取得,endpoint 作用域内可用。

**3. 记账**（`upload_ai_task` 内,response.audio.done 后,main.py ~L1885）
- 一轮 AI 语音真正完成 → `await _incr_daily_turns(user_id)`。
- 放在 upload_ai_task（已是 async 后台任务）末尾,不阻塞音频。
- **仅对真实 AI 语音轮计数**:tour demo 模式（`?mode=tour`,不建 WS / 不触发 AI）天然不经过此路径,无需特判。

**4. 前端**（Conversation.js + 复用 DailyQAPaywallModal）
- WS message handler 新增 `daily_limit_reached` 分支:
  - `tier==='free'` → 弹 `DailyQAPaywallModal`（复用现有组件,文案改「今日免费对话已用完,升级解锁更多」）→ 跳 `/subscription`
  - `tier==='pro'` → 弹轻量提示 modal「今日对话已达上限（150 轮）,明日继续」（无订阅 CTA）
- 停止录音 / 禁用输入,避免继续发。

## 边界与错误处理

- **Redis 不可用**:`_get_daily_turns` 异常 → fail-open（返回 0,放行）。计数是成本护栏非安全边界,Redis 抖动不应阻断用户。记 error 日志。
- **跨日**:48h TTL + date_str 切日 → 新 key 自然从 0 起。无需手动重置。
- **并发**:`INCR` 原子,多 WS 消息并发安全。极端并发下可能微超（如限 15 实际 16),可接受。
- **计数与生成解耦**:记账在 upload_ai_task（生成后）,拦截查的是上一轮的累计值。被拦那轮不耗 audio。
- **tour / recall / daily_qa 模式**:全局计数,均计入。daily_qa 的 Pro 门控（`_assert_pro`）与本上限独立叠加。

## 测试

**后端**（ai-omni-service pytest,复用现有 redis mock 模式）
- `_incr_daily_turns` / `_get_daily_turns`:INCR 累加 + TTL 设置 + 跨日新 key。
- `_daily_turn_limit`:active→150,free/None→15,env override 生效。
- 拦截逻辑:used<limit 放行,used>=limit 推 daily_limit_reached 不 commit。
- fail-open:redis 抛异常 → 放行 + 记日志。

**前端**（Conversation 纯逻辑测试）
- `daily_limit_reached` handler:free→paywall modal,pro→明日再来 modal,均停录音。

## 复用清单

| 复用 | 来源 |
|---|---|
| per-day Redis key + TTL 范式 | `daily_qa_pool/passed:{uid}:{date}`,`_DAILY_QA_TTL_SECONDS=48h`（main.py:929-930,562）|
| redis 全局实例（incr/get/expire/setex）| main.py 现有 `await redis.*` 用法 |
| Pro 判定 | `subscription_status == 'active'`（`_assert_pro` main.py:1178）|
| 记账触发点 | `response.audio.done` → `upload_ai_task`（main.py:1876,1885）|
| 拦截入口 | `user_audio_ended`/`text_message`/`input_text`（main.py:2844-2890）|
| 超限 modal | `DailyQAPaywallModal`（Discovery.js 现有,Conversation 复用）|

## 验证（端到端）

1. 免费用户 .env `FREE_DAILY_TURNS=2` 临时调低,连对话 → 第 3 轮输入被拦 → 弹订阅 modal → DB Redis `daily_turns:{uid}:{date}` == 2。
2. 付费用户同理 `PRO_DAILY_TURNS=2` → 弹「明日再来」(无 CTA)。
3. `redis-cli GET daily_turns:{uid}:{date}` 确认计数,`TTL` 确认 ~48h。
4. 杀 redis → 对话仍可继续（fail-open),日志见 warn。
5. 不同模式（scene_theater→recall→daily_qa）轮次累加到同一 key（全局作用域验证)。

## 非目标（YAGNI）

- 不做分模式独立配额（全局即可）。
- 不做 PG 持久化/分析落盘（Redis 足够,本期不需审计）。
- 不做降级到文本模式（硬拦更简单明确,本期选定)。
- 不做管理后台调配额 UI（env 变量足够)。
