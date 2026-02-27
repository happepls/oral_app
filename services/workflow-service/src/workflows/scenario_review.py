"""
Workflow 3: Scenario Review (场景练习总结)
负责用户通过某一场景后 (3 个 mission task 每场景)，
提取该场景的所有对话信息并对用户的练习情况进行总结复盘，提出修正建议
"""
import json
import re
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta


class ScenarioReviewWorkflow:
    """
    场景练习总结工作流
    - 检测场景完成 (3 个 tasks 全部 completed)
    - 提取该场景所有对话历史
    - 生成综合复盘报告
    - 提供针对性改进建议
    """
    
    def __init__(self):
        self.review_template = self._build_review_template()
    
    def _build_review_template(self) -> str:
        """构建复盘报告模板"""
        return """# Scenario Review: {scenario_title}

## 📊 Overall Performance
- **Completion Time**: {completion_time}
- **Total Interactions**: {total_interactions}
- **Average Score**: {avg_score}/10

## 🎯 Task Breakdown
{task_breakdown}

## 💪 Strengths
{strengths}

## 📈 Areas for Improvement
{improvements}

## 💡 Specific Recommendations
{recommendations}

## 🏆 Achievement
{achievement_message}
"""
    
    async def generate_scenario_review(
        self,
        user_id: str,
        goal_id: int,
        scenario_title: str,
        completed_tasks: List[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]],
        db_connection: Any
    ) -> Dict[str, Any]:
        """
        生成场景练习总结
        
        Args:
            user_id: 用户 ID
            goal_id: 目标 ID
            scenario_title: 场景标题
            completed_tasks: 已完成的 3 个任务
            conversation_history: 该场景的所有对话历史
            db_connection: 数据库连接
            
        Returns:
            包含复盘报告、建议等信息
        """
        # 分析对话历史
        analysis = await self._analyze_scenario_conversation(
            conversation_history, 
            completed_tasks
        )
        
        # 生成复盘报告
        review_report = self._generate_review_report(
            scenario_title,
            completed_tasks,
            analysis
        )
        
        # 生成改进建议
        recommendations = self._generate_recommendations(analysis)
        
        # 保存复盘报告到数据库
        await self._save_review_to_db(
            user_id=user_id,
            goal_id=goal_id,
            scenario_title=scenario_title,
            review_report=review_report,
            recommendations=recommendations,
            analysis=analysis,
            db_connection=db_connection
        )
        
        return {
            "workflow": "scenario_review",
            "scenario_title": scenario_title,
            "review_report": review_report,
            "recommendations": recommendations,
            "analysis": analysis,
            "all_scenarios_completed": False  # 由外部检查
        }
    
    async def _analyze_scenario_conversation(
        self,
        conversation_history: List[Dict[str, Any]],
        completed_tasks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """分析场景对话"""
        analysis = {
            "total_messages": len(conversation_history),
            "user_messages": 0,
            "ai_messages": 0,
            "total_words": 0,
            "avg_message_length": 0,
            "vocabulary_diversity": 0,
            "grammar_errors": 0,
            "task_keyword_matches": 0,
            "completion_time_minutes": 0,
            "strengths": [],
            "weaknesses": []
        }
        
        if not conversation_history:
            return analysis
        
        # 统计消息类型
        user_msgs = [m for m in conversation_history if m.get("role") == "user"]
        ai_msgs = [m for m in conversation_history if m.get("role") in ["assistant", "ai"]]
        
        analysis["user_messages"] = len(user_msgs)
        analysis["ai_messages"] = len(ai_msgs)
        
        # 分析用户消息
        if user_msgs:
            all_words = []
            for msg in user_msgs:
                content = msg.get("content", "")
                words = content.split()
                all_words.extend(words)
                analysis["total_words"] += len(words)
            
            analysis["avg_message_length"] = analysis["total_words"] / len(user_msgs)
            analysis["vocabulary_diversity"] = len(set(all_words)) / len(all_words) if all_words else 0
            
            # 检测语法错误 (简化版)
            error_patterns = [
                r"\bi is\b", r"\bhe have\b", r"\bshe have\b", 
                r"\bthey has\b", r"\byesterday I go\b"
            ]
            for msg in user_msgs:
                for pattern in error_patterns:
                    if re.search(pattern, msg.get("content", ""), re.IGNORECASE):
                        analysis["grammar_errors"] += 1
            
            # 检测任务关键词匹配
            for task in completed_tasks:
                task_keywords = task.get("task_description", "").lower().split()
                for msg in user_msgs:
                    content_lower = msg.get("content", "").lower()
                    for keyword in task_keywords:
                        if len(keyword) > 3 and keyword in content_lower:
                            analysis["task_keyword_matches"] += 1
            
            # 判断优点和缺点
            if analysis["vocabulary_diversity"] > 0.6:
                analysis["strengths"].append("Good vocabulary diversity")
            elif analysis["vocabulary_diversity"] < 0.3:
                analysis["weaknesses"].append("Limited vocabulary range")
            
            if analysis["avg_message_length"] > 15:
                analysis["strengths"].append("Detailed responses")
            elif analysis["avg_message_length"] < 5:
                analysis["weaknesses"].append("Responses too short")
            
            if analysis["grammar_errors"] == 0:
                analysis["strengths"].append("Excellent grammar")
            elif analysis["grammar_errors"] > 3:
                analysis["weaknesses"].append("Frequent grammar mistakes")
        
        # 计算完成时间
        if conversation_history:
            first_msg_time = conversation_history[0].get("timestamp")
            last_msg_time = conversation_history[-1].get("timestamp")
            if first_msg_time and last_msg_time:
                try:
                    first_dt = datetime.fromisoformat(first_msg_time.replace('Z', '+00:00'))
                    last_dt = datetime.fromisoformat(last_msg_time.replace('Z', '+00:00'))
                    analysis["completion_time_minutes"] = int((last_dt - first_dt).total_seconds() / 60)
                except:
                    analysis["completion_time_minutes"] = 0
        
        return analysis
    
    def _generate_review_report(
        self,
        scenario_title: str,
        completed_tasks: List[Dict[str, Any]],
        analysis: Dict[str, Any]
    ) -> str:
        """生成复盘报告"""
        # 计算平均分
        task_scores = [task.get("score", 0) for task in completed_tasks]
        avg_score = sum(task_scores) / len(task_scores) if task_scores else 0
        
        # 生成任务分解
        task_breakdown = ""
        for i, task in enumerate(completed_tasks, 1):
            task_name = task.get("task_description", f"Task {i}")
            task_score = task.get("score", 0)
            task_breakdown += f"- **Task {i}**: {task_name[:50]}... (Score: {task_score}/10)\n"
        
        # 生成优点列表
        strengths = "\n".join(f"- {s}" for s in analysis.get("strengths", ["Keep practicing!"]))
        
        # 生成改进点
        improvements = "\n".join(f"- {w}" for w in analysis.get("weaknesses", []))
        if not improvements:
            improvements = "- No major issues detected!"
        
        # 生成成就信息
        if avg_score >= 9:
            achievement = "🌟 Outstanding! You've mastered this scenario!"
        elif avg_score >= 7:
            achievement = "🎯 Great job! Ready for the next challenge!"
        else:
            achievement = "✅ Scenario completed! Consider reviewing and retrying for higher score."
        
        report = self.review_template.format(
            scenario_title=scenario_title,
            completion_time=f"{analysis.get('completion_time_minutes', 0)} minutes",
            total_interactions=analysis.get("user_messages", 0),
            avg_score=f"{avg_score:.1f}",
            task_breakdown=task_breakdown,
            strengths=strengths,
            improvements=improvements,
            recommendations="",  # 单独生成
            achievement_message=achievement
        )
        
        return report
    
    def _generate_recommendations(self, analysis: Dict[str, Any]) -> List[str]:
        """生成针对性建议"""
        recommendations = []
        
        # 基于词汇多样性
        vocab_diversity = analysis.get("vocabulary_diversity", 0)
        if vocab_diversity < 0.4:
            recommendations.append(
                "📚 **Vocabulary**: Try learning 5-10 new words related to this scenario before retrying."
            )
        
        # 基于平均回复长度
        avg_length = analysis.get("avg_message_length", 0)
        if avg_length < 8:
            recommendations.append(
                "💬 **Elaboration**: Try to give longer, more detailed responses. Add 'because', 'for example', or describe feelings."
            )
        
        # 基于语法错误
        grammar_errors = analysis.get("grammar_errors", 0)
        if grammar_errors > 2:
            recommendations.append(
                "📝 **Grammar**: Review past tense forms and subject-verb agreement. Practice with grammar exercises."
            )
        
        # 基于互动次数
        user_messages = analysis.get("user_messages", 0)
        if user_messages < 10:
            recommendations.append(
                "🗣️ **Practice More**: Try to have longer conversations. Ask follow-up questions and share more details."
            )
        
        # 默认建议
        if not recommendations:
            recommendations.append(
                "🎉 **Excellent Work!** Ready to move to the next scenario or try this one again for a higher score!"
            )
        
        return recommendations
    
    async def _save_review_to_db(
        self,
        user_id: str,
        goal_id: int,
        scenario_title: str,
        review_report: str,
        recommendations: List[str],
        analysis: Dict[str, Any],
        db_connection: Any
    ) -> None:
        """保存复盘报告到数据库"""
        # 这里可以创建一个新表 scenario_reviews 来存储复盘报告
        # 或者将报告添加到 goal 的某个字段中
        # 由于数据库结构限制，这里仅记录日志
        print(f"Scenario Review saved for user {user_id}, scenario: {scenario_title}")
        print(f"Report: {review_report[:200]}...")
    
    def check_scenario_completion(
        self,
        all_tasks: List[Dict[str, Any]],
        scenario_title: str
    ) -> Tuple[bool, List[Dict[str, Any]]]:
        """
        检查场景是否完成 (3 个 tasks 全部 completed)
        
        Returns:
            (is_completed, completed_tasks)
        """
        scenario_tasks = [
            task for task in all_tasks
            if task.get("scenario_title") == scenario_title
        ]
        
        completed_tasks = [
            task for task in scenario_tasks
            if task.get("status") == "completed"
        ]
        
        is_completed = len(completed_tasks) >= 3
        
        return is_completed, completed_tasks


# 导入 re 模块
import re

# 导出工作流实例
scenario_review_workflow = ScenarioReviewWorkflow()
