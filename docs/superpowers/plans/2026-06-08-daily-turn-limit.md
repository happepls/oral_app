# 每日对话轮次上限 Implementation Plan（v2 — 双重审查修正版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现每日对话轮次上限（免费 15 / 付费 150 轮），用完硬拦并引导订阅，防年订阅被中重度用户击穿利润。

**Architecture（v2 修正后）:** ai-omni-service 用 Redis `INCR` 维护 `daily_turns:{uid}:{date}`（48h TTL）。
- **计数 + 拦截只发生在两个「真用户练习输入」站点**：`user_audio_ended`（create_response @2901）与 `text_message`/`input_text`（create_response @2914）。系统自动续轮（欢迎语 @1825、magic_pass 推进 @2112/2168、confirm-ask @2273、resend_magic_sentence @2932、user_confirmed_complete @3085）**既不计数也不拦截** —— 它们是已计费对话的延续，非新的用户消费。
- **记账提前到 `response.audio.done` @1878**（裸 Redis `INCR`，在慢 COS 上传之前），但仅对「真用户输入触发的轮」+1：在两个输入分支置 `callback.counts_against_quota = True`，audio.done 处理读它后立即清零。系统轮该 flag 恒 False → 不计数。
- **redis 客户端走 `_get_redis_client()`**（main.py:1189，可返回 `None`），helper 以 `rc` 为**参数**（与 `handle_daily_question(redis, ...)` 既有惯例一致），`rc is None` → fail-open。

**Tech Stack:** Python FastAPI（ai-omni-service）+ redis.asyncio + pytest；React（client）+ Jest。

参考设计：`docs/superpowers/specs/2026-06-08-daily-turn-limit-design.md`

---

## v2 修正记录（双重审查共识缺陷）

| 编号 | 缺陷 | v2 修法 |
|---|---|---|
| C1 | helper 用裸 `await redis.*`，但 `redis` 非模块级（是 `handle_daily_question` 的参数）→ `NameError` | helper 以 `rc` 为参数，调用方 `rc=_get_redis_client()` 传入 |
| C2 | 测试 `patch.object(omni,"redis",fake)` 打错靶（`omni.redis` 不存在） | 测试直接把 `fake_redis` 作参数传入 helper（复刻 daily_qa 测试范式） |
| C3 | `response.audio.done` 非「每用户轮一次」：欢迎语/magic 推进/confirm-ask 都 +1，白扣额度 | 仅对置了 `counts_against_quota` 的轮计数 |
| C4 | 只拦 3 个 msg_type，`resend_magic_sentence`/`user_confirmed_complete` 绕过 | 按设计意图：这些是系统续轮，本就不该计数/拦截；计数+拦截集中在 2 个真用户输入站点 |
| C5 | 前端 `stopRecording?.()` 不存在 | 用 `recorderRef.current?.stopRecording?.()`（RealTimeRecorder imperative handle @66） |
| M1 | `DailyQAPaywallModal` 只收 `{onClose,onUpgrade}` 且 local 未导出、文案硬编码 | 不复用；在 Conversation.js 内联两个模态（inline-style 风格，非 tailwind class） |
| M2 | 记账在 upload 末尾 → 竞态窗口 = 整个 COS 上传时长 | 记账提前到 audio.done @1878（裸 INCR，上传前） |

---

## File Structure

- `services/ai-omni-service/app/main.py` — 计数 helper（参数化 `rc`）+ 常量 + 2 处输入分支拦截 + audio.done 记账 + `WebSocketCallback.counts_against_quota` 属性
- `services/ai-omni-service/tests/test_daily_turn_limit.py` — 新建，helper + 拦截判定单测（复刻 test_daily_qa.py stub 头 + `_FakeRedis` 加 incr/expire）
- `client/src/pages/dailyLimitLogic.js` — 新建，纯函数 `resolveDailyLimitModal`
- `client/src/pages/Conversation.js` — `switch(data.type)` 加 `case 'daily_limit_reached'` + modal state + 内联模态 + 停录
- `client/src/__tests__/daily-limit-logic.test.js` — 新建，纯逻辑测试

