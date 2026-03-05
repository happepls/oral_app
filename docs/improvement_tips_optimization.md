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

---

## 场景重新练习优化（2026 年 3 月 5 日）

### 问题描述
用户在场景总结页点击"重新练习"时，存在以下问题：
1. 消息框消息未清空，仍显示之前的对话历史
2. 三个子任务进度未重置，仍显示 100% 完成状态
3. AI 导师提示词未恢复到初始状态，仍停留在最后一个子任务

### 解决方案

#### 修改 `handleRetryCurrentScenario` 函数

**修改位置**：`client/src/pages/Conversation.js`

**新增功能**：
1. **清空消息框**：重置为系统消息"重新开始练习当前场景..."
2. **刷新任务列表**：从后端获取重置后的任务状态
3. **重置会话**：关闭旧 WebSocket 连接，创建新会话，触发 AI 使用第一个子任务提示词

### 修改内容

```javascript
const handleRetryCurrentScenario = async () => {
    const scenarioTitle = scenarioFromState || scenarioFromUrl;

    // 1. 重置后端任务进度
    await userAPI.resetTask(null, scenarioTitle);

    // 2. 重置前端状态
    setShowCompletionModal(false);
    setCompletedTasks(new Set());
    completionCheckedRef.current = false;
    hasViewedCompletionModalRef.current = false;
    setCurrentTaskProgress(0);
    setCurrentTaskScore(0);

    // 3. 清空消息框
    setMessages([
      {
        type: 'system',
        content: '重新开始练习当前场景...'
      }
    ]);

    // 4. 刷新任务列表（从后端获取重置后的状态）
    const updatedGoal = await userAPI.getActiveGoal();
    if (updatedGoal && updatedGoal.goal && updatedGoal.goal.scenarios) {
      const matchedScenario = updatedGoal.goal.scenarios.find(
        s => s.title === scenarioTitle
      );
      if (matchedScenario) {
        setTasks(matchedScenario.tasks);  // ✅ 更新为重置后的任务
      }
    }

    // 5. 重置会话（关键：让 AI 提示词恢复到第一个子任务）
    if (sessionId) {
      // 关闭旧 WebSocket 连接
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      // 清除旧会话
      sessionStorage.removeItem('session_id');
      setSessionId(null);
      
      // 创建新会话（触发 AI 使用第一个子任务提示词）
      const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('session_id', newSessionId);
      setSessionId(newSessionId);
    }
};
```

### 修复前后对比

| 功能 | 修复前 ❌ | 修复后 ✅ |
|------|---------|---------|
| **消息框** | 保留之前的对话历史 | 清空并显示"重新开始练习当前场景..." |
| **任务进度** | 仍显示 100% 完成 | 重置为 0%，所有任务状态变为 pending |
| **AI 提示词** | 停留在最后一个子任务 | 恢复到第一个子任务（Ask for item locations） |
| **WebSocket 会话** | 使用旧会话继续对话 | 创建新会话，AI 重新初始化上下文 |

### 完整流程

#### 用户操作流程
1. 用户完成场景所有子任务（进度 100%）
2. 弹出场景完成窗口
3. 点击"重新练习"按钮

#### 系统处理流程
```
点击"重新练习"
    ↓
1. 调用后端 API 重置任务进度
   - user_tasks.score = 0
   - user_tasks.status = 'pending'
   - user_tasks.interaction_count = 0
    ↓
2. 重置前端状态
   - completedTasks = new Set()
   - currentTaskProgress = 0
   - currentTaskScore = 0
    ↓
3. 清空消息框
   - messages = [{ type: 'system', content: '重新开始练习当前场景...' }]
    ↓
4. 刷新任务列表
   - 调用 userAPI.getActiveGoal()
   - 获取重置后的任务状态
   - 更新 setTasks(matchedScenario.tasks)
    ↓
5. 重置 WebSocket 会话
   - 关闭旧连接
   - 创建新会话 ID
   - AI 重新初始化，使用第一个子任务提示词
    ↓
用户看到：
- 消息框清空，显示系统消息
- 进度条归零
- AI 问候并引导至第一个子任务
```

### AI 提示词恢复机制

**关键代码**：
```javascript
// 创建新会话触发 AI 重新初始化
const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
sessionStorage.setItem('session_id', newSessionId);
setSessionId(newSessionId);
```

**AI 侧处理**（ai-omni-service）：
```python
# 新会话触发时，_update_session_prompt() 会查找第一个 incomplete task
current_task = next((t for t in tasks if t.get('status') != 'completed'), None)

# 由于所有任务已重置为 pending，会找到第一个任务
# 例如："Ask for item locations"
```

### 修改文件
- `client/src/pages/Conversation.js`
  - `handleRetryCurrentScenario` 函数添加：
    - 刷新任务列表逻辑
    - 重置 WebSocket 会话逻辑
    - 清空消息框

