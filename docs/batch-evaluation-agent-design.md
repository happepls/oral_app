# 批量评估 Agent + 教学指令注入 — 架构设计文档

**版本**: 1.0  
**日期**: 2026-04-20  
**作者**: architect-8  

---

## 一、背景与问题

当前 `proficiency_scoring` 工作流每轮对话结束后立即调用，存在三个问题：

| 问题 | 表现 |
|------|------|
| 样本量不足 | 单轮命中 1 个关键词即判定，结果不稳定 |
| 跨轮作弊 | 重复说相同关键词可在多轮累积分数 |
| 成本高 | 每轮都进行完整评估逻辑调用 |

---

## 二、解决方案概述

**批量评估 Agent**：积累 4 轮对话后，由 qwen-turbo 一次性专业分析，输出：
1. `delta` 熟练度更新值
2. `teaching_directive`：教学策略指令（引导模式 / 纠正模式）
3. `improvement_tips`：展示给用户的改进建议

评估结果通过 `update_session()` 注入 Qwen3.5-Omni 的 session instructions，驱动下一轮 AI 自然执行教学策略。

---

## 三、完整数据流

```
Turn 1-3（积累阶段）
  response.audio.done 触发 upload_ai_task
  → _handle_turn_with_accumulator(callback, task_id, user_content, ai_response)
      ├─ turn_accumulator[task_id].append({user_content, ai_response, turn_index})
      ├─ tips = _extract_inline_tips(ai_response)   # 正则提取引号短语，零 LLM 调用
      └─ WebSocket push → proficiency_update { delta:0, tips, tip_source:"inline" }

Turn 4（批量评估 + 指令注入）
  response.audio.done 触发 upload_ai_task
  → len(turn_accumulator[task_id]) == 4 → TRIGGER BATCH EVAL
  → POST /api/workflows/proficiency-scoring/batch-evaluate
  → turn_accumulator[task_id] = []   # 立即 reset
  → [workflow-service] BatchEvaluationWorkflow.evaluate_window()
        qwen-turbo LLM 分析 4 轮 → JSON 解析 → _update_user_proficiency(DB)
  ← { delta, teaching_mode, next_topic_hint/correction_guidance, improvement_tips, scores }
  → pending_directive = _format_teaching_directive(result)
  → conversation.update_session(instructions = base_prompt + "\n\n" + pending_directive)
  → WebSocket push → proficiency_update { delta, tips, tip_source:"batch_eval" }
  → if task_completed → WebSocket push → task_completed { ... }   ← 格式完全不变

Turn 5（消费 directive）
  用户说话 → DashScope 使用已注入 directive 的 session 自动生成响应
  → Qwen3.5-Omni 执行引导 / 纠正教学策略
  response.audio.done 触发 upload_ai_task
  → pending_directive 非空 → 清除 → _update_session_prompt() 恢复基础 prompt
```

---

## 四、教学模式设计

### 模式 A：引导模式（guide）
**触发条件**：`keyword_coverage ≥ 5 AND topic_relevance ≥ 6 AND grammar_quality ≥ 5`

注入格式：
```
[TEACHING DIRECTIVE — ONE-TIME USE, DO NOT MENTION TO STUDENT]
Mode: GUIDE
In your NEXT response, naturally steer the conversation toward:
"{next_topic_hint}"
Continue the current task "{task_description}". Weave this direction into your response naturally.
```

### 模式 B：纠正模式（correct）
**触发条件**：`keyword_coverage < 3 OR topic_relevance < 4 OR grammar_quality < 4`

注入格式：
```
[TEACHING DIRECTIVE — ONE-TIME USE, DO NOT MENTION TO STUDENT]
Mode: CORRECT
In your NEXT response ONLY (3-4 sentences max):
1. Briefly acknowledge the student's attempt (1 sentence, in {target_language})
2. [NATIVE: {native_explanation}]
   → You MAY briefly use {native_language} to deliver this explanation
3. Provide model example: "{correct_example}"
4. End with: "{retry_instruction}"
IMPORTANT: After this ONE correction response, the "YOU MUST RESPOND ENTIRELY IN
{target_language}" rule resumes from the NEXT response onward.
```