---

## 已验证非问题（执行时勿误改）

- **D（无计费 bug）**：`subscription_status` 已贯通 `users`(init.sql:17) → `User.findById` `SELECT u.*` → `getProfile` → `get_user_context`(main.py:132) → `callback.user_context`。`_assert_pro`(1184) 已同样读取。Pro 上限正确判 150。
- `callback.user_id`(1460)/`callback.user_context`(1458) 存在；WS loop 内 callback 局部变量名为 `callback`(2655)。
- `force_advance_magic`(2964)/`reset_magic_phase`(2947) 只重配 prompt（`_update_session_prompt`），不生成 AI 轮 → 正确不在范围。
- 重连逻辑(2842-2859)不绕过拦截（仅重建 conversation，仍走输入分支）。

---

## Task 1: 计数常量 + 参数化 helper（ai-omni）

**Files:**
- Modify: `services/ai-omni-service/app/main.py`（`_today_utc_str()` 定义在 663 行，常量与 helper 加在其后；helper 以 `rc` 为参数）
- Test: `services/ai-omni-service/tests/test_daily_turn_limit.py`（新建）

- [ ] **Step 1: 建测试底座（复刻 test_daily_qa.py stub 头 + FakeRedis 加 incr/expire）**

新建 `services/ai-omni-service/tests/test_daily_turn_limit.py`。**照搬 `test_daily_qa.py` 第 1-138 行**（path 注入 + dashscope/redis sys.modules stub + `import main as _main_module`），仅对 `_FakeRedis` 类**补两个方法** `incr`/`expire`，并补 `fake_redis`/`user_id`/`today_iso` fixture：

```python
"""Tests for 每日对话轮次上限 (daily turn limit)."""
import asyncio, json, os, sys, types
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

_HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(_HERE, ".."))
sys.path.insert(0, os.path.join(_HERE, "..", "app"))

def _install_stub(name, module):
    if name not in sys.modules:
        sys.modules[name] = module

# --- stub dashscope (与 test_daily_qa.py 一致) ---
_ds = types.ModuleType("dashscope")
class _Generation:
    @staticmethod
    def call(*a, **k): raise RuntimeError("stub")
_ds.Generation = _Generation
_ds.api_key = None
_ds_audio = types.ModuleType("dashscope.audio")
_ds_qwen_omni = types.ModuleType("dashscope.audio.qwen_omni")
class _OmniStub: pass
_ds_qwen_omni.OmniRealtimeCallback = _OmniStub
_ds_qwen_omni.OmniRealtimeConversation = _OmniStub
_ds_qwen_omni.MultiModality = _OmniStub
_ds_qwen_omni.AudioFormat = _OmniStub
_ds.audio = _ds_audio
_ds_audio.qwen_omni = _ds_qwen_omni
_install_stub("dashscope", _ds)
_install_stub("dashscope.audio", _ds_audio)
_install_stub("dashscope.audio.qwen_omni", _ds_qwen_omni)
os.environ.setdefault("QWEN3_OMNI_API_KEY", "test-key")

# --- stub redis / redis.asyncio （FakeRedis 加 incr/expire） ---
_redis_mod = types.ModuleType("redis")
_redis_async = types.ModuleType("redis.asyncio")
class _FakeRedis:
    def __init__(self):
        self._store = {}
        self._ttl = {}
    async def get(self, key):
        return self._store.get(key)
    async def setex(self, key, ttl, value):
        self._store[key] = value; self._ttl[key] = ttl; return True
    async def incr(self, key):
        self._store[key] = str(int(self._store.get(key, 0)) + 1)
        return int(self._store[key])
    async def expire(self, key, ttl):
        self._ttl[key] = ttl; return True
    async def ttl(self, key):
        return self._ttl.get(key, -1)
_redis_async.Redis = _FakeRedis
_redis_async.from_url = lambda *a, **kw: _FakeRedis()
_redis_mod.asyncio = _redis_async
_install_stub("redis", _redis_mod)
_install_stub("redis.asyncio", _redis_async)

import main as omni  # noqa: E402

@pytest.fixture
def fake_redis():
    return _FakeRedis()

@pytest.fixture
def user_id():
    return "user_abc_123"
```

