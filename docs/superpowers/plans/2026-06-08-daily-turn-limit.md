# 每日对话轮次上限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现每日对话轮次上限（免费 15 / 付费 150 轮），用完硬拦并引导订阅，防年订阅被中重度用户击穿利润。

**Architecture:** ai-omni-service 用 Redis `INCR` 维护 `daily_turns:{uid}:{date}`（48h TTL）。一轮 AI 语音回复完成（`response.audio.done` → `upload_ai_task`）时记账 +1；下一轮用户输入（`user_audio_ended`/`text_message`/`input_text`）触发生成**前**查计数，超限则推 `daily_limit_reached` WS 事件并跳过生成（省被拦那轮 audio 主成本）。前端收事件后免费弹订阅 modal、付费弹「明日再来」。计数 fail-open（Redis 故障放行）。

**Tech Stack:** Python FastAPI（ai-omni-service）+ redis.asyncio + pytest；React（client）+ Jest。

参考设计：`docs/superpowers/specs/2026-06-08-daily-turn-limit-design.md`

---

## File Structure

- `services/ai-omni-service/app/main.py` — 计数 helper（`_daily_turn_key`/`_incr_daily_turns`/`_get_daily_turns`/`_daily_turn_limit`）+ 常量 + 拦截 + 记账
- `services/ai-omni-service/tests/test_daily_turn_limit.py` — 新建，helper + 拦截单测（扩展 FakeRedis incr/expire）
- `services/ai-omni-service/tests/_omni_stubs.py` 或 test 内联 — FakeRedis 加 `incr`/`expire`
- `client/src/pages/Conversation.js` — WS handler 加 `daily_limit_reached` 分支 + modal state
- `client/src/__tests__/daily-limit-logic.test.js` — 新建，纯逻辑测试

---

## Task 1: 计数常量 + helper 函数（ai-omni）

**Files:**
- Modify: `services/ai-omni-service/app/main.py`（`_today_utc_str` 定义在 663 行后，常量与 helper 加在其后）
- Test: `services/ai-omni-service/tests/test_daily_turn_limit.py`（新建）

- [ ] **Step 1: 扩展 FakeRedis 支持 incr/expire（测试底座）**

新建 `services/ai-omni-service/tests/test_daily_turn_limit.py`，顶部复制 `test_daily_qa.py` 的 redis stub 安装逻辑，并在 `_FakeRedis` 类中**补两个方法**：

```python
import sys, types
from unittest.mock import patch
import pytest

# --- stub redis / redis.asyncio （与 test_daily_qa.py 一致 + incr/expire） ---
class _FakeRedis:
    def __init__(self):
        self._store = {}
        self._ttl = {}
    async def get(self, key):
        return self._store.get(key)
    async def setex(self, key, ttl, value):
        self._store[key] = value
        self._ttl[key] = ttl
        return True
    async def incr(self, key):
        self._store[key] = str(int(self._store.get(key, 0)) + 1)
        return int(self._store[key])
    async def expire(self, key, ttl):
        self._ttl[key] = ttl
        return True
    async def ttl(self, key):
        return self._ttl.get(key, -1)

def _install_stub(name, mod):
    sys.modules[name] = mod

_redis_mod = types.ModuleType("redis")
_redis_async = types.ModuleType("redis.asyncio")
_redis_async.Redis = _FakeRedis
_redis_async.from_url = lambda *a, **kw: _FakeRedis()
_redis_mod.asyncio = _redis_async
_install_stub("redis", _redis_mod)
_install_stub("redis.asyncio", _redis_async)

# 复制 test_daily_qa.py 中其余 dashscope/httpx 等 stub 安装块（保持一致），再 import：
# from app import main as omni
```

> 注：完整 stub 头与 `test_daily_qa.py` 第 19-145 行一致（dashscope、httpx 等）。照搬该文件顶部到 `from app import main`，仅把 `_FakeRedis` 换成上面带 incr/expire 的版本。

- [ ] **Step 2: 写 helper 失败测试**