> **关键设计**：`CRITICAL: Language of Instruction` 约束被临时显式覆盖，仅作用于一轮回复，之后自动恢复。

---

## 五、新增 API 端点

### `POST /api/workflows/proficiency-scoring/batch-evaluate`

**请求体**
```json
{
  "user_id": "string",
  "goal_id": 5,
  "task_id": 42,
  "current_task": {
    "id": 42,
    "task_description": "Ask about check-in times and room types",
    "keywords": ["check-in", "room", "reservation", "available"],
    "scenario_title": "Hotel Check-In",
    "target_language": "English"
  },
  "native_language": "Chinese",
  "turn_window": [
    {
      "turn_index": 1,
      "user_content": "I want to check in please",
      "ai_response": "Great! Do you have a reservation?",
      "timestamp": "2026-04-20T10:00:00Z"
    }
  ],
  "window_size": 4
}
```

**响应体**
```json
{
  "success": true,
  "data": {
    "delta": 1,
    "teaching_mode": "correct",
    "scores": {
      "keyword_coverage": 4.0,
      "grammar_quality": 7.0,
      "topic_relevance": 6.0,
      "fluency": 6.0
    },
    "next_topic_hint": null,
    "correction_guidance": {
      "error_type": "keyword_coverage",
      "native_explanation": "你在4轮对话中只用到了'check-in'，还需要尝试使用reservation、available等关键词",
      "correct_example": "Do you have any rooms available for tonight?",
      "retry_instruction": "Let's try again — this time ask about available rooms."
    },
    "improvement_tips": ["尝试在下次对话中使用 'reservation' 和 'available'"],
    "keyword_coverage_detail": {
      "matched": ["check-in"],
      "missed": ["room", "reservation", "available"],
      "coverage_ratio": 0.25
    },
    "task_score": 5,
    "task_completed": false,
    "task_id": 42,
    "total_proficiency": 14
  }
}
```

---

## 六、评估 Agent LLM Prompt 模板（qwen-turbo）

```
You are an expert language teaching evaluator. Analyze {window_size} conversation turns.

## Student Profile
- Target Language: {target_language}
- Native Language: {native_language}
- Task: {task_description}
- Required Keywords: {keywords}

## Conversation Window
{formatted_turns}
(Format: "Turn N — Student: ... | Tutor: ...")

## Scoring Criteria (0-10 each)
- keyword_coverage: unique keywords used across ALL turns / total keywords × 10
  (CRITICAL: same keyword repeated across turns = ONE hit only, prevents cheating)
- grammar_quality: aggregate grammar accuracy across {window_size} turns
- topic_relevance: consistency of staying on task
- fluency: avg response length, use of connectors, sentence completeness

## Teaching Mode Decision
- "guide"   if: keyword_coverage >= 5 AND topic_relevance >= 6 AND grammar_quality >= 5
- "correct" if: keyword_coverage < 3 OR topic_relevance < 4 OR grammar_quality < 4
- Otherwise: "guide" (default to positive reinforcement)

## Delta Rules
- unique_keyword_hits: 0→score=2, 1→score=4, 2→score=7, >=3→score=9
- hard correction in tutor responses → score × 0.5
- soft correction → score × 0.7
- delta: final_score <=5→0, 6-7→1, >=8→2

## Output (strict JSON, no markdown wrapper)
{
  "delta": <0|1|2>,
  "teaching_mode": "guide" | "correct",
  "scores": { "keyword_coverage": 0-10, "grammar_quality": 0-10, "topic_relevance": 0-10, "fluency": 0-10 },
  "next_topic_hint": "<in {target_language}, null if mode=correct>",
  "correction_guidance": {
    "error_type": "keyword_coverage | topic_mismatch | grammar | vocabulary",
    "native_explanation": "<in {native_language}>",
    "correct_example": "<in {target_language}>",
    "retry_instruction": "<in {target_language}>"
  },
  "improvement_tips": ["<1-2 tips in {native_language}>"],
  "keyword_coverage_detail": { "matched": [...], "missed": [...], "coverage_ratio": 0.0-1.0 }
}
```

