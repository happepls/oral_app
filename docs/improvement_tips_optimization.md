# 改进建议优化 - 2026 年 3 月 4 日

## 用户反馈问题

### 问题 1：改进建议过于宽泛
**当前建议**：
```
💡 建议：试着用更长的句子表达完整的意思；尝试更多使用任务相关的关键词
```

**问题**：用户不知道具体该用什么词，如何改进。

### 问题 2：进度更新逻辑
**当前逻辑**：AI 给出建议后立即更新熟练度，但用户可能还没修正。

**期望**：接收用户修正后的输入再决定是否更新熟练度。

## 解决方案

### 方案 1：提供具体关键词建议

**修改文件**：`services/workflow-service/src/workflows/proficiency_scoring.py`

**新增函数**：`_get_scene_keywords()`
```python
def _get_scene_keywords(self, scenario_title: str, task_desc: str) -> List[str]:
    """根据场景和任务返回具体关键词列表"""
    
    scene_keywords_map = {
        "grocery": ["vegetable", "fruit", "price", "checkout", "cart", "item", "location", "aisle"],
        "coffee": ["coffee", "drink", "order", "menu", "espresso", "latte", "cappuccino", "size"],
        "restaurant": ["restaurant", "table", "reservation", "menu", "order", "waiter", "bill", "dish"],
        "direction": ["direction", "street", "road", "turn", "left", "right", "straight", "map"],
        "phone": ["phone", "call", "message", "answer", "speaking", "hold", "transfer"],
        "greeting": ["hello", "morning", "meet", "friend", "name", "nice"],
        "weather": ["weather", "sunny", "rainy", "cloudy", "temperature", "hot", "cold"]
    }
```

**修改函数**：`_generate_improvement_tips()`
```python
# 修改前
if vocabulary < 5:
    tips.append("多使用场景相关的词汇，丰富表达")

# 修改后
if vocabulary < 5:
    keywords = self._get_scene_keywords(scenario_title, task_desc)
    if keywords:
        tips.append(f"多使用场景相关词汇：{', '.join(keywords[:5])}")
    else:
        tips.append("多使用场景相关的词汇，丰富表达")
```

### 方案 2：进度更新逻辑说明

**当前架构限制**：
- workflow 在每次 AI 回复后自动调用
- 立即更新熟练度和交互次数
- 无法判断用户是否"采纳了建议"

**实际效果分析**：
1. **完成阈值已提高**：9 分（需要 5-9 轮对话）
2. **每次增量已降低**：+1~2 分（原 +1~3 分）
3. **最小交互要求**：3 轮（防止过快完成）

**结论**：当前设计下，用户有足够机会（5-9 轮）改进，即使前几轮说简单句，后续也可以提高质量。

**建议**：保持当前架构，通过**具体关键词**帮助用户改进，而非改变更新逻辑。

## 修改后效果对比

### Grocery Shopping 场景

**修改前** ❌：
```
💡 建议：多使用场景相关的词汇，丰富表达
```

**修改后** ✅：
```
💡 建议：多使用场景相关词汇：vegetable, fruit, price, checkout, cart
```

### Coffee Shop 场景

**修改前** ❌：
```
💡 建议：尝试更多使用任务相关的关键词
```

**修改后** ✅：
```
💡 建议：尝试更多使用任务相关的关键词：coffee, order, menu
```

### Direction 场景

**修改前** ❌：
```
💡 建议：专注于当前任务，使用关键词
```

**修改后** ✅：
```
💡 建议：专注于当前任务，使用关键词：direction, street, road, turn, left
```

## 完整建议示例

### 用户表现：词汇量不足（vocabulary=4）

**修改前**：
```
💡 建议：多使用场景相关的词汇，丰富表达
```

**修改后**：
```
💡 建议：多使用场景相关词汇：vegetable, fruit, price, checkout, cart, item, location, aisle
```

### 用户表现：流利度不足（fluency=4）

**修改前**：
```
💡 建议：尝试使用更多连接词（如 and, but, because）来使表达更流畅
```