> 关键：`import main as omni`（**非** `from app import main`）—— 与 test_daily_qa.py 一致，因 `sys.path` 已注入 `app/`。

- [ ] **Step 2: 写 helper 失败测试（helper 以 `rc` 为参数，无 patch）**

```python
@pytest.mark.asyncio
async def test_incr_and_get_daily_turns(fake_redis):
    assert await omni._get_daily_turns(fake_redis, "u1") == 0
    await omni._incr_daily_turns(fake_redis, "u1")
    await omni._incr_daily_turns(fake_redis, "u1")
    assert await omni._get_daily_turns(fake_redis, "u1") == 2
    key = omni._daily_turn_key("u1")
    assert await fake_redis.ttl(key) == 48 * 3600

def test_daily_turn_limit_by_tier():
    assert omni._daily_turn_limit({"subscription_status": "active"}) == omni.PRO_DAILY_TURNS
    assert omni._daily_turn_limit({"subscription_status": "free"}) == omni.FREE_DAILY_TURNS
    assert omni._daily_turn_limit({}) == omni.FREE_DAILY_TURNS
    assert omni._daily_turn_limit(None) == omni.FREE_DAILY_TURNS

@pytest.mark.asyncio
async def test_get_daily_turns_fail_open_on_none_client():
    # rc=None（redis 库缺失 / 初始化失败）→ fail-open 返回 0
    assert await omni._get_daily_turns(None, "u1") == 0

@pytest.mark.asyncio
async def test_get_daily_turns_fail_open_on_redis_error():
    class _Boom:
        async def get(self, *a, **k): raise RuntimeError("redis down")
    assert await omni._get_daily_turns(_Boom(), "u1") == 0

@pytest.mark.asyncio
async def test_incr_fail_open_on_none_client():
    # rc=None → 静默返回 0，不抛
    assert await omni._incr_daily_turns(None, "u1") == 0
```

- [ ] **Step 3: 运行确认失败**

Run: `cd services/ai-omni-service && python -m pytest tests/test_daily_turn_limit.py -q`
Expected: FAIL（`AttributeError: module 'main' has no attribute '_get_daily_turns'`）

- [ ] **Step 4: 实现常量 + 参数化 helper**

在 `main.py` 的 `_today_utc_str()`（663-666 行）之后插入。**helper 第一参 `rc` 为 redis 客户端，`rc is None` 或抛异常 → fail-open**：

```python
# ── 每日对话轮次上限（成本护栏） ──
FREE_DAILY_TURNS = int(os.getenv("FREE_DAILY_TURNS", "15"))
PRO_DAILY_TURNS = int(os.getenv("PRO_DAILY_TURNS", "150"))
_DAILY_TURN_TTL_SECONDS = 48 * 3600  # 容忍跨日，与 daily_qa 一致

def _daily_turn_key(user_id: str) -> str:
    return f"daily_turns:{user_id}:{_today_utc_str()}"

async def _get_daily_turns(rc, user_id: str) -> int:
    """当日已用轮次。rc=None 或 Redis 故障 → fail-open 返回 0（成本护栏非安全边界）。"""
    if rc is None:
        return 0
    try:
        raw = await rc.get(_daily_turn_key(user_id))
        return int(raw or 0)
    except Exception as e:
        logger.warning(f"[DailyLimit] _get_daily_turns fail-open: {e}")
        return 0

async def _incr_daily_turns(rc, user_id: str) -> int:
    """真用户轮的 AI 语音完成后 +1，并续 48h TTL。rc=None/故障 → 静默返回 0（不阻断主流程）。"""
    if rc is None:
        return 0
    try:
        key = _daily_turn_key(user_id)
        n = await rc.incr(key)
        await rc.expire(key, _DAILY_TURN_TTL_SECONDS)
        return n
    except Exception as e:
        logger.warning(f"[DailyLimit] _incr_daily_turns failed: {e}")
        return 0

def _daily_turn_limit(user_ctx: dict) -> int:
    status = (user_ctx or {}).get("subscription_status")
    return PRO_DAILY_TURNS if status == "active" else FREE_DAILY_TURNS

async def _check_daily_limit(rc, user_id: str, user_ctx: dict):
    """返回 (blocked: bool, info: dict)。info 含 tier/used/limit，供 WS 事件用。"""
    limit = _daily_turn_limit(user_ctx)
    used = await _get_daily_turns(rc, user_id)
    tier = "pro" if (user_ctx or {}).get("subscription_status") == "active" else "free"
    return (used >= limit, {"tier": tier, "used": used, "limit": limit})
```

