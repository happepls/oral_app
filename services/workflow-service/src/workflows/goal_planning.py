"""
Workflow 4: Goal Planning (新目标规划)
负责当用户通过所有场景 (共 10 个场景) 或练习时长截止时，
引导用户建立新的口语练习目标 (goal)
"""
import json
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta


class GoalPlanningWorkflow:
    """
    新目标规划工作流
    - 检测所有场景完成 (10 个场景 x 3 个 tasks = 30 个 tasks)
    - 或检测练习时长截止
    - 生成新目标建议
    - 引导用户建立新 goal
    """
    
    def __init__(self):
        self.goal_templates = self._build_goal_templates()
        self.default_scenarios = self._get_default_scenarios()
    
    def _build_goal_templates(self) -> Dict[str, Dict[str, Any]]:
        """构建目标模板"""
        return {
            "business_english": {
                "type": "business_meeting",
                "title": "Business English Mastery",
                "description": "Master professional communication for international business",
                "target_level": "B2",
                "duration_days": 60,
                "scenarios": [
                    {"title": "Job Interview", "tasks": ["Introduce yourself professionally", "Describe your strengths", "Ask insightful questions"]},
                    {"title": "Business Meeting", "tasks": ["Express opinions politely", "Agree and disagree professionally", "Summarize action items"]},
                    {"title": "Presentation", "tasks": ["Open with a hook", "Present data clearly", "Handle Q&A session"]},
                    {"title": "Email Writing", "tasks": ["Write formal greetings", "Make requests politely", "Close professionally"]},
                    {"title": "Negotiation", "tasks": ["State your position", "Make counteroffers", "Reach win-win agreements"]},
                ]
            },
            "travel_fluency": {
                "type": "travel_survival",
                "title": "Travel Fluency",
                "description": "Communicate confidently while traveling abroad",
                "target_level": "B1",
                "duration_days": 45,
                "scenarios": [
                    {"title": "Airport & Immigration", "tasks": ["Answer immigration questions", "Declare items at customs", "Ask for directions"]},
                    {"title": "Hotel Check-in", "tasks": ["Request room preferences", "Ask about amenities", "Handle problems"]},
                    {"title": "Restaurant Dining", "tasks": ["Make reservations", "Order local specialties", "Handle dietary restrictions"]},
                    {"title": "Emergency Situations", "tasks": ["Describe symptoms to doctor", "Report lost items", "Ask for help"]},
                    {"title": "Local Transportation", "tasks": ["Buy tickets", "Ask for directions", "Negotiate taxi fare"]},
                ]
            },
            "academic_english": {
                "type": "exam_prep",
                "title": "Academic English (IELTS/TOEFL)",
                "description": "Prepare for English proficiency exams",
                "target_level": "C1",
                "duration_days": 90,
                "scenarios": [
                    {"title": "Academic Discussion", "tasks": ["Express opinions with evidence", "Compare viewpoints", "Synthesize information"]},
                    {"title": "Lecture Comprehension", "tasks": ["Take effective notes", "Ask clarifying questions", "Summarize key points"]},
                    {"title": "Research Presentation", "tasks": ["Describe methodology", "Present findings", "Defend conclusions"]},
                    {"title": "Group Project", "tasks": ["Assign roles", "Resolve conflicts", "Present collaboratively"]},
                    {"title": "Academic Writing Discussion", "tasks": ["Discuss thesis statements", "Critique arguments", "Suggest improvements"]},
                ]
            },
            "daily_conversation_advanced": {
                "type": "daily_conversation",
                "title": "Advanced Daily Conversation",
                "description": "Master nuanced everyday communication",
                "target_level": "C1",
                "duration_days": 60,
                "scenarios": [
                    {"title": "Cultural Discussions", "tasks": ["Discuss traditions", "Compare cultures", "Express cultural sensitivity"]},
                    {"title": "Current Events", "tasks": ["Discuss news objectively", "Express opinions respectfully", "Debate politely"]},
                    {"title": "Relationship Advice", "tasks": ["Listen empathetically", "Give suggestions tactfully", "Show understanding"]},
                    {"title": "Hobbies & Interests", "tasks": ["Share passions enthusiastically", "Ask follow-up questions", "Make plans together"]},
                    {"title": "Future Planning", "tasks": ["Discuss goals", "Make predictions", "Express hopes and concerns"]},
                ]
            }
        }
    
    def _get_default_scenarios(self) -> List[str]:
        """获取默认场景列表"""
        return [
            "Casual Greetings", "Coffee Shop Order", "Grocery Shopping",
            "Directions", "Phone Call Basics", "Restaurant Dining",
            "Public Transport", "Weekend Plans", "Hobbies Discussion",
            "Small Talk (Culture)"
        ]
    
    async def check_goal_completion(
        self,
        user_id: str,
        goal_id: int,
        all_tasks: List[Dict[str, Any]],
        db_connection: Any
    ) -> Dict[str, Any]:
        """
        检查目标是否完成
        
        Returns:
            {
                "goal_completed": bool,
                "completion_type": str,  # "all_scenarios" or "time_expired"
                "completed_scenarios": int,
                "total_scenarios": int,
                "should_create_new_goal": bool
            }
        """
        result = {
            "goal_completed": False,
            "completion_type": None,
            "completed_scenarios": 0,
            "total_scenarios": 10,
            "should_create_new_goal": False,
            "message": None
        }
        
        # 检查场景完成情况
        unique_scenarios = set(task.get("scenario_title") for task in all_tasks)
        completed_scenarios = set(
            task.get("scenario_title") 
            for task in all_tasks 
            if task.get("status") == "completed"
        )
        
        result["completed_scenarios"] = len(completed_scenarios)
        
        # 检查是否所有场景完成 (10 个)
        if len(completed_scenarios) >= 10:
            result["goal_completed"] = True
            result["completion_type"] = "all_scenarios"
            result["should_create_new_goal"] = True
            result["message"] = "🎉 Congratulations! You've completed all scenarios!"
            return result
        
        # 检查练习时长是否截止
        goal_info = await db_connection.fetchrow(
            """
            SELECT created_at, completion_time_days, current_proficiency
            FROM user_goals 
            WHERE id = $1
            """,
            goal_id
        )
        
        if goal_info:
            created_at = goal_info.get("created_at")
            duration_days = goal_info.get("completion_time_days", 90)
            current_proficiency = goal_info.get("current_proficiency", 0)
            
            if created_at:
                elapsed_days = (datetime.now(created_at.tzinfo) - created_at).days
                if elapsed_days >= duration_days:
                    result["goal_completed"] = True
                    result["completion_type"] = "time_expired"
                    result["should_create_new_goal"] = True
                    result["message"] = f"⏰ Practice period completed ({elapsed_days} days). Time for a new challenge!"
                    
                    # 更新 goal 状态
                    await db_connection.execute(
                        """
                        UPDATE user_goals 
                        SET status = 'completed',
                            completed_at = NOW()
                        WHERE id = $1
                        """,
                        goal_id
                    )
        
        return result
    
    def generate_new_goal_suggestions(
        self,
        user_profile: Dict[str, Any],
        completed_goal: Dict[str, Any],
        performance_summary: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        生成新目标建议
        
        Args:
            user_profile: 用户档案 (interests, target_language 等)
            completed_goal: 已完成的 goal
            performance_summary: 表现总结 (avg_score, strengths, weaknesses)
            
        Returns:
            推荐的新目标列表
        """
        suggestions = []
        
        # 基于用户兴趣推荐
        interests = user_profile.get("interests", "").lower()
        target_language = user_profile.get("target_language", "English")
        
        # 基于已完成目标的难度推荐
        completed_level = completed_goal.get("target_level", "B1")
        next_level = self._get_next_level(completed_level)
        
        # 生成 3-4 个建议
        if "business" in interests or "work" in interests:
            suggestions.append(self.goal_templates["business_english"])
        
        if "travel" in interests or "culture" in interests:
            suggestions.append(self.goal_templates["travel_fluency"])
        
        if "exam" in interests or "study" in interests or "academic" in interests:
            suggestions.append(self.goal_templates["academic_english"])
        
        # 默认推荐
        if len(suggestions) < 2:
            suggestions.append(self.goal_templates["daily_conversation_advanced"])
        
        # 为每个建议添加元数据
        for suggestion in suggestions:
            suggestion["target_level"] = next_level
            suggestion["reason"] = self._generate_recommendation_reason(
                suggestion, 
                user_profile, 
                performance_summary
            )
        
        return suggestions[:4]
    
    def _get_next_level(self, current_level: str) -> str:
        """获取下一个难度级别"""
        level_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
        
        try:
            current_index = level_order.index(current_level)
            next_index = min(current_index + 1, len(level_order) - 1)
            return level_order[next_index]
        except ValueError:
            return "B1"  # 默认
    
    def _generate_recommendation_reason(
        self,
        suggestion: Dict[str, Any],
        user_profile: Dict[str, Any],
        performance_summary: Dict[str, Any]
    ) -> str:
        """生成推荐原因"""
        goal_type = suggestion.get("type", "")
        
        if goal_type == "business_english":
            return "Perfect for career advancement and professional communication"
        elif goal_type == "travel_fluency":
            return "Ideal for confident travel and cultural exploration"
        elif goal_type == "exam_prep":
            return "Comprehensive preparation for IELTS/TOEFL success"
        else:
            return "Advance your conversational skills to native-like fluency"
    
    async def create_new_goal(
        self,
        user_id: str,
        goal_template: Dict[str, Any],
        db_connection: Any
    ) -> Dict[str, Any]:
        """
        创建新目标
        
        Returns:
            新创建的 goal 信息
        """
        # 插入新 goal
        result = await db_connection.fetchrow(
            """
            INSERT INTO user_goals (
                user_id, type, description, target_language, 
                target_level, completion_time_days, interests,
                scenarios, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
            RETURNING id, created_at
            """,
            user_id,
            goal_template.get("type"),
            goal_template.get("description"),
            goal_template.get("target_language", "English"),
            goal_template.get("target_level", "B1"),
            goal_template.get("duration_days", 60),
            goal_template.get("interests", ""),
            json.dumps(goal_template.get("scenarios", []))
        )
        
        new_goal_id = result.get("id")
        
        # 创建关联的 tasks
        scenarios = goal_template.get("scenarios", [])
        created_tasks = []
        
        for scenario in scenarios:
            for task in scenario.get("tasks", []):
                task_result = await db_connection.fetchrow(
                    """
                    INSERT INTO user_tasks (
                        user_id, goal_id, scenario_title, task_description, status
                    )
                    VALUES ($1, $2, $3, $4, 'pending')
                    RETURNING id
                    """,
                    user_id,
                    new_goal_id,
                    scenario.get("title"),
                    task
                )
                created_tasks.append(task_result.get("id"))
        
        return {
            "goal_id": new_goal_id,
            "goal_type": goal_template.get("type"),
            "tasks_created": len(created_tasks),
            "message": f"🎯 New goal created: {goal_template.get('title')}"
        }
    
    def generate_goal_completion_message(
        self,
        completed_goal: Dict[str, Any],
        performance_summary: Dict[str, Any]
    ) -> str:
        """生成目标完成祝贺消息"""
        message = f"""🎉 **Goal Completed!**

📊 **Summary**:
- Goal: {completed_goal.get('description', 'Your practice goal')}
- Final Proficiency: {completed_goal.get('current_proficiency', 0)}
- Target Level: {completed_goal.get('target_level', 'B1')}

💪 **Your Achievements**:
- Average Score: {performance_summary.get('avg_score', 0)}/10
- Practice Days: {performance_summary.get('practice_days', 0)}
- Tasks Completed: {performance_summary.get('tasks_completed', 0)}

🚀 **What's Next?**
Ready for a new challenge? Check out our recommended goals above!"""
        
        return message


# 导出工作流实例
goal_planning_workflow = GoalPlanningWorkflow()