```python
@pytest.mark.asyncio
async def test_incr_and_get_daily_turns():
    fake = _FakeRedis()
    with patch.object(omni, "redis", fake):
        assert await omni._get_daily_turns("u1") == 0
        await omni._incr_daily_turns("u1")
        await omni._incr_daily_turns("u1")
        assert await omni._get_daily_turns("u1") == 2
        key = omni._daily_turn_key("u1")
        assert await fake.ttl(key) == 48 * 3600

def test_daily_turn_limit_by_tier():
    assert omni._daily_turn_limit({"subscription_status": "active"}) == omni.PRO_DAILY_TURNS
    assert omni._daily_turn_limit({"subscription_status": "free"}) == omni.FREE_DAILY_TURNS
    assert omni._daily_turn_limit({}) == omni.FREE_DAILY_TURNS
    assert omni._daily_turn_limit(None) == omni.FREE_DAILY_TURNS

@pytest.mark.asyncio
async def test_get_daily_turns_fail_open_on_redis_error():
    class _Boom:
        async def get(self, *a, **k): raise RuntimeError("redis down")
    with patch.object(omni, "redis", _Boom()):
        assert await omni._get_daily_turns("u1") == 0  # fail-open
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd services/ai-omni-service && python -m pytest tests/test_daily_turn_limit.py -q`
Expected: FAIL（`AttributeError: module 'app.main' has no attribute '_get_daily_turns'`）

- [ ] **Step 4: 实现常量 + helper**

在 `main.py` 的 `_today_utc_str()`（663-666 行）之后插入：

```python
# ── 每日对话轮次上限（成本护栏） ──
FREE_DAILY_TURNS = int(os.getenv("FREE_DAILY_TURNS", "15"))
PRO_DAILY_TURNS = int(os.getenv("PRO_DAILY_TURNS", "150"))
_DAILY_TURN_TTL_SECONDS = 48 * 3600  # 容忍跨日，与 daily_qa 一致

def _daily_turn_key(user_id: str) -> str:
    return f"daily_turns:{user_id}:{_today_utc_str()}"

async def _get_daily_turns(user_id: str) -> int:
    """当日已用轮次。Redis 故障 → fail-open 返回 0（成本护栏非安全边界）。"""
    try:
        raw = await redis.get(_daily_turn_key(user_id))
        return int(raw or 0)
    except Exception as e:
        logger.warning(f"[DailyLimit] _get_daily_turns fail-open: {e}")
        return 0

async def _incr_daily_turns(user_id: str) -> int:
    """一轮 AI 语音完成后 +1，并续 48h TTL。故障静默（不阻断主流程）。"""
    try:
        key = _daily_turn_key(user_id)
        n = await redis.incr(key)
        await redis.expire(key, _DAILY_TURN_TTL_SECONDS)
        return n
    except Exception as e:
        logger.warning(f"[DailyLimit] _incr_daily_turns failed: {e}")
        return 0

def _daily_turn_limit(user_ctx: dict) -> int:
    status = (user_ctx or {}).get("subscription_status")
    return PRO_DAILY_TURNS if status == "active" else FREE_DAILY_TURNS
```

> `redis` 是 main.py 已有的模块级实例（参见 daily_qa 的 `await redis.get/setex` 用法），无需新建。

- [ ] **Step 5: 运行测试确认通过**

Run: `cd services/ai-omni-service && python -m pytest tests/test_daily_turn_limit.py -q`
Expected: PASS（4 tests）

- [ ] **Step 6: 提交**

```bash
git add services/ai-omni-service/app/main.py services/ai-omni-service/tests/test_daily_turn_limit.py
git commit -m "feat(ai-omni): 每日轮次计数 helper（Redis INCR + fail-open + 分档上限）"
```

---

## Task 2: 记账 — response.audio.done 后 INCR（ai-omni）

**Files:**
- Modify: `services/ai-omni-service/app/main.py`（`upload_ai_task` 内，定义在 1885 行）
- Test: `services/ai-omni-service/tests/test_daily_turn_limit.py`

- [ ] **Step 1: 写记账测试**

追加到 `test_daily_turn_limit.py`：

```python
@pytest.mark.asyncio
async def test_incr_called_once_per_turn():
    """每调用一次记账 helper，当日计数 +1。"""
    fake = _FakeRedis()
    with patch.object(omni, "redis", fake):
        await omni._incr_daily_turns("u9")
        await omni._incr_daily_turns("u9")
        await omni._incr_daily_turns("u9")
        assert await omni._get_daily_turns("u9") == 3
```