> `_get_redis_client()`（main.py:1189）是既有的 lazy singleton 访问器，调用方在 WS endpoint 取一次 `rc` 传入这些 helper。**不要**在 helper 内调 `_get_redis_client()`——保持纯函数可测（测试直接传 `fake_redis`）。

- [ ] **Step 5: 运行确认通过**

Run: `cd services/ai-omni-service && python -m pytest tests/test_daily_turn_limit.py -q`
Expected: PASS（5 tests）

- [ ] **Step 6: 提交**

```bash
git add services/ai-omni-service/app/main.py services/ai-omni-service/tests/test_daily_turn_limit.py
git commit -m "feat(ai-omni): 每日轮次计数 helper（参数化 rc + fail-open + 分档上限 + _check_daily_limit）"
```

---

## Task 2: 记账 — audio.done 处理内 INCR（仅真用户轮，提前到上传前）

**Files:**
- Modify: `services/ai-omni-service/app/main.py`（`WebSocketCallback.__init__` 加属性；`response.audio.done` 处理 @1876-1879；2 输入分支置 flag）
- Test: `services/ai-omni-service/tests/test_daily_turn_limit.py`

- [ ] **Step 1: 写记账累加测试**

```python
@pytest.mark.asyncio
async def test_incr_called_n_times(fake_redis):
    for _ in range(3):
        await omni._incr_daily_turns(fake_redis, "u9")
    assert await omni._get_daily_turns(fake_redis, "u9") == 3
```

Run: `cd services/ai-omni-service && python -m pytest tests/test_daily_turn_limit.py::test_incr_called_n_times -q` → PASS（验证累加语义）。

- [ ] **Step 2: 加 callback 属性 `counts_against_quota`**

在 `WebSocketCallback.__init__`（`self.user_id = user_id` @1460 附近）加：

```python
        self.counts_against_quota = False  # 仅真用户练习输入触发的轮才计入每日额度
```

- [ ] **Step 3: 在 audio.done 处理内记账（提前到 buffer 取出后、慢上传前）**

在 `response.audio.done` 分支（@1876），`data = bytes(self.ai_audio_buffer)` 之后（@1878-1879）、`upload_ai_task` 调度之前，插入：

```python
                        # ── 每日轮次记账：仅对真用户输入触发的轮，且在慢 COS 上传之前 ──
                        if self.counts_against_quota:
                            self.counts_against_quota = False  # 立即清零，防系统续轮误计
                            try:
                                _rc_incr = _get_redis_client()
                                await _incr_daily_turns(_rc_incr, self.user_id)
                            except Exception as _e:
                                logger.warning(f"[DailyLimit] incr on audio.done failed: {_e}")
```

> 时序：真用户输入分支置 `counts_against_quota=True` → 该轮 AI 语音完成 → audio.done 读 flag → INCR 并清零。系统续轮（欢迎/magic/confirm/resend/user_confirmed）从不置 flag → 不计数。INCR 在 COS 上传之前 → 竞态窗口收窄到一个事件循环 tick（修 M2）。