---

## 七、各文件改动范围

| 文件 | 操作 | 改动内容 |
|------|------|---------|
| `workflow-service/src/workflows/batch_evaluation.py` | **新增** | `BatchEvaluationWorkflow` 类；`evaluate_window()` 调用 qwen-turbo；`_rule_based_fallback()` 降级逻辑；复用 `_update_user_proficiency` 写 DB |
| `workflow-service/src/main.py` | **修改** | 新增 `BatchEvaluateTurn` / `BatchEvaluateRequest` Pydantic 模型；注册 `POST /api/workflows/proficiency-scoring/batch-evaluate` 路由 |
| `ai-omni-service/app/main.py` | **修改** | `WebSocketCallback.__init__` 新增 `turn_accumulator`、`current_eval_task_id`、`pending_directive`；新增 `_extract_inline_tips()`、`_format_teaching_directive()`、`_handle_turn_with_accumulator()`；`upload_ai_task` 开头消费 directive；替换 `call_proficiency_workflow` 调用 |
| `ai-omni-service/app/prompt_manager.py` | **不改** | directive 在调用时动态拼接，模板不变 |
| `workflow-service/src/workflows/proficiency_scoring.py` | **不改** | 旧 `/update` 端点保留，magic passcode 路径（main.py ~line 1285）仍用旧接口 |
| `client/src/pages/Conversation.js` | **不改** | WebSocket 消息格式完全不变，前端零改动 |

---

## 八、关键实现细节

### 轮次计数器存储：WebSocketCallback 内存（非 Redis）
- 生命周期与 WebSocket session 完全绑定，session 关闭自动回收
- 已有先例：`session_phases`、`just_switched_task`、`messages[]` 均存于此
- task_id 切换时立即清空 accumulator：
  ```python
  if callback.current_eval_task_id != task_id:
      callback.turn_accumulator = {}
      callback.current_eval_task_id = task_id
  ```

### 指令注入时机：update_session 双步注入
- `update_session(instructions=...)` 立即生效，影响 DashScope 下一次自动响应
- 批量评估完成后 → 注入 directive
- Turn 5 的 `upload_ai_task` 完成后 → 清除 `pending_directive` → 恢复基础 prompt
- 不使用 `response.create { instructions }` —— 该方式仅用于手动触发的单次响应（magic pass 等场景）

### LLM Fallback
- qwen-turbo 调用超时/失败时，捕获异常降级到纯规则评分（关键词匹配 + coverage_ratio 计算）
- 保证服务不中断，不影响 WebSocket 连接

### WebSocket 消息向后兼容
- `proficiency_update` payload 新增可选字段 `tip_source: "inline" | "batch_eval"`
- 前端现有代码忽略未知字段，零改动
- `task_completed` 格式完全不变

---

## 九、部署顺序

```bash
# Step 1: 部署 workflow-service（新端点）
docker compose build workflow-service
docker compose up -d workflow-service

# Step 2: 验证新端点可用
curl http://localhost:3006/health

# Step 3: 部署 ai-omni-service（accumulator 逻辑）
docker compose build ai-omni-service
docker compose up -d ai-omni-service
```

---

## 十、验证方案

| 测试项 | 方法 |
|--------|------|
| 新端点功能 | 单元测试 `BatchEvaluationWorkflow.evaluate_window()`，mock qwen-turbo 响应 |
| 批量评估流程 | 模拟 4 轮对话 → 验证 `/batch-evaluate` 返回正确 `teaching_mode` |
| 端到端 directive 注入 | 实际对话 4 轮 → 检查第 5 轮 Qwen3.5-Omni 回复是否含 `native_explanation` |
| 旧接口回归 | 验证 magic passcode 流程不受影响，旧 `/update` 端点仍可调用 |
| 作弊防御 | 4 轮重复说同一关键词 → `keyword_coverage` 应 ≤ 2（单关键词去重） |