**修改后**：
```
💡 建议：尝试使用更多连接词（如 and, but, because, so, however）来使表达更流畅
```

### 用户表现：语法不足（grammar=4）

**修改前**：
```
💡 建议：注意时态一致性，主谓要一致
```

**修改后**：
```
💡 建议：注意时态一致性，主谓要一致（如：I have, He has）
```

### 用户表现：话题偏离（task_relevance=2）

**修改前**：
```
💡 建议：请专注于当前任务场景练习
```

**修改后**：
```
💡 建议：专注于当前任务，使用关键词：vegetable, fruit, price, checkout, cart
```

## 场景关键词映射表

| 场景 | 关键词（前 5 个） |
|------|----------------|
| Grocery Shopping | vegetable, fruit, price, checkout, cart |
| Coffee Shop | coffee, drink, order, menu, espresso |
| Restaurant | restaurant, table, reservation, menu, order |
| Directions | direction, street, road, turn, left |
| Phone Call | phone, call, message, answer, speaking |
| Greeting | hello, morning, meet, friend, name |
| Weather | weather, sunny, rainy, cloudy, temperature |
| Business | meeting, project, team, client, deadline |
| Travel | travel, flight, hotel, ticket, airport |
| Shopping | buy, price, cost, discount, size |

## 部署状态

✅ workflow-service 已重建并部署  
✅ ai-omni-service 已重建并部署  
✅ 服务健康检查通过  

## 测试验证

### 1. Grocery Shopping 场景测试
```bash
# 访问练习页面
http://localhost:3000/conversation?scenario=Grocery%20Shopping

# 预期看到的建议
💡 建议：多使用场景相关词汇：vegetable, fruit, price, checkout, cart
```

### 2. Coffee Shop 场景测试
```bash
# 访问练习页面
http://localhost:3000/conversation?scenario=Coffee%20Shop%20Order

# 预期看到的建议
💡 建议：尝试更多使用任务相关的关键词：coffee, order, menu
```

### 3. 日志验证
```bash
# 查看 workflow 日志
docker compose logs workflow-service | grep "improvement_tips"

# 预期看到具体关键词
"improvement_tips": ["多使用场景相关词汇：vegetable, fruit, price..."]
```

## 用户引导

### 如何使用改进建议

1. **看到建议后**：
   ```
   💡 建议：多使用场景相关词汇：vegetable, fruit, price, checkout, cart
   ```

2. **尝试使用这些词造句**：
   - "Where can I find the **vegetables**?"
   - "How much is this **fruit**?"
   - "What's the **price** of this item?"
   - "Where is the **checkout**?"
   - "Do I need a shopping **cart**?"

3. **AI 会检测到关键词使用**：
   - 使用场景词汇 → vocabulary 分数提高
   - 流利度提高 → 熟练度增长更快
   - 达到 9 分 + 3 轮 → 自动切换任务

## 后续优化建议

### 短期优化（已实现）
- ✅ 提供具体场景关键词
- ✅ 建议永久显示（不自动消失）
- ✅ AI prompt 及时更新

### 中期优化（建议）
1. **个性化建议**：根据用户历史表现调整建议
2. **例句模板**：提供常用句型模板
3. **发音指导**：针对发音问题提供具体指导

### 长期优化（规划）
1. **AI 视觉反馈**：实时显示关键词使用情况
2. **成就系统**：使用建议词汇获得奖励
3. **社交学习**：查看其他用户如何使用关键词

---

# 修复总结 - 2026 年 3 月 4 日

## 问题汇总

### 问题 1：进度条显示 100% 但任务未切换
**现象**：前端显示进度 100%，但 `score=5`，任务状态 `pending`

**根本原因**：
- user-service 用 `score/3` 计算进度
- 5 分时显示 `(5/3)*100 = 166% → 100%`
- 但任务切换条件是 `score >= 9`

**修复**：
```javascript
// services/user-service/src/models/user.js
// 修改前
const taskProgress = Math.min(100, Math.round((taskScore / 3) * 100));

// 修改后
const taskProgress = Math.min(100, Math.round((taskScore / 9) * 100));
```

