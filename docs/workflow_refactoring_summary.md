# 口语陪练工作流重构总结

## 概述

本次重构将应用分为 4 个独立的工作流，每个工作流负责特定功能，实现关注点分离和模块化。

---

## 数据库表结构

### users 表
- `id` (uuid): 用户 ID
- `username` (varchar): 用户名
- `email` (varchar): 邮箱
- `target_language` (varchar): 目标语言
- `interests` (text): 兴趣爱好

### user_goals 表
- `id` (integer): Goal ID
- `user_id` (uuid): 用户 ID
- `type` (varchar): 目标类型 (business_meeting, travel_survival, exam_prep, daily_conversation)
- `description` (text): 目标描述
- `target_language` (varchar): 目标语言
- `target_level` (varchar): 目标级别 (A1, A2, B1, B2, C1, C2)
- `current_proficiency` (integer): 当前熟练度 (0-100)
- `completion_time_days` (integer): 完成天数
- `scenarios` (jsonb): 场景列表
- `status` (varchar): 状态 (active, completed)
- `created_at`, `updated_at`, `completed_at`

### user_tasks 表
- `id` (integer): Task ID
- `user_id` (uuid): 用户 ID
- `goal_id` (integer): Goal ID
- `scenario_title` (varchar): 场景标题
- `task_description` (text): 任务描述
- `status` (varchar): 状态 (pending, completed)
- `score` (integer): 分数 (0-10)
- `interaction_count` (integer): 互动次数
- `feedback` (text): 反馈
- `completed_at`: 完成时间

---

## 工作流 1: 口语导师 (Oral Tutor)

**文件**: `services/workflow-service/src/workflows/oral_tutor.py`

### 职责
- 实时对话交互
- 纠正发音和语法
- 提供替代表达建议
- 保持对话流畅性

### 核心功能
```python
process_user_input(
    user_message: str,
    conversation_history: List[Dict],
    user_context: Dict,
    current_task: Optional[Dict]
) -> Dict[str, Any]
```

### 回复策略
- **Micro-Corrections**: 一次只纠正一个错误
- **Implicit Correction**: 通过重述正确句子来纠正
- **Explicit Correction**: 使用 "Almost! Try: [correct version]" 格式
- **Question-Driven**: 大部分回复以问题结束

### API 端点
```
POST /api/workflows/oral-tutor/analyze
```

---

## 工作流 2: 熟练度打分 (Proficiency Scoring)

**文件**: `services/workflow-service/src/workflows/proficiency_scoring.py`

### 职责
- 提取最近 3-5 轮对话
- 评估 fluency, vocabulary, grammar, task_completion
- 动态增减熟练度 (每次 +1 到 +3)
- 累计 +3 分时推送任务完成标记

### 评分维度
1. **Fluency (流利度)**: 0-10 分
   - 回复长度适中 (10-50 词)
   - 连续完整句子
   - 自然连接词使用

2. **Vocabulary (词汇)**: 0-10 分
   - 词汇多样性
   - 场景相关词汇
   - 高级词汇使用

3. **Grammar (语法)**: 0-10 分
   - 时态一致
   - 主谓一致
   - 句子结构完整

4. **Task Completion (任务完成)**: 0-10 分
   - 包含任务关键词
   - 完成对话目标

### 熟练度增量规则
- 平均分 >= 8: +3 分 (优秀)
- 平均分 >= 6: +2 分 (良好)
- 平均分 >= 4: +1 分 (一般)
- 平均分 < 4: +0 分 (需要改进)

### 任务完成标准
- 累计 >= 3 分 → 标记任务为 completed
- 推送"任务已完成"标记

### API 端点
```
POST /api/workflows/proficiency-scoring/update
```

---

## 工作流 3: 场景练习总结 (Scenario Review)

**文件**: `services/workflow-service/src/workflows/scenario_review.py`

### 职责
- 检测场景完成 (3 个 tasks 全部 completed)
- 提取该场景所有对话历史
- 生成综合复盘报告
- 提供针对性改进建议

### 复盘报告内容
```markdown
# Scenario Review: {scenario_title}

## 📊 Overall Performance
- Completion Time: {time}
- Total Interactions: {count}
- Average Score: {score}/10

## 🎯 Task Breakdown
- Task 1: {description} (Score: X/10)
- Task 2: {description} (Score: X/10)
- Task 3: {description} (Score: X/10)

## 💪 Strengths
- {strength 1}
- {strength 2}

## 📈 Areas for Improvement
- {improvement 1}
- {improvement 2}

## 💡 Specific Recommendations
- {recommendation 1}
- {recommendation 2}

## 🏆 Achievement
{achievement_message}
```

### 改进建议类型
- **Vocabulary**: 学习场景相关词汇
- **Elaboration**: 给出更详细的回复
- **Grammar**: 复习时态和主谓一致
- **Practice More**: 进行更长的对话

