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

## 相关文档

- 进度条修复：`docs/progress_bar_task_switch_fix.md`
- AI 任务切换修复：`docs/ai_task_transition_fix.md`
- 改进建议优化：`docs/improvement_tips_optimization.md`
- 任务完成机制：`docs/task_completion_optimization.md`