- [ ] **Step 4: 语法校验**

Run: `cd services/ai-omni-service && python3 -m py_compile app/main.py` → 无输出。

- [ ] **Step 5: 提交**

```bash
git add services/ai-omni-service/app/main.py services/ai-omni-service/tests/test_daily_turn_limit.py
git commit -m "feat(ai-omni): audio.done 提前记账每日轮次（仅真用户轮 + 上传前 INCR）"
```

---

## Task 3: 拦截 — 2 个真用户输入分支生成前查上限（ai-omni）

**Files:**
- Modify: `services/ai-omni-service/app/main.py`（`user_audio_ended` @2886、`text_message`/`input_text` @2907）
- Test: `services/ai-omni-service/tests/test_daily_turn_limit.py`

- [ ] **Step 1: 写拦截判定测试**

```python
@pytest.mark.asyncio
async def test_check_daily_limit_blocks_at_limit(fake_redis):
    for _ in range(omni.FREE_DAILY_TURNS):
        await omni._incr_daily_turns(fake_redis, "uF")
    blocked, info = await omni._check_daily_limit(fake_redis, "uF", {"subscription_status": "free"})
    assert blocked is True
    assert info == {"tier": "free", "used": omni.FREE_DAILY_TURNS, "limit": omni.FREE_DAILY_TURNS}

@pytest.mark.asyncio
async def test_check_daily_limit_allows_below(fake_redis):
    await omni._incr_daily_turns(fake_redis, "uP")
    blocked, info = await omni._check_daily_limit(fake_redis, "uP", {"subscription_status": "active"})
    assert blocked is False
    assert info["tier"] == "pro"
    assert info["used"] == 1
    assert info["limit"] == omni.PRO_DAILY_TURNS

@pytest.mark.asyncio
async def test_check_daily_limit_fail_open_none_client():
    blocked, info = await omni._check_daily_limit(None, "uX", {"subscription_status": "free"})
    assert blocked is False  # used=0 < limit
    assert info["used"] == 0
```

Run → `_check_daily_limit` 已在 Task1 实现，应 PASS。若 Task1 未含可移此处实现。

- [ ] **Step 2: 在 `user_audio_ended` 分支接入拦截 + 置 flag**

原分支（@2886-2903）：

```python
                elif msg_type == 'user_audio_ended':
                    if callback.user_audio_buffer:
                        if callback.is_connected:
                            try:
                                conversation.commit()
                            ...
                        asyncio.create_task(upload_user_task(audio_data))
                    if callback.is_connected:
                        try:
                            conversation.create_response()
                        ...
```

改为：**在 `commit()`/`create_response()` 之前**查上限，超限 → 推事件 + `continue`（丢本轮，不生成）；否则置 `counts_against_quota = True`：

```python
                elif msg_type == 'user_audio_ended':
                    _rc = _get_redis_client()
                    _blocked, _info = await _check_daily_limit(_rc, callback.user_id, callback.user_context)
                    if _blocked:
                        callback.user_audio_buffer = bytearray()  # 丢弃未提交的本地音频
                        await websocket.send_json({"type": "daily_limit_reached", **_info})
                        logger.info(f"[DailyLimit] blocked(audio) user={callback.user_id} {_info}")
                        continue
                    callback.counts_against_quota = True  # 本轮是真用户练习输入 → 记入额度
                    if callback.user_audio_buffer:
                        ...（原 commit / upload_user_task 逻辑不变）
                    if callback.is_connected:
                        try:
                            conversation.create_response()
                        ...（不变）
```

> 注：`audio_stream` 分支（@2861）已逐块 `append_audio` 到 DashScope，但**只有 `commit()`+`create_response()` 才触发生成计费**。在它们之前 `continue` 即省 audio output 主成本。清本地 buffer 仅防 user_audio COS 上传，不影响拦截有效性。

- [ ] **Step 3: 在 `text_message`/`input_text` 分支接入拦截 + 置 flag**