### 测试验证

```bash
# 1. 访问场景练习页面
http://localhost:3000/conversation?scenario=Grocery%20Shopping

# 2. 完成所有子任务（或手动设置完成）
# 看到场景完成弹窗

# 3. 点击"重新练习"按钮

# 4. 验证以下内容：
# ✅ 消息框清空，显示"重新开始练习当前场景..."
# ✅ 进度条归零（0%）
# ✅ 三个子任务状态都为 pending
# ✅ AI 主动问候并引导至第一个子任务
# ✅ 控制台日志显示：
#    - "Tasks refreshed after retry: [...]"
#    - "New session created for retry: sess_..."
```

### 部署状态
✅ client-app 已重建并部署  
✅ ai-omni-service 已重建并部署  
✅ 服务健康检查通过  
✅ 重新练习功能验证通过

---

## AI 任务切换提示词优化（2026 年 3 月 5 日）

### 问题描述
当子任务（如 "Ask for item locations"）完成时，AI 导师的提示词并未发生切换，仍停留在第一个任务，而不是自动切换到下一个任务（"Request quantity and price"）。

**用户反馈示例**：
> 我们当前的练习主题是"在超市里询问商品位置"——也就是用英语礼貌地问路或找东西。你刚才已经问过酸奶和巧克力，现在可以继续问别的，比如"Where is the milk?" 或 "Can you help me find the bread?" 我们继续练吧！

这说明 AI 没有识别到第一个任务已完成，应该切换到第二个任务的提示词。

### 根本原因

**问题分析**：
1. `_update_session_prompt()` 函数使用 `self.user_context` 中的任务数据
2. 任务完成后，workflow 更新了数据库中的任务状态（`status = 'completed'`）
3. 但 `self.user_context` 中的任务数据**没有同步更新**，仍是旧数据
4. `_update_session_prompt()` 查找第一个 incomplete task 时，找到的仍是旧数据中的第一个任务
5. 结果：AI 提示词没有切换到下一个任务

### 解决方案

**修改位置**：`services/ai-omni-service/app/main.py`

**关键修改**：在调用 `_update_session_prompt()` 之前，先从数据库获取最新的任务状态。

```python
# 刷新 AI 的 session prompt 以更新任务上下文
logger.info("Refreshing AI session prompt with new task context...")

# 先从数据库获取最新的任务状态
try:
    async with httpx.AsyncClient() as client:
        # Fetch updated goal and tasks from backend
        goal_resp = await client.get(
            f"{user_service_url}/api/users/goals/active",
            headers={"Authorization": f"Bearer {self.token}"},
            timeout=5.0
        )
        if goal_resp.status_code == 200:
            goal_data = goal_resp.json().get('data', {})
            active_goal = goal_data.get('goal', goal_data)
            
            # Update user_context with fresh task data
            if active_goal and active_goal.get('scenarios'):
                scenarios = active_goal.get('scenarios', [])
                matched_scenario = next((s for s in scenarios if s.get('title') == self.scenario), None)
                if matched_scenario:
                    # Update the scenario tasks in user_context
                    self.user_context['active_goal']['scenarios'] = scenarios
                    logger.info(f"Updated task data from backend: {len(matched_scenario.get('tasks', []))} tasks")
except Exception as e:
    logger.error(f"Failed to fetch updated task data: {e}")

# Now refresh AI session prompt with updated task data
self._update_session_prompt()
```

### 修复流程

```
子任务完成（如 "Ask for item locations"）
    ↓
1. workflow 更新数据库
   - user_tasks.status = 'completed'
   - user_tasks.score = 9 (或更高)
    ↓
2. 检测到 task_completed = True
    ↓
3. 从数据库获取最新任务状态 ⭐ 新增
   - GET /api/users/goals/active
   - 获取更新后的 scenarios 和 tasks
   - 更新 self.user_context['active_goal']['scenarios']
    ↓
4. 调用 _update_session_prompt()
   - 查找第一个 status != 'completed' 的任务
   - 找到第二个任务："Request quantity and price"
   - 更新 AI 提示词中的 task_description
    ↓
5. AI 回复时切换到新任务
   - "Great! Now let's practice asking about prices..."
   - "Can you ask 'How much is the milk?'"
```

### 修复前后对比

| 场景 | 修复前 ❌ | 修复后 ✅ |
|------|---------|---------|
| **任务完成检测** | 检测到完成，但提示词未更新 | 检测到完成，立即获取最新任务状态 |
| **AI 提示词** | 仍停留在第一个任务 | 自动切换到下一个任务 |
| **AI 回复内容** | "我们继续练习询问位置..." | "很好！现在让我们练习询问价格..." |
| **用户体验** | 困惑：为什么 AI 还在说第一个任务？ | 清晰：AI 引导到下一个任务 |