### 问题 2：改进建议消失太快
**现象**：建议 5 秒后自动消失，用户无法参考

**修复**：移除自动消失逻辑，建议永久显示
```javascript
// client/src/pages/Conversation.js
// 注释掉 setTimeout 自动消失逻辑
// 让建议永久显示，用户可随时参考
```

### 问题 3：AI prompt 未及时更新
**现象**：任务完成后 AI 仍停留在旧任务

**修复**：`_update_session_prompt()` 明确查找并高亮当前任务
```python
# services/ai-omni-service/app/main.py
current_task = next((t for t in tasks if isinstance(t, dict) and t.get('status') != 'completed'), None)

if current_task:
    task_text = current_task.get('text', 'Practice conversation')
    full_ctx['task_description'] = task_text
    logger.info(f"Selected Scenario: {self.scenario}, Current Task: {task_text}")
```

### 问题 4：改进建议过于宽泛
**现象**：建议太笼统，用户不知道具体怎么做

**修复**：根据场景提供具体关键词
```python
# services/workflow-service/src/workflows/proficiency_scoring.py
def _get_scene_keywords(self, scenario_title: str, task_desc: str) -> List[str]:
    scene_keywords_map = {
        "grocery": ["vegetable", "fruit", "price", "checkout", "cart"],
        "coffee": ["coffee", "drink", "order", "menu", "espresso"],
        # ...更多场景
    }
```

### 问题 5：进度更新逻辑
**用户反馈**：AI 给出建议后应立即等待用户修正，而不是盲目更新进度

**分析**：
- 当前架构：每次 AI 回复后自动调用 workflow
- 完成阈值：9 分（需要 5-9 轮对话）
- 每次增量：+1~2 分
- 最小交互：3 轮

**结论**：用户有足够机会（5-9 轮）改进，无需改变架构

**建议**：通过**具体关键词**帮助用户改进

## 修改文件汇总

| 文件 | 修改内容 |
|------|---------|
| `services/user-service/src/models/user.js` | 进度计算分母 3→9 |
| `client/src/pages/Conversation.js` | 1. 移除建议自动消失<br>2. 分离建议和进度逻辑 |
| `services/ai-omni-service/app/main.py` | `_update_session_prompt()` 明确高亮当前任务 |
| `services/workflow-service/src/workflows/proficiency_scoring.py` | 1. 新增 `_get_scene_keywords()`<br>2. `_generate_improvement_tips()` 提供具体关键词 |

## 修复前后对比

### 进度条显示

| score | 修复前 | 修复后 |
|-------|--------|--------|
| 1     | 33%    | **11%** ✓ |
| 3     | 100% ❌ | **33%** ✓ |
| 5     | 100% ❌ | **56%** ✓ |
| 7     | 100% ❌ | **78%** ✓ |
| 9     | 100% ✓ | **100%** ✓ |

### 改进建议

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| **Grocery** | 多使用场景相关的词汇 | 多使用场景相关词汇：**vegetable, fruit, price, checkout, cart** |
| **Coffee** | 尝试更多使用任务相关的关键词 | 尝试更多使用任务相关的关键词：**coffee, order, menu** |
| **Direction** | 专注于当前任务 | 专注于当前任务，使用关键词：**direction, street, road, turn** |

### AI 任务切换

| 修复前 | 修复后 |
|--------|--------|
| 任务完成后 AI 仍说"Let's stay focused on grocery shopping" | 任务完成后 AI 主动引导"Now let's practice 'Request quantity and price'" |

## 完整测试流程

### 1. 访问练习页面
```
http://localhost:3000/conversation?scenario=Grocery%20Shopping
```

### 2. 观察进度条
- 1 分 → ~11%
- 3 分 → ~33%
- 5 分 → ~56% ✓（之前显示 100%）
- 7 分 → ~78%
- 9 分 → 100% ✓ 触发任务切换

### 3. 观察改进建议
即使话题偏离（delta=0），也应该看到：
```
💡 建议：专注于当前任务，使用关键词：vegetable, fruit, price, checkout, cart
```
并且**永久显示**，不自动消失。