原分支（@2907-2916）：在 `conversation.send_raw(...conversation.item.create...)` + `create_response()` **之前**加守卫：

```python
                elif msg_type in ['text_message', 'input_text']:
                    text = payload.get('text')
                    if text:
                        _rc = _get_redis_client()
                        _blocked, _info = await _check_daily_limit(_rc, callback.user_id, callback.user_context)
                        if _blocked:
                            await websocket.send_json({"type": "daily_limit_reached", **_info})
                            logger.info(f"[DailyLimit] blocked(text) user={callback.user_id} {_info}")
                            continue
                        callback.counts_against_quota = True
                        callback.messages.append({"role": "user", "content": text, "timestamp": datetime.utcnow().isoformat()})
                        if callback.is_connected:
                            try:
                                conversation.send_raw(json.dumps({...}))  # 原逻辑不变
                                conversation.create_response()
                            ...（不变）
```

> **关键：仅这 2 个分支置 `counts_against_quota` 与拦截。** 系统续轮站点（welcome @1825、magic_pass @2112/2168、confirm-ask @2273、resend_magic_sentence @2932、user_confirmed_complete @3085）**一律不动** —— 它们既不计数也不拦截（设计意图：已计费对话的系统延续，非新用户消费）。这同时关闭 C3（系统轮不计）与 C4（无「绕过」概念，因这些本就免计免拦）。

- [ ] **Step 4: 语法校验 + 全量 ai-omni 测试**

```bash
cd services/ai-omni-service && python3 -m py_compile app/main.py
python -m pytest tests/ -q
```
Expected: py_compile 无输出；pytest 全绿（test_daily_turn_limit 9 例 + 既有 test_daily_qa 16 例无回归）。

- [ ] **Step 5: 提交**

```bash
git add services/ai-omni-service/app/main.py services/ai-omni-service/tests/test_daily_turn_limit.py
git commit -m "feat(ai-omni): 2 个真用户输入分支生成前拦截每日上限，超限推 daily_limit_reached"
```

---

## Task 4: 前端 — daily_limit_reached 处理（client）

**Files:**
- New: `client/src/pages/dailyLimitLogic.js`
- New: `client/src/__tests__/daily-limit-logic.test.js`
- Modify: `client/src/pages/Conversation.js`（`switch(data.type)` 加 case @1811 前 + state @509 后 + 内联模态 + 停录）

- [ ] **Step 1: 写纯逻辑测试**

