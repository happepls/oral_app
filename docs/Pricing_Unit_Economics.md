# GuaJi 定价分层模型与单位经济 (Unit Economics)

> 本文是 [`Commercialization_Guide.md`](./Commercialization_Guide.md) 第二阶段「成本模型」的**量化补全**：
> 把 Guide 里的「单分钟对话成本」「Freemium 原则」落成可计算的数字模型 + 与代码现状对齐的分层 feature 矩阵。
> 对应 backlog [Commercialization] 项。
>
> ⚠️ **所有金额为待校准的占位假设**（标 `‹ASSUMPTION›`），上线前须用真实 DashScope 账单 + Stripe/IAP 实际抽成回填。

---

## 一、分层模型 (Freemium / Pro)

当前代码已实现的门控（事实来源，勿凭空设计）：

| 能力 | Free | Pro | 代码位置 |
|---|---|---|---|
| 场景解锁 | 前 **3** 个 | 全部 | `Discovery.js` `FREE_INITIAL_UNLOCK=3` / `isScenarioUnlocked` |
| 今日问答 (daily-QA) | 首次 1 题 | 可选 3 题 | `Discovery.js:217` `if(!isPro) setShowDailyQAPaywall` |
| 自定义练习方向 | ❌ | ✅ | `Discovery.js:471` `isPro → /goal-setting?mode=custom` |
| 今日复述切换 | **3 次/天** | 无限* | `Recall.js` `FREE_SWITCH_LIMIT=3`（*Pro 无限待产品确认） |
| AI 音色/角色 | 仅 Tina | Tina/Serena/Evan/Arda 全解锁 | `Goals.js:293` / `GoalSetting.js:564` `!v.isFree && !isPro` |
| 订阅状态判定 | — | `user.subscription_status === 'active'` | 全站统一 |

**现行价格**（`Subscription.js:28`，Stripe products）：
- Pro 周付 **$2.90/wk**
- Pro 年付 **$89.90/yr**（≈ $1.73/wk，年付折让 ~40%）
- Web 端可比 App 端低 ~20%（省苹果税，见 Guide 第三阶段）

### 建议补强的分层杠杆（产品决策项，待拍板）
- **Free 每日时长上限**：Guide 写「每日 5 分钟」，但代码**未见时长门控**——需新增 `daily_practice_time` 配额检查，否则 Free 用户可无限用满边际成本最高的实时对话。**这是单位经济的最大漏点。**
- **深度纠错报告 / 云端历史归档**：Guide 列为 Pro 权益，需确认代码是否已门控。

---

## 二、单位经济：单分钟对话成本模型

### 2.1 成本构成（每分钟实时对话）

```
C_minute = C_ai + C_infra + C_storage
```

| 项 | 模型 | 占位值 ‹ASSUMPTION› | 说明 |
|---|---|---|---|
| `C_ai` | DashScope Qwen3.5-Omni-Realtime 计费 | **待回填** | 按 token 或音频秒计费；实时多模态是大头。**必须用真实账单测算**——见 §2.2 |
| `C_infra` | App/AI/workflow 服务摊薄 | ~$0.0005/min | 2核4G ECS 月费 ÷ 月活分钟数 |
| `C_storage` | COS 音频存储 | ~$0.0001/min | 极低，Guide 已注「成本极低」 |

### 2.2 如何测真实 `C_ai`（上线前必做）

1. 跑一段真实 N 分钟对话（含 ASR+LLM+TTS 全链）。
2. 查 DashScope 控制台该时段账单 ÷ N = 每分钟成本。
3. 区分计费维度：
   - 输入音频秒 / 输出音频秒
   - LLM input/output tokens（含 system prompt——本项目 prompt 较长，**长 system prompt 会显著抬高每轮成本**）
   - TTS 重合成（`upload_ai_task` 的 `qwen3-tts-flash` 二次合成是**额外**成本，标记剥离场景才触发）
4. 也量 `/translate`、`/tts`、`generate-scenarios`（qwen-turbo）等附带调用。

> 项目特性提醒：每轮对话 `response.audio.done` 后还会调 workflow-service 打分（纯逻辑，无 AI 成本）；但 daily-QA 参考答案是**两步 LLM 调用**，成本×2。

### 2.3 毛利与定价校验

Guide 原则：**订阅价 ≥ AI 边际成本的 3–5 倍**。代入：

```
设 Pro 周付净收入 R_week = $2.90 × (1 − 渠道抽成)
  App(IAP 15~30%): R ≈ $2.03 ~ $2.47
  Web(Stripe 2.9%+$0.3): R ≈ $2.52（单笔，频繁小额时 $0.3 固定费占比高 → 推年付）

设 Pro 用户周均对话分钟 M_week ‹ASSUMPTION 60min›
则 周边际 AI 成本 = C_minute × M_week
要求 R_week ≥ 3 × (C_minute × M_week)
→ 盈亏临界 C_minute ≤ R_week / (3 × M_week)
```

**关键风险**：Pro「无限畅聊」+ 重度用户 → `M_week` 失控 → 边际成本击穿。**缓解**：
- 公平使用上限（soft cap，如周 N 分钟后降级/提示）
- 监控 P95/P99 用户分钟分布，而非只看均值
- 年付优先（锁定 + 降单笔固定费占比）

### 2.4 LTV / CAC 框架（增长决策）

```
LTV = ARPU_month × 毛利率 × 平均留存月数
CAC = 获客总支出 / 新增付费用户
健康线：LTV / CAC ≥ 3，回收期 < 12 月
```

- ARPU：年付 $89.90/12 ≈ $7.49/月；周付留存差但 ARPU 名义高。
- 留存月数：用打卡/streak 数据估（项目有 `user_checkins` / `daily_practice_time`）。
- CAC：Guide 第四阶段走内容营销 (TikTok/小红书) + 裂变，CAC 应远低于投流。

---

## 三、行动清单

- [ ] **回填 `C_ai`**：跑真实对话 + DashScope 账单测每分钟成本（§2.2）
- [ ] **补 Free 时长门控**：实现「每日 5 分钟」配额（当前代码缺失，最大漏点）
- [ ] **确认 Pro 公平使用上限**：定 soft cap 数值，防重度用户击穿边际成本
- [ ] **量附带 AI 调用成本**：translate/tts/scenario 生成/daily-QA 双调用
- [ ] **建分钟分布监控**：P95/P99 而非均值
- [ ] **校验 3–5× 原则**：用真实 `C_minute` 反推安全定价区间，决定是否调价
- [ ] 价格数字与 `Subscription.js` / Stripe products 保持单一事实来源（改价同步两处）

---

_最后更新：2026-06-03 · 关联 [[Commercialization_Guide.md]] · 数字均为待校准假设_