### 4. 观察任务切换
当 `score >= 9` 且 `interaction_count >= 3` 时：
1. 进度条显示 100%
2. 收到 `task_completed` 通知
3. AI 自动切换到下一个任务
4. 进度条归零，重新开始

### 5. 日志验证
```bash
# 查看 workflow 日志
docker compose logs workflow-service | grep "improvement_tips"

# 预期看到具体关键词
"improvement_tips": ["多使用场景相关词汇：vegetable, fruit, price..."]

# 查看 AI 日志
docker compose logs ai-omni-service | grep "Current Task"

# 预期看到
Selected Scenario: Grocery Shopping, Current Task: Request quantity and price
```

## 数据库验证

```sql
-- 查看任务状态
SELECT id, scenario_title, task_description, score, interaction_count, status 
FROM user_tasks 
WHERE scenario_title = 'Grocery Shopping' 
ORDER BY id;

-- 预期结果
-- id=67: Ask for item locations - score=5, progress=56%
-- id=68: Request quantity and price - score=0, progress=0%
-- id=69: Handle checkout conversation - score=0, progress=0%
```

## 用户引导

### 如何使用改进建议

1. **看到建议后**：
   ```
   💡 建议：多使用场景相关词汇：vegetable, fruit, price, checkout, cart
   ```

2. **尝试使用这些词造句**：
   - "Where can I find the **vegetables**?"
   - "How much is this **fruit**?"
   - "What's the **price** of this item?"
   - "Where is the **checkout**?"
   - "Do I need a shopping **cart**?"

3. **AI 会检测到关键词使用**：
   - 使用场景词汇 → vocabulary 分数提高
   - 流利度提高 → 熟练度增长更快
   - 达到 9 分 + 3 轮 → 自动切换任务

## 部署状态

✅ user-service 已重建并部署  
✅ client-app 已重建并部署  
✅ workflow-service 已重建并部署  
✅ ai-omni-service 已重建并部署  
✅ 所有服务健康检查通过  

## 场景完成弹窗优化（2026 年 3 月 5 日）

### 问题描述
1. 场景完成弹窗没有关闭按钮，用户无法关闭
2. 刷新页面后会重复弹出同一个完成弹窗
3. 用户无法查看对话历史记录

### 解决方案

#### 1. 添加关闭按钮
在弹窗右上角添加关闭按钮（X 图标），用户可随时关闭弹窗。

**修改位置**：`client/src/pages/Conversation.js`
```javascript
// 在弹窗容器添加 relative 定位
<div className="... relative">
  {/* Close button */}
  <button
    onClick={() => {
      setShowCompletionModal(false);
      hasViewedCompletionModalRef.current = true; // Mark as viewed
    }}
    className="absolute top-3 right-3 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full ..."
  >
    <span className="material-symbols-outlined text-white text-lg">close</span>
  </button>
  ...
</div>
```

#### 2. 防止重复弹窗
添加 `hasViewedCompletionModalRef` 标记，用户关闭后不再自动弹出。

```javascript
const hasViewedCompletionModalRef = useRef(false); // Track if user has already viewed and closed the modal

// 触发条件增加检查
if (objectTaskCount > 0 && completedCount === objectTaskCount && 
    !completionCheckedRef.current && !hasViewedCompletionModalRef.current) {
    completionCheckedRef.current = true;
    setTimeout(() => setShowCompletionModal(true), 1000);
}
```

#### 3. 重置场景时清除标记
用户选择"重新练习"时，清除所有标记，允许再次显示弹窗。

```javascript
const handleRetryCurrentScenario = async () => {
    ...
    hasViewedCompletionModalRef.current = false; // Reset modal view tracking
    ...
}
```

#### 4. 底部关闭按钮
在弹窗底部添加"关闭"按钮，与右上角 X 按钮功能相同。

```javascript
<button
  onClick={() => {
    setShowCompletionModal(false);
    hasViewedCompletionModalRef.current = true;
  }}
  className="w-full py-2 text-slate-500 text-sm hover:text-slate-700 transition"
>
  关闭
</button>
```