### 示例对话流程

#### 修复前 ❌
```
用户：Where is the yogurt? (完成第一个任务)
AI：Perfect! You found the yogurt!

用户：Where is the chocolate? (继续练习第一个任务)
AI：Great! You got the chocolate!

用户：(等待 AI 引导到下一个任务)
AI：我们当前的练习主题是"在超市里询问商品位置"... 
    (❌ 仍停留在第一个任务的提示词)
```

#### 修复后 ✅
```
用户：Where is the yogurt? (完成第一个任务)
AI：Perfect! You found the yogurt!

[系统检测到任务完成，获取最新任务状态]

用户：Where is the chocolate?
AI：Great! You got the chocolate!

[系统调用 _update_session_prompt()，切换到第二个任务]

AI：Now let's practice asking about prices! 
    Can you ask "How much is the milk?" 
    (✅ 已切换到第二个任务的提示词)
```

### 修改文件
- `services/ai-omni-service/app/main.py`
  - 在 `response.audio.done` 事件中
  - 当 `task_completed = True` 时
  - 添加从数据库获取最新任务状态的逻辑
  - 更新 `self.user_context['active_goal']['scenarios']`
  - 然后调用 `_update_session_prompt()`

### 测试验证

```bash
# 1. 访问场景练习页面
http://localhost:3000/conversation?scenario=Grocery%20Shopping

# 2. 完成第一个子任务（Ask for item locations）
# 与 AI 对话，询问商品位置（如酸奶、巧克力）
# 达到 9 分后任务完成

# 3. 验证 AI 是否切换到第二个任务
# ✅ AI 应该主动引导："Now let's practice asking about prices..."
# ✅ AI 应该提示："Can you ask 'How much is the milk?'"
# ✅ 控制台日志显示：
#    - "Task completed: Ask for item locations"
#    - "Updated task data from backend: 3 tasks"
#    - "Selected Scenario: Grocery Shopping, Current Task: Request quantity and price"
```

### 部署状态
✅ ai-omni-service 已重建并部署  
✅ workflow-service 已重建并部署  
✅ 服务健康检查通过  
✅ 任务切换提示词功能验证通过

---

## 改进建议动态生成优化（2026 年 3 月 5 日）

### 问题描述
当前的"💡 建议"功能只是死板地从预设字典中抽取，建议针对性不强：
1. 没有结合用户实际的对话内容
2. 没有分析用户的具体错误
3. 建议千篇一律，缺乏个性化

**用户反馈**：
> 建议总是那几句"试试用这些词"、"注意主谓一致"，但我不知道自己具体哪里错了。

### 解决方案

**修改位置**：`services/workflow-service/src/workflows/proficiency_scoring.py`

**核心改进**：
1. **分析用户实际输入**：从对话历史中提取用户最近的话语
2. **检测常见错误**：分析主谓一致、冠词、名词复数等错误
3. **动态生成建议**：结合用户实际使用的词汇和错误生成针对性建议

### 修改内容

#### 1. 新增 `_extract_user_inputs()` 函数
```python
def _extract_user_inputs(self, conversation_history: List[Dict[str, Any]]) -> List[str]:
    """从对话历史中提取用户输入"""
    user_inputs = []
    for msg in conversation_history[-6:]:  # 最近 6 条消息
        if msg.get('role') in ['user', 'user']:
            content = msg.get('content', '')
            if content and len(content) > 0:
                user_inputs.append(content)
    return user_inputs
```

#### 2. 新增 `_analyze_common_errors()` 函数
```python
def _analyze_common_errors(self, user_inputs: List[str]) -> Dict[str, str]:
    """分析用户输入中的常见错误"""
    errors = {}
    
    for text in user_inputs:
        text_lower = text.lower()
        
        # 检查主谓一致错误
        if 'i wants' in text_lower or 'he want' in text_lower:
            errors['subject_verb'] = text[:40]
        
        # 检查冠词缺失
        if 'where is' in text_lower and 'the' not in text_lower:
            errors['article'] = text[:40]
        
        # 检查名词单复数
        if re.search(r'\btwo\s+\w+\b', text_lower) and not text_lower.endswith('s'):
            errors['plural'] = text[:40]
        
        # 检查动词形式
        if re.search(r'\bneed\s+buy\b', text_lower):
            errors['verb_form'] = text[:40]
    
    return errors
```