```javascript
// client/src/__tests__/daily-limit-logic.test.js
import { resolveDailyLimitModal } from '../pages/dailyLimitLogic';

describe('resolveDailyLimitModal', () => {
  test('free tier → paywall modal + 引导订阅', () => {
    expect(resolveDailyLimitModal({ tier: 'free', used: 15, limit: 15 }))
      .toEqual({ kind: 'paywall', ctaToSubscription: true, used: 15, limit: 15 });
  });
  test('pro tier → 明日再来，无 CTA', () => {
    expect(resolveDailyLimitModal({ tier: 'pro', used: 150, limit: 150 }))
      .toEqual({ kind: 'come_back_tomorrow', ctaToSubscription: false, used: 150, limit: 150 });
  });
  test('缺字段降级为 free paywall', () => {
    expect(resolveDailyLimitModal({}).kind).toBe('paywall');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd client && CI=true npx react-app-rewired test --watchAll=false src/__tests__/daily-limit-logic.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现纯函数模块**

新建 `client/src/pages/dailyLimitLogic.js`：

```javascript
// 决定每日上限事件弹哪种 modal。纯函数，便于测试。
export function resolveDailyLimitModal(info) {
  const tier = info && info.tier === 'pro' ? 'pro' : 'free';
  const used = (info && info.used) ?? 0;
  const limit = (info && info.limit) ?? 0;
  if (tier === 'pro') {
    return { kind: 'come_back_tomorrow', ctaToSubscription: false, used, limit };
  }
  return { kind: 'paywall', ctaToSubscription: true, used, limit };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd client && CI=true npx react-app-rewired test --watchAll=false src/__tests__/daily-limit-logic.test.js`
Expected: PASS（3 tests）

- [ ] **Step 5: 接入 Conversation.js**

**(a) 顶部 import**（与其他 `./` 同级 import 一起）：

```javascript
import { resolveDailyLimitModal } from './dailyLimitLogic';
```

**(b) state**（在 `const [taskReadyToComplete, ...]` @509 之后）：

```javascript
  const [dailyLimitModal, setDailyLimitModal] = useState(null);
```

**(c) WS handler**：`switch (data.type)` 是 `case`/`break` 结构（**非** if/else）。在 `default:`（@1811）**之前**新增 case：

```javascript
        case 'daily_limit_reached': {
           console.log('⛔ Daily limit reached', data);
           const modal = resolveDailyLimitModal(data);
           setDailyLimitModal(modal);
           // 停录，禁止继续发：RealTimeRecorder imperative handle（@66）
           try { recorderRef.current?.stopRecording?.(); } catch (_) {}
           break;
        }
```

**(d) 内联模态渲染**（在组件 return 的 JSX 里，与其他模态如 `DailyQAPassModal` 同处；用 inline-style 复刻 Discovery 的 `DailyQAPaywallModal` 风格，**不用 tailwind class**）：

```jsx
      {dailyLimitModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
          }}
          onClick={() => setDailyLimitModal(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF', borderRadius: 24, padding: 32,
              maxWidth: 360, width: '90%', textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>
              {dailyLimitModal.kind === 'paywall' ? '🔒' : '🌙'}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>
              {dailyLimitModal.kind === 'paywall' ? '今日免费对话已用完' : '今日对话已达上限'}
            </h2>
            <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 24, lineHeight: 1.55 }}>
              {dailyLimitModal.kind === 'paywall'
                ? `免费版每日 ${dailyLimitModal.limit} 轮已用完，升级 Pro 解锁更多练习。`
                : `已达每日 ${dailyLimitModal.limit} 轮上限，明日继续练习。`}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setDailyLimitModal(null)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 12,
                  background: '#F3F4F6', color: '#374151', border: 'none',
                  fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}>
                {dailyLimitModal.kind === 'paywall' ? '取消' : '知道了'}
              </button>
              {dailyLimitModal.ctaToSubscription && (
                <button
                  onClick={() => navigate('/subscription')}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 12,
                    background: '#6366F1', color: '#fff', border: 'none',
                    fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  }}>
                  去升级
                </button>
              )}
            </div>
          </div>
        </div>
      )}