### 修改文件
- `client/src/pages/Conversation.js`
  - 添加 `hasViewedCompletionModalRef`
  - 弹窗容器添加 `relative` 定位
  - 添加右上角关闭按钮
  - 底部按钮改为"关闭"（原"返回主页"）
  - 更新触发条件检查
  - `handleRetryCurrentScenario` 清除标记

### 用户体验改进
1. ✅ 用户可随时关闭场景完成弹窗
2. ✅ 关闭后可查看完整的对话历史记录
3. ✅ 刷新页面不会重复弹出（除非选择"重新练习"）
4. ✅ 保留所有操作按钮（下一个场景/重新练习/选择其他场景）

## 相关文档

- 进度条修复：`docs/progress_bar_task_switch_fix.md`
- AI 任务切换修复：`docs/ai_task_transition_fix.md`
- 改进建议优化：`docs/improvement_tips_optimization.md`
- 任务完成机制：`docs/task_completion_optimization.md`

---

## 引导式教学优化（2026 年 3 月 5 日）

### 问题描述
之前的改进建议只有词汇列举，缺少：
1. 完整的句型示例
2. 引导式教学提示
3. 具体场景的表达建议

### 解决方案

#### 1. 新增 `_generate_example_sentence()` 函数
根据场景和关键词自动生成示例句子。

**句型模板示例**：
```python
sentence_templates = {
    "grocery": [
        "Where can I find the {0}?",
        "How much is the {0}?",
        "I'm looking for {0} and {1}.",
        "Do you have fresh {0}?"
    ],
    "coffee": [
        "Can I get a {0}, please?",
        "I'd like a {0} with {1}.",
        "What size {0} do you have?",
        "Could I have a {0} to go?"
    ],
    # ...更多场景
}
```

#### 2. 新增 `_get_task_specific_suggestion()` 函数
根据具体任务类型提供针对性建议。

**任务建议映射**：
```python
task_suggestions = {
    "ask for": "🎯 试试用疑问句：'Could you tell me where...?' 或 'Do you know where...?'",
    "request": "🎯 用礼貌的请求句型：'Could I have...?' 或 'I'd like to request...'",
    "order": "🎯 点餐句型：'I'd like to order...' 或 'Can I get...?'",
    "handle checkout": "🎯 结账句型：'Can I pay by card?' 或 'Could I have the receipt, please?'",
    # ...更多任务类型
}
```

#### 3. 重写 `_generate_improvement_tips()` 函数
每个维度都提供具体句型示例和引导式教学。

**修改前后对比**：

| 维度 | 修改前 ❌ | 修改后 ✅ |
|------|---------|---------|
| **流利度<5** | 尝试使用更多连接词 | 💬 你可以尝试这样表达：'I think...' 或 'In my opinion...' 来开始你的回答 |
| **流利度<8** | 试着用更长的句子 | 💬 试着用连接词把句子连起来：'I want coffee because it helps me wake up' |
| **词汇<5** | 多使用场景相关词汇：vegetable, fruit, price | 📚 试试用这些词：vegetable, fruit, price<br>例如：Do you have fresh vegetable? |
| **词汇<8** | 可以尝试使用一些高级词汇 | 📚 试试更高级的表达：用 'I'd prefer' 代替 'I want'，用 'Could you' 代替 'Can you' |
| **语法<5** | 注意时态一致性 | ✏️ 注意主谓一致：'I have' ✓ 而不是 'I has' ✗<br>试试这样说：'I need...' 或 'I would like...' |
| **语法<8** | 注意句子结构的完整性 | ✏️ 注意句子完整性：确保每个句子都有主语和动词<br>例如：'Can I have a coffee?' 是完整的句子 |
| **任务相关<5** | 专注于当前任务，使用关键词 | 🎯 专注于当前任务，试试这样说：<br>例如：Do you have fresh vegetable? |
| **任务相关<8** | 尝试更多使用任务相关的关键词 | 🎯 根据具体任务提供针对性句型建议 |

### 完整示例

#### Grocery Shopping 场景 - Ask for item locations 任务