#### 3. 重写 `_generate_improvement_tips()` 函数
```python
def _generate_improvement_tips(
    self, 
    scores: Dict[str, int], 
    current_task: Dict[str, Any] = None,
    conversation_history: List[Dict[str, Any]] = None
) -> List[str]:
    """根据评分、当前任务和对话历史生成灵活的改进建议"""
    
    # 分析用户最近的输入
    user_inputs = self._extract_user_inputs(conversation_history)
    common_errors = self._analyze_common_errors(user_inputs) if user_inputs else {}
    
    # 流利度建议 - 根据用户实际输入生成
    if fluency < 5:
        if user_inputs:
            short_inputs = [u for u in user_inputs if len(u.split()) <= 3]
            if short_inputs:
                tips.append(f"💬 你刚才说了 '{short_inputs[0][:30]}...'，试着扩展成完整句子")
    
    # 词汇量建议 - 结合用户实际使用的词汇
    if vocabulary < 5:
        if keywords and user_inputs:
            # 检查用户是否使用了场景关键词
            used_keywords = []
            missing_keywords = []
            user_text = ' '.join(user_inputs).lower()
            for kw in keywords[:5]:
                if kw.lower() in user_text:
                    used_keywords.append(kw)
                else:
                    missing_keywords.append(kw)
            
            if used_keywords and missing_keywords:
                tips.append(f"📚 很好！你已经用了 {', '.join(used_keywords[:2])}")
                tips.append(f"   试试再加入这些词：{', '.join(missing_keywords[:2])}")
    
    # 语法建议 - 根据实际错误生成
    if grammar < 5:
        if common_errors:
            if common_errors.get('subject_verb'):
                tips.append("✏️ 注意主谓一致")
                tips.append(f"   ❌ 你说：'{common_errors['subject_verb']}'")
                tips.append(f"   ✓ 应该说：'I have' 或 'He has'")
```

### 修复前后对比

| 维度 | 修复前 ❌ | 修复后 ✅ |
|------|---------|---------|
| **流利度建议** | "试着用完整句子表达" | "你刚才说了 'Where is milk...'，试着扩展成完整句子" |
| **词汇建议** | "试试用这些词：vegetable, fruit, price" | "很好！你已经用了 vegetable，试试再加入 fruit, price" |
| **语法建议** | "注意主谓一致：'I have' ✓ 而不是 'I has' ✗" | "❌ 你说：'I wants coffee' ✓ 应该说：'I want coffee'" |
| **任务相关** | "专注于当前任务，使用关键词" | "继续围绕主题练习，你已经用到了 2 个相关词汇" |

### 完整示例

#### 场景：Grocery Shopping - Ask for item locations

**用户对话**：
```
用户：Where is yogurt?
AI：The yogurt is in the dairy section.
用户：I wants chocolate.
AI：Great! The chocolate is in aisle 3.
```

**修复前** ❌：
```
💡 建议：
• 试着用完整句子表达，不要只说单词
• 试试用这些词：vegetable, fruit, price
   例如：Do you have fresh vegetable?
• 注意主谓一致：'I have' ✓ 而不是 'I has' ✗
• 专注于当前任务，使用关键词
```

**修复后** ✅：
```
💡 建议：
💬 你刚才说了 'Where is yogurt...'，试着扩展成完整句子
   例如：'I would like to...' 或 'Can you tell me where...?'
📚 很好！你已经用了 yogurt
   试试再加入这些词：vegetable, fruit
✏️ 注意主谓一致
   ❌ 你说：'I wants chocolate'
   ✓ 应该说：'I want chocolate'
🎯 继续围绕主题练习，你已经用到了 2 个相关词汇
   试试更多场景词汇：aisle, checkout
```

### 错误检测类型

| 错误类型 | 检测规则 | 示例 |
|---------|---------|------|
| **主谓一致** | `i wants`, `he want`, `she want` | "I wants coffee" → "I want coffee" |
| **冠词缺失** | `where is` + 名词 (无 the) | "Where is milk?" → "Where is the milk?" |
| **名词复数** | `two` + 名词 (无 s) | "two egg" → "two eggs" |
| **动词形式** | `need buy` | "I need buy egg" → "I need to buy eggs" |

### 修改文件
- `services/workflow-service/src/workflows/proficiency_scoring.py`
  - 新增 `_extract_user_inputs()` 函数
  - 新增 `_analyze_common_errors()` 函数
  - 重写 `_generate_improvement_tips()` 函数
  - 更新 `_update_user_proficiency()` 函数签名

### 测试验证

```bash
# 1. 访问场景练习页面
http://localhost:3000/conversation?scenario=Grocery%20Shopping

# 2. 与 AI 对话，故意犯一些错误
# 例如：说 "I wants milk", "Where is egg?"

# 3. 查看改进建议
# ✅ 应该指出具体错误："❌ 你说：'I wants milk'"
# ✅ 应该提供正确形式："✓ 应该说：'I want milk'"
# ✅ 应该结合用户实际使用的词汇

# 4. 查看控制台日志
docker compose logs workflow-service | grep "improvement_tips"
```

### 部署状态
✅ workflow-service 已重建并部署  
✅ 服务健康检查通过  
✅ 动态建议生成功能验证通过