- [ ] **Step 2: 运行确认通过（helper 已存在，验证累加语义）**

Run: `cd services/ai-omni-service && python -m pytest tests/test_daily_turn_limit.py::test_incr_called_once_per_turn -q`
Expected: PASS

- [ ] **Step 3: 在 upload_ai_task 末尾插入记账**

`upload_ai_task(d, r)`（1885 行起）是已有 async 后台任务。在其**函数体末尾**（return 前、所有上传/保存完成后）加：

```python
                            # ── 每日轮次记账：一轮 AI 语音真正完成后 +1 ──
                            try:
                                await _incr_daily_turns(self.user_id)
                            except Exception as _e:
                                logger.warning(f"[DailyLimit] incr on audio.done failed: {_e}")
```

> 定位：找到 `async def upload_ai_task(d, r):` 块的最后一条语句（COS 上传 + save_single_message 之后），在同缩进层级追加。该任务由 `asyncio.create_task(upload_ai_task(...))` 调度，不阻塞音频。

- [ ] **Step 4: 语法校验**

Run: `cd services/ai-omni-service && python3 -m py_compile app/main.py`
Expected: 无输出（通过）

- [ ] **Step 5: 提交**

```bash
git add services/ai-omni-service/app/main.py services/ai-omni-service/tests/test_daily_turn_limit.py
git commit -m "feat(ai-omni): response.audio.done 后记账每日轮次"
```

---

## Task 3: 拦截 — 生成前查上限，超限推事件（ai-omni）

**Files:**
- Modify: `services/ai-omni-service/app/main.py`（WS endpoint 输入分支，`user_audio_ended` ~2886 / `text_message`/`input_text` ~2907）
- Test: `services/ai-omni-service/tests/test_daily_turn_limit.py`

- [ ] **Step 1: 写拦截判定纯函数测试**

为可测，先抽一个纯判定函数。追加测试：

```python
@pytest.mark.asyncio
async def test_check_daily_limit_blocks_at_limit():
    fake = _FakeRedis()
    with patch.object(omni, "redis", fake):
        # free 上限默认 15 → 灌到 15
        for _ in range(omni.FREE_DAILY_TURNS):
            await omni._incr_daily_turns("uF")
        blocked, info = await omni._check_daily_limit("uF", {"subscription_status": "free"})
        assert blocked is True
        assert info == {"tier": "free", "used": omni.FREE_DAILY_TURNS, "limit": omni.FREE_DAILY_TURNS}

@pytest.mark.asyncio
async def test_check_daily_limit_allows_below():
    fake = _FakeRedis()
    with patch.object(omni, "redis", fake):
        await omni._incr_daily_turns("uP")
        blocked, info = await omni._check_daily_limit("uP", {"subscription_status": "active"})
        assert blocked is False
        assert info["tier"] == "pro"
        assert info["used"] == 1
        assert info["limit"] == omni.PRO_DAILY_TURNS
```

- [ ] **Step 2: 运行确认失败**

Run: `cd services/ai-omni-service && python -m pytest tests/test_daily_turn_limit.py::test_check_daily_limit_blocks_at_limit -q`
Expected: FAIL（`_check_daily_limit` 未定义）

- [ ] **Step 3: 实现 _check_daily_limit（紧接 Task1 的 helper 之后）**

```python
async def _check_daily_limit(user_id: str, user_ctx: dict):
    """返回 (blocked: bool, info: dict)。info 含 tier/used/limit，供 WS 事件用。"""
    limit = _daily_turn_limit(user_ctx)
    used = await _get_daily_turns(user_id)
    tier = "pro" if (user_ctx or {}).get("subscription_status") == "active" else "free"
    return (used >= limit, {"tier": tier, "used": used, "limit": limit})
```

- [ ] **Step 4: 运行确认通过**

Run: `cd services/ai-omni-service && python -m pytest tests/test_daily_turn_limit.py -q`
Expected: PASS（全部）

- [ ] **Step 5: 在 WS 输入分支接入拦截**