**用户表现**：fluency=4, vocabulary=4, grammar=4, task_relevance=4

**修改前** ❌：
```
💡 建议：
• 尝试使用更多连接词（如 and, but, because）来使表达更流畅
• 多使用场景相关词汇：vegetable, fruit, price, checkout, cart
• 注意时态一致性，主谓要一致
• 专注于当前任务，使用关键词：vegetable, fruit, price, checkout, cart
```

**修改后** ✅：
```
💡 建议：
💬 你可以尝试这样表达：'I think...' 或 'In my opinion...' 来开始你的回答，而不是只说单词
📚 试试用这些词：vegetable, fruit, price
   例如：Do you have fresh vegetable?
✏️ 注意主谓一致：'I have' ✓ 而不是 'I has' ✗
   试试这样说：'I need...' 或 'I would like...'
🎯 专注于当前任务，试试这样说：
   例如：Do you have fresh vegetable?
```

#### Coffee Shop 场景 - Order drink 任务

**用户表现**：fluency=6, vocabulary=7, grammar=6, task_relevance=7

**修改后** ✅：
```
💡 建议：
💬 试着用连接词把句子连起来：'I want coffee because it helps me wake up' 比 'coffee, wake up' 更流畅
📚 试试更高级的表达：用 'I'd prefer' 代替 'I want'，用 'Could you' 代替 'Can you'
✏️ 注意句子完整性：确保每个句子都有主语和动词
   例如：'Can I have a coffee?' 是完整的句子
🎯 点餐句型：'I'd like to order...' 或 'Can I get...?'
```

### 支持的场景模板

| 场景 | 示例句型 |
|------|---------|
| **Grocery** | "Where can I find the {0}?", "How much is the {0}?", "Do you have fresh {0}?" |
| **Coffee** | "Can I get a {0}, please?", "I'd like a {0} with {1}.", "Could I have a {0} to go?" |
| **Restaurant** | "Could we have a table for two?", "I'd like to order the {0}.", "Could I have the bill, please?" |
| **Direction** | "Excuse me, where is the {0}?", "How do I get to the {0}?", "Can you show me on the map?" |
| **Greeting** | "Hi, my name is...", "Nice to meet you!", "How are you doing today?" |
| **Shopping** | "How much does this cost?", "Do you have this in a different size?", "Can I try this on?" |
| **Travel** | "I'd like to book a flight to...", "What time is my flight?", "Can I have a window seat?" |
| **Business** | "Let me introduce myself...", "What do you think about...?", "I suggest we..." |

### 修改文件
- `services/workflow-service/src/workflows/proficiency_scoring.py`
  - 重写 `_generate_improvement_tips()` 函数
  - 新增 `_generate_example_sentence()` 函数
  - 新增 `_get_task_specific_suggestion()` 函数

### 测试验证

```bash
# 测试 Grocery Shopping 场景
docker exec oral_app_workflow_service python -c "
from src.workflows.proficiency_scoring import proficiency_scoring_workflow
tips = proficiency_scoring_workflow._generate_improvement_tips(
    {'fluency':4,'vocabulary':4,'grammar':4,'task_relevance':4}, 
    {'scenario_title':'Grocery Shopping','task_description':'Ask for item locations'}
)
print('\\n'.join(tips))
"

# 预期输出：
# 💬 你可以尝试这样表达：'I think...' 或 'In my opinion...' 来开始你的回答
# 📚 试试用这些词：vegetable, fruit, price
#    例如：Do you have fresh vegetable?
# ✏️ 注意主谓一致：'I have' ✓ 而不是 'I has' ✗
#    试试这样说：'I need...' 或 'I would like...'
# 🎯 专注于当前任务，试试这样说：
#    例如：Do you have fresh vegetable?
```

### 部署状态
✅ workflow-service 已重建并部署  
✅ ai-omni-service 已重建并部署  
✅ 服务健康检查通过  
✅ 示例句子生成功能验证通过

---

## 实时错误纠正优化（2026 年 3 月 5 日）

### 问题描述
用户在练习过程中出现语法或词汇错误时，AI 导师没有及时指出并给出正确表达建议，导致用户可能形成错误的语言习惯。

