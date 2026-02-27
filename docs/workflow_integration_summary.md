# 工作流集成总结

## 已完成集成

### Workflow 2: 熟练度打分 (Proficiency Scoring)

#### 后端集成 (ai-omni-service)

**文件**: `services/ai-omni-service/app/main.py`

**修改内容**:
1. 添加 WORKFLOW_SERVICE_URL 配置
2. 在 `response.audio.done` 事件中调用熟练度打分工作流
3. 添加 `call_proficiency_scoring_workflow` 辅助方法
4. 更新 WebSocketCallback 构造函数接收 goal_id, current_task_id, current_scenario_title

**关键代码**:
```python
# 在 response.audio.done 事件中
scoring_result = await self.call_proficiency_scoring_workflow(
    conversation_history=self.messages[-10:],  # 最近 10 轮对话
    response_id=r
)

# 发送熟练度更新到前端
if scoring_result.get('proficiency_delta', 0) > 0:
    await self.websocket.send_json({
        "type": "proficiency_update",
        "payload": {
            "delta": scoring_result.get('proficiency_delta'),
            "total": scoring_result.get('total_proficiency', 0),
            "message": scoring_result.get('message', '')
        }
    })

# 发送任务完成通知
if scoring_result.get('task_completed'):
    await self.websocket.send_json({
        "type": "task_completed",
        "payload": {
            "task_id": self.current_task_id,
            "scenario_title": self.current_scenario_title,
            "score": scoring_result.get('scores', {}),
            "message": scoring_result.get('message', 'Task completed!')
        }
    })
```

#### 前端集成 (Conversation.js)

**文件**: `client/src/pages/Conversation.js`

**修改内容**:
1. 添加 `proficiency_update` 消息处理
2. 添加 `task_completed` 消息处理
3. 显示熟练度变化通知（3 秒后自动消失）
4. 显示任务完成系统消息

**消息类型**:
- `proficiency_update`: 显示 "+X 熟练度 | 总分：Y"
- `task_completed`: 显示 "✅ 任务完成！{message}"

#### 数据流程

```
用户说话 → AI 回复 → 音频上传完成 → 调用 Workflow 2
                                              ↓
                                    分析最近 3-5 轮对话
                                              ↓
                                    计算各维度分数
                                    - Fluency (0-10)
                                    - Vocabulary (0-10)
                                    - Grammar (0-10)
                                    - Task Completion (0-10)
                                              ↓
                                    计算熟练度增量
                                    - 平均分≥8: +3 分
                                    - 平均分≥6: +2 分
                                    - 平均分≥4: +1 分
                                    - 平均分<4: +0 分
                                              ↓
                                    更新数据库
                                    - user_tasks.score
                                    - user_tasks.interaction_count
                                    - user_goals.current_proficiency
                                              ↓
                                    检查任务完成
                                    - score >= 3 → completed
                                              ↓
                                    发送通知到前端
                                    - proficiency_update
                                    - task_completed (if completed)
```

#### 业务逻辑关联

**熟练度分数与任务完成的关联**:
1. 每次 AI 回复后，分析最近 3-5 轮对话
2. 根据对话质量增加熟练度 (+1 到 +3 分)
3. 熟练度分数累加到 task.score
4. 当 task.score >= 3 时，标记任务为 completed
5. 前端接收到 `task_completed` 消息后：
   - 显示完成通知
   - 更新 completedTasks Set
   - 触发 MISSION TASKS 列表更新

#### 数据库更新

**user_tasks 表**:
```sql
UPDATE user_tasks 
SET score = score + proficiency_delta,
    interaction_count = interaction_count + 1,
    status = 'completed' (if score >= 3),
    completed_at = NOW() (if completed)
WHERE id = task_id
```

**user_goals 表**:
```sql
UPDATE user_goals 
SET current_proficiency = current_proficiency + proficiency_delta,
    updated_at = NOW()
WHERE id = goal_id
```

---

## 服务配置

### docker-compose.yml

添加了 workflow-service:
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

### 环境变量

**ai-omni-service**:
```
WORKFLOW_SERVICE_URL=http://workflow-service:3006
```

---

## 测试步骤

### 1. 启动服务
```bash
cd /Users/sgcc-work/IdeaProjects/oral_app
docker compose up -d workflow-service ai-omni-service client-app
```

### 2. 验证服务健康
```bash
# 检查 workflow-service
curl http://localhost:3006/health

# 检查 ai-omni-service
curl http://localhost:8082/health
```

### 3. 测试对话流程
1. 访问 `http://localhost:5001/conversation?scenario=Coffee%20Shop%20Order`
2. 进行 3-5 轮对话
3. 观察消息区域：
   - 应该看到 "+X 熟练度 | 总分：Y" 通知（绿色，3 秒消失）
   - 当任务分数>=3 时，看到 "✅ 任务完成！" 系统消息
4. 检查 MISSION TASKS 列表：
   - 完成的任务应该显示为完成状态

### 4. 检查日志
```bash
# 查看 workflow-service 日志
docker compose logs workflow-service

# 查看 ai-omni-service 日志
docker compose logs ai-omni-service | grep -i "proficiency\|task_completed"
```

---

## 下一步

### Workflow 3: 场景练习总结
- 检测场景完成 (3 个 tasks 全部 completed)
- 调用 scenario-review/generate API
- 显示复盘报告模态框

### Workflow 4: 新目标规划
- 检测所有场景完成 (10 个场景)
- 调用 goal-planning/check-completion API
- 显示新目标建议

---

## 注意事项

1. **性能考虑**:
   - 熟练度打分在音频上传完成后异步执行
   - 使用最近 10 轮对话，避免分析过长历史
   - workflow 服务错误不影响主对话流程

2. **错误处理**:
   - workflow 服务不可用时，记录警告但不中断
   - 数据库更新失败时，记录错误但不影响用户体验

3. **用户体验**:
   - 熟练度通知 3 秒自动消失，不干扰对话
   - 任务完成消息保留在对话历史中
   - MISSION TASKS 实时更新完成状态