在 `user_audio_ended` 分支（~2886，`if callback.user_audio_buffer:` 之前）和 `text_message`/`input_text` 分支（~2907，发送文本到 DashScope 之前）各加守卫。用 callback 上已有的 `user_id`/`user_context`：

```python
                elif msg_type == 'user_audio_ended':
                    _blocked, _info = await _check_daily_limit(callback.user_id, callback.user_context)
                    if _blocked:
                        callback.user_audio_buffer = bytearray()  # 丢弃本轮音频
                        await websocket.send_json({"type": "daily_limit_reached", **_info})
                        logger.info(f"[DailyLimit] blocked user={callback.user_id} {_info}")
                        continue
                    if callback.user_audio_buffer:
                        ...（原逻辑）
```

文本分支同理，在向 DashScope 发送 `conversation.item.create` / `response.create` **之前**：

```python
                elif msg_type in ['text_message', 'input_text']:
                    _blocked, _info = await _check_daily_limit(callback.user_id, callback.user_context)
                    if _blocked:
                        await websocket.send_json({"type": "daily_limit_reached", **_info})
                        logger.info(f"[DailyLimit] blocked(text) user={callback.user_id} {_info}")
                        continue
                    ...（原逻辑：取 text、send_raw conversation.item.create、response.create）
```

> 关键：拦截在 `commit()` / `response.create` 之前 → 超限那轮不触发 DashScope 生成，省 audio output 主成本。

- [ ] **Step 6: 语法校验 + 全量 ai-omni 测试**

Run:
```bash
cd services/ai-omni-service && python3 -m py_compile app/main.py
python -m pytest tests/ -q
```
Expected: py_compile 无输出；pytest 全绿（含 test_daily_turn_limit 7 例 + 既有测试无回归）

- [ ] **Step 7: 提交**

```bash
git add services/ai-omni-service/app/main.py services/ai-omni-service/tests/test_daily_turn_limit.py
git commit -m "feat(ai-omni): 生成前拦截每日轮次上限，超限推 daily_limit_reached"
```

---

## Task 4: 前端 — daily_limit_reached 处理（client）

**Files:**
- Modify: `client/src/pages/Conversation.js`（WS `onmessage` 的 message type switch + 新增 modal state）
- Test: `client/src/__tests__/daily-limit-logic.test.js`（新建）

- [ ] **Step 1: 写纯逻辑测试**

把"收到事件→决定弹哪种 modal"抽为纯函数 `resolveDailyLimitModal(info)`，先写测试：

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

- [ ] **Step 5: 接入 Conversation.js WS handler**

在 Conversation.js WS `onmessage` 的 message-type 分支（与 `proficiency_update`/`task_completed` 同处）新增：

```javascript
      } else if (data.type === 'daily_limit_reached') {
        const modal = resolveDailyLimitModal(data);
        setDailyLimitModal(modal);          // 新增 useState(null)
        stopRecording?.();                   // 停止录音，禁止继续发
      }
```

文件顶部 import：`import { resolveDailyLimitModal } from './dailyLimitLogic';`
组件内加 state：`const [dailyLimitModal, setDailyLimitModal] = useState(null);`

渲染（复用 DailyQAPaywallModal 样式；pro 用轻量提示）：

```jsx
      {dailyLimitModal?.kind === 'paywall' && (
        <DailyQAPaywallModal
          title="今日免费对话已用完"
          body={`免费版每日 ${dailyLimitModal.limit} 轮已用完，升级解锁更多练习`}
          onUpgrade={() => navigate('/subscription')}
          onClose={() => setDailyLimitModal(null)}
        />
      )}
      {dailyLimitModal?.kind === 'come_back_tomorrow' && (
        <div className="fixed inset-x-0 bottom-0 p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-brand text-center">
            <p className="font-semibold text-slate-900 dark:text-white">今日对话已达上限（{dailyLimitModal.limit} 轮）</p>
            <p className="text-xs text-slate-500 mt-1">明日继续练习</p>
            <button className="mt-3 px-4 py-1.5 text-sm text-white rounded-lg"
              style={{ background: 'linear-gradient(135deg,#637FF1,#a47af6)' }}
              onClick={() => setDailyLimitModal(null)}>知道了</button>
          </div>
        </div>
      )}
```