### 解决方案

#### 修改 AI 导师提示词
在 `prompt_manager.py` 的 `oral_tutor_template` 中添加错误纠正指南。

**新增内容**：
1. **错误纠正责任**：明确 AI 需要纠正用户的语法/词汇错误
2. **纠正原则**：温和、提供正确形式、给出示例、继续对话
3. **示例演示**：提供具体的错误纠正示例

**修改位置**：`services/ai-omni-service/app/prompt_manager.py`

```python
# Error Correction Guidelines
**When you notice grammar or vocabulary errors:**
1. **Be Gentle**: Don't directly say "You're wrong"
2. **Provide Correct Form**: Show the correct way to say it
3. **Give Example**: Provide a complete example sentence
4. **Move On**: After correction, continue the conversation naturally

# Error Correction Examples
- User: "I wants coffee" → You: "Great! Just remember: 'I want coffee' (not 'wants'). Can you tell me what size coffee you'd like?"
- User: "Where is milk?" → You: "Good question! A more natural way: 'Where can I find the milk?' or 'Where is the milk located?' Now, what else do you need?"
- User: "I need buy egg" → You: "Nice try! Better: 'I need to buy eggs' or 'I'd like to buy some eggs'. Remember: 'need to + verb' and 'eggs' (plural). What else are you looking for?"
```

### 错误纠正示例

#### 场景 1：主谓一致错误

**用户**：`"I wants coffee"`

**AI 回复** ✅：
```
Great! Just remember: "I want coffee" (not "wants"). 
Can you tell me what size coffee you'd like?
```

**纠正要点**：
- 先鼓励（Great!）
- 指出正确形式（I want coffee）
- 说明错误点（not wants）
- 继续对话（询问咖啡大小）

#### 场景 2：缺少冠词

**用户**：`"Where is milk?"`

**AI 回复** ✅：
```
Good question! A more natural way: "Where can I find the milk?" 
or "Where is the milk located?" Now, what else do you need?
```

**纠正要点**：
- 肯定提问（Good question!）
- 提供更自然的表达
- 给出多个选项
- 继续对话

#### 场景 3：动词用法错误

**用户**：`"I need buy egg"`

**AI 回复** ✅：
```
Nice try! Better: "I need to buy eggs" or "I'd like to buy some eggs". 
Remember: "need to + verb" and "eggs" (plural). What else are you looking for?
```

**纠正要点**：
- 鼓励尝试（Nice try!）
- 提供正确形式（need to buy）
- 解释语法规则（need to + verb）
- 指出名词复数（eggs）
- 继续对话

### 常见错误类型及纠正策略

| 错误类型 | 用户输入 | AI 纠正方式 |
|---------|---------|------------|
| **主谓一致** | "I wants...", "He want..." | "Remember: I want / He wants" |
| **冠词缺失** | "Where is milk?" | "Where can I find the milk?" |
| **动词形式** | "I need buy..." | "I need to buy..." |
| **名词单复数** | "one egg", "two egg" | "one egg", "two eggs" |
| **时态错误** | "I go yesterday" | "You went yesterday (past tense)" |
| **介词错误** | "in the bus" | "on the bus" |
| **语序错误** | "You like what?" | "What do you like?" |

### 纠正原则

1. **温和友好**：使用 "Good try!", "Nice attempt!", "Great!" 开头
2. **简洁明了**：只纠正一个主要错误，不要一次指出所有问题
3. **提供示例**：给出完整的正确句子
4. **解释规则**：简单说明语法规则（如 "need to + verb"）
5. **继续对话**：纠正后自然过渡到下一个话题
6. **不过度纠正**：不影响对话流畅度，80% 时间让用户说

### 修改文件
- `services/ai-omni-service/app/prompt_manager.py`
  - `oral_tutor_template` 添加错误纠正指南
  - 添加错误纠正示例
  - 添加纠正原则说明

### 部署状态
✅ ai-omni-service 已重建并部署  
✅ 服务健康检查通过  
✅ 错误纠正提示词已生效