### API 端点
```
POST /api/workflows/scenario-review/generate
```

---

## 工作流 4: 新目标规划 (Goal Planning)

**文件**: `services/workflow-service/src/workflows/goal_planning.py`

### 职责
- 检测所有场景完成 (10 个场景)
- 或检测练习时长截止
- 生成新目标建议
- 引导用户建立新 goal

### 目标完成检测
1. **所有场景完成**: 10 个场景 x 3 个 tasks = 30 个 tasks 全部 completed
2. **练习时长截止**: 达到 `completion_time_days` 设定的天数

### 预设目标模板
1. **Business English Mastery** (business_meeting)
   - 目标级别：B2
   - 时长：60 天
   - 场景：Job Interview, Business Meeting, Presentation, Email Writing, Negotiation

2. **Travel Fluency** (travel_survival)
   - 目标级别：B1
   - 时长：45 天
   - 场景：Airport, Hotel, Restaurant, Emergency, Transportation

3. **Academic English** (exam_prep)
   - 目标级别：C1
   - 时长：90 天
   - 场景：Academic Discussion, Lecture, Research Presentation, Group Project

4. **Advanced Daily Conversation** (daily_conversation)
   - 目标级别：C1
   - 时长：60 天
   - 场景：Cultural Discussions, Current Events, Relationship Advice, Hobbies

### 推荐算法
- 基于用户兴趣 (interests 字段)
- 基于已完成目标的难度 (target_level)
- 基于表现总结 (avg_score)

### API 端点
```
POST /api/workflows/goal-planning/check-completion
GET  /api/workflows/goal-planning/suggestions
POST /api/workflows/goal-planning/create
```

---

## 服务部署

### Docker Compose 配置
```yaml
workflow-service:
  build: ./services/workflow-service
  container_name: oral_app_workflow_service
  restart: always
  ports:
    - "3006:3006"
  environment:
    - POSTGRES_HOST=postgres
    - POSTGRES_PORT=5432
    - POSTGRES_USER=user
    - POSTGRES_PASSWORD=password
    - POSTGRES_DB=oral_app
  depends_on:
    - postgres
  networks:
    - oral_app_net
```

### 端口映射
- **3006**: Workflow Service API

---

## 集成步骤

### 1. 更新 ai-omni-service
在 `response.audio.done` 事件中调用工作流 2：
```python
# 调用熟练度打分工作流
scoring_result = await proficiency_scoring_workflow.analyze_conversation_and_update_score(
    conversation_history=self.messages,
    user_id=self.user_id,
    goal_id=self.goal_id,
    current_task=self.current_task,
    db_connection=db_pool
)

# 如果任务完成，发送通知
if scoring_result.get("task_completed"):
    await self.websocket.send_json({
        "type": "task_completed",
        "payload": scoring_result
    })
```

### 2. 更新 history-analytics-service
添加场景完成检测：
```javascript
// 检查场景是否完成 (3 个 tasks)
const completedTasks = await db.collection('user_tasks').find({
  goal_id: goalId,
  scenario_title: scenarioTitle,
  status: 'completed'
}).toArray();

if (completedTasks.length >= 3) {
  // 调用场景总结工作流
  const review = await fetch('http://workflow-service:3006/api/workflows/scenario-review/generate', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      goal_id: goalId,
      scenario_title: scenarioTitle,
      conversation_history: messages
    })
  });
}
```

### 3. 更新 frontend (Conversation.js)
在消息处理中添加工作流集成：
```javascript
case 'task_completed':
  // 显示任务完成通知
  setMessages(prev => [...prev, {
    type: 'system',
    content: `🎉 Task completed! ${data.payload.message}`
  }]);
  break;

case 'scenario_review':
  // 显示场景复盘报告
  setShowReviewModal(true);
  setReviewReport(data.payload.review_report);
  break;
```

---

## 测试计划

### 1. 工作流 1 测试
- [ ] 发送用户消息，验证回复策略生成
- [ ] 验证纠正逻辑 (语言切换、语法错误)
- [ ] 验证 engagement boost (短回复检测)

### 2. 工作流 2 测试
- [ ] 模拟 3-5 轮对话，验证分数计算
- [ ] 验证熟练度增量 (+1, +2, +3)
- [ ] 验证任务完成标记 (累计>=3 分)

### 3. 工作流 3 测试
- [ ] 完成 3 个 tasks，验证场景完成检测
- [ ] 验证复盘报告生成
- [ ] 验证改进建议针对性

### 4. 工作流 4 测试
- [ ] 完成 10 个场景，验证目标完成检测
- [ ] 验证新目标建议生成
- [ ] 验证新 goal 创建

---

## 下一步

1. **添加 workflow-service 到 docker-compose.yml**
2. **更新 ai-omni-service 集成工作流 2**
3. **更新 history-analytics-service 集成工作流 3**
4. **更新 frontend 显示工作流结果**
5. **端到端测试所有工作流**