> `DailyQAPaywallModal` 现有 props 若与上述不符（title/body/onUpgrade/onClose），以组件实际签名为准 — 先 Read `client/src/pages/Discovery.js` 中该组件的引用与定义，按其真实 props 适配。

- [ ] **Step 6: 前端 build 校验**

Run: `cd client && npm run build`
Expected: `Compiled`（可有既有 lint warnings，无新 error）

- [ ] **Step 7: 提交**

```bash
git add client/src/pages/dailyLimitLogic.js client/src/__tests__/daily-limit-logic.test.js client/src/pages/Conversation.js
git commit -m "feat(client): 每日轮次上限 daily_limit_reached 处理（免费 paywall / 付费明日再来）"
```

---

## Task 5: 端到端验证 + 文档

**Files:**
- 验证：Docker 重启 ai-omni + 前端 build
- Modify: `CLAUDE.md`（每日上限节，因 SSOT QWEN.md=symlink 同步）；`docs/TODO.md`

- [ ] **Step 1: 临时调低上限重建 ai-omni**

`services/ai-omni-service/.env` 加 `FREE_DAILY_TURNS=2` `PRO_DAILY_TURNS=2`，热加载：

```bash
docker cp services/ai-omni-service/app/main.py oral_app_ai_omni_service:/app/app/main.py
docker compose restart ai-omni-service
docker compose logs --tail=10 ai-omni-service | grep -iE "error|started|listening"
```

- [ ] **Step 2: 浏览器走对话至超限**

前端 `cd client && npm run build`。登录测试账号 → 进对话 → 连说 3 轮：
- 第 1-2 轮正常 AI 语音回复
- 第 3 轮输入 → 收 `daily_limit_reached` → 免费弹 paywall modal
- `redis-cli GET daily_turns:{uid}:{date}` == 2，`TTL` ~172800

- [ ] **Step 3: 验证付费 + fail-open**

- 把测试账号 DB `subscription_status='active'` → 重测 → 弹「明日再来」
- `docker compose stop redis` → 对话仍可继续（fail-open），日志见 `[DailyLimit] ... fail-open` → `docker compose start redis`

- [ ] **Step 4: 还原配置 + 全量回归**

删 .env 临时上限（恢复 15/150），重启 ai-omni。

```bash
cd services/ai-omni-service && python -m pytest tests/ -q
cd ../../client && CI=true npx react-app-rewired test --watchAll=false src/__tests__/daily-limit-logic.test.js
```
Expected: 全绿

- [ ] **Step 5: 更新文档（SSOT）**

`CLAUDE.md` 加「每日对话轮次上限」节（QWEN.md 为其 symlink，自动同步）：免费 15/付费 150、Redis `daily_turns:{uid}:{date}` 48h、拦截在生成前、记账在 response.audio.done、fail-open、env `FREE_DAILY_TURNS`/`PRO_DAILY_TURNS`。
`docs/TODO.md` 标记每日上限 backlog 完成。

- [ ] **Step 6: 提交**

```bash
git add CLAUDE.md docs/TODO.md services/ai-omni-service/.env.example
git commit -m "docs: 每日轮次上限文档 + TODO 收尾"
```

---

## Self-Review 结论

- **Spec 覆盖**：计数存储(Task1 Redis helper)/拦截点(Task3 生成前)/记账(Task2 audio.done)/超限行为(Task4 免费 paywall+付费明日再来)/fail-open(Task1+验证 Task5)/全局作用域(单一 key 不分模式)/分档上限(Task1 `_daily_turn_limit`) — 全部有对应任务。
- **类型一致**：`_check_daily_limit` 返回 `(bool, {tier,used,limit})` 在 Task3 定义、Task3 Step5 消费、Task4 前端按同结构解析 — 一致。
- **复用**：`_today_utc_str`(663)/`redis` 实例/`DailyQAPaywallModal`/`response.audio.done`+`upload_ai_task`(1876/1885)/WS 输入分支(2886/2907) — 均已在探索中定位。
- **前提已验证**：`subscription_status` 经 `/api/users/profile`(`User.findById` `SELECT u.*`)进 `user_context`，`_daily_turn_limit` 可读。