```

> `navigate`（@378 `useNavigate()`）与 `recorderRef`（@687）均已存在，直接用。

- [ ] **Step 6: 前端 build 校验**

Run: `cd client && npm run build`
Expected: `Compiled`（可有既有 lint warnings，无新 error）。

- [ ] **Step 7: 提交**

```bash
git add client/src/pages/dailyLimitLogic.js client/src/__tests__/daily-limit-logic.test.js client/src/pages/Conversation.js
git commit -m "feat(client): 每日轮次上限 daily_limit_reached 处理（免费 paywall / 付费明日再来 + 停录）"
```

---

## Task 5: 端到端验证 + 文档

> ⚠️ **本任务涉及重启本地 Docker 服务 ai-omni 及浏览器测试，会影响本地运行环境。执行前必须暂停并提示用户确认，得到明确同意后才继续。**

**Files:**
- 验证：Docker 重启 ai-omni + 前端 build
- Modify: `CLAUDE.md`（每日上限节，QWEN.md=symlink 自动同步）；`docs/TODO.md`；`services/ai-omni-service/.env.example`

- [ ] **Step 0: 暂停 — 向用户确认可以重启本地服务 + 跑浏览器测试**

- [ ] **Step 1: 临时调低上限重建 ai-omni**

`services/ai-omni-service/.env` 加 `FREE_DAILY_TURNS=2`、`PRO_DAILY_TURNS=2`，热加载（Python 源改动无 requirements 变动）：

```bash
docker cp services/ai-omni-service/app/main.py oral_app_ai_omni_service:/app/app/main.py
docker compose restart ai-omni-service
docker compose logs --tail=10 ai-omni-service | grep -iE "error|started|listening"
```

- [ ] **Step 2: 浏览器走对话至超限（验证仅真用户轮计数）**

前端 `cd client && npm run build`。登录测试账号 → 进对话 → 连说：
- 第 1-2 轮正常 AI 语音回复
- 第 3 轮输入 → 收 `daily_limit_reached` → 免费弹 paywall 模态 + 停录
- **验证欢迎语/magic 推进不计数**：`redis-cli GET daily_turns:{uid}:{date}` == 2（不是 3+），`TTL` ~172800

- [ ] **Step 3: 验证付费 + fail-open**

- 测试账号 DB `subscription_status='active'`（PRO 上限临时 =2）→ 重测 → 弹「明日再来」（无 CTA）
- `docker compose stop redis` → 对话仍可继续（fail-open），日志见 `[DailyLimit] ... fail-open` 或 rc=None 静默 → `docker compose start redis`

- [ ] **Step 4: 还原配置 + 全量回归**

删 .env 临时上限（恢复 15/150），重启 ai-omni：

```bash
cd services/ai-omni-service && python -m pytest tests/ -q
cd ../../client && CI=true npx react-app-rewired test --watchAll=false src/__tests__/daily-limit-logic.test.js
```
Expected: 全绿。

- [ ] **Step 5: 更新文档（SSOT）**

`CLAUDE.md` 加「每日对话轮次上限」节（QWEN.md 为 symlink 自动同步）：免费 15/付费 150、Redis `daily_turns:{uid}:{date}` 48h、**计数+拦截仅在 2 个真用户输入站点**、记账提前到 audio.done（仅 `counts_against_quota` 轮）、系统续轮免计免拦、fail-open（rc=None/异常）、env `FREE_DAILY_TURNS`/`PRO_DAILY_TURNS`。
`services/ai-omni-service/.env.example` 加两 env 注释。
`docs/TODO.md` 标记每日上限 backlog 完成。

- [ ] **Step 6: 提交**

```bash
git add CLAUDE.md docs/TODO.md services/ai-omni-service/.env.example
git commit -m "docs: 每日轮次上限文档 + TODO 收尾"
```

---

## Self-Review 结论（v2）

- **Spec 覆盖**：计数存储(Task1 Redis helper 参数化)/拦截点(Task3 2 个真用户输入站点生成前)/记账(Task2 audio.done 提前 + flag 门控)/超限行为(Task4 免费 paywall+付费明日再来+停录)/fail-open(Task1 rc=None/异常 + 验证 Task5)/全局作用域(单一 key 跨模式累计)/分档上限(Task1 `_daily_turn_limit`) — 全有对应任务。
- **审查缺陷闭环**：C1(参数化 rc)/C2(传 fake 不 patch)/C3(counts_against_quota 门控)/C4(只在真用户站点计/拦，系统续轮免计免拦)/C5(recorderRef.stopRecording)/M1(内联模态 inline-style)/M2(audio.done 提前 INCR) — 全部修正，见上方修正记录表。
- **类型一致**：`_check_daily_limit(rc,uid,ctx) -> (bool, {tier,used,limit})` 在 Task1 定义、Task3 消费、Task4 前端 `resolveDailyLimitModal` 按同结构解析 — 一致。
- **复用**：`_today_utc_str`(663)/`_get_redis_client`(1189)/`response.audio.done`(1876)/2 输入分支(2886/2907)/`recorderRef`(687)/`navigate`(378)/Discovery `DailyQAPaywallModal` 样式参照 — 均已实地定位。
- **已验证前提**：`subscription_status` 经 profile 进 `user_context`（init.sql:17 → `SELECT u.*` → get_user_context），`_daily_turn_limit` 可读 → Pro 正确判 150，无计费 bug。
