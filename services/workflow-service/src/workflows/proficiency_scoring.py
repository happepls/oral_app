"""
Workflow 2: Proficiency Scoring (熟练度打分)
负责提取最新 3-5 轮对话，动态增减用户口语熟练度
当熟练度增加 3 时，推送当前 mission task 已完成的标记
"""
import json
import re
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime


class ProficiencyScoringWorkflow:
    """
    熟练度打分工作流
    - 分析最近 3-5 轮对话
    - 评估 fluency, vocabulary, grammar, pronunciation
    - 动态增减熟练度 (每次 +1 到 +3)
    - 累计 +3 分时推送任务完成标记
    """
    
    def __init__(self):
        self.scoring_criteria = {
            "fluency": self._score_fluency,
            "vocabulary": self._score_vocabulary,
            "grammar": self._score_grammar,
            "task_completion": self._score_task_completion
        }
    
    async def analyze_conversation_and_update_score(
        self,
        conversation_history: List[Dict[str, Any]],
        user_id: str,
        goal_id: int,
        current_task: Dict[str, Any],
        db_connection: Any
    ) -> Dict[str, Any]:
        """
        分析对话并更新熟练度
        
        Args:
            conversation_history: 对话历史 (包含 audioUrl, transcript 等)
            user_id: 用户 ID
            goal_id: 目标 ID
            current_task: 当前任务信息
            db_connection: 数据库连接
            
        Returns:
            包含分数变化、是否完成任务等信息
        """
        # 提取最近 3-5 轮对话
        recent_turns = self._extract_recent_turns(conversation_history, limit=5)
        
        # 分析各维度分数
        scores = await self._calculate_scores(recent_turns, current_task)
        
        # 计算本轮熟练度增加
        proficiency_delta = self._calculate_proficiency_delta(scores)
        
        # 更新累计分数
        result = await self._update_user_proficiency(
            user_id=user_id,
            goal_id=goal_id,
            task_id=current_task.get("id"),
            proficiency_delta=proficiency_delta,
            scores=scores,
            db_connection=db_connection
        )
        
        return result
    
    def _extract_recent_turns(
        self,
        conversation_history: List[Dict[str, Any]],
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """提取最近 3-5 轮对话"""
        # 过滤出 user 和 assistant 的对话
        turns = [
            msg for msg in conversation_history
            if msg.get("role") in ["user", "assistant", "user", "ai"]
        ]
        
        # 取最近 limit 轮
        return turns[-limit:] if len(turns) > limit else turns
    
    async def _calculate_scores(
        self,
        recent_turns: List[Dict[str, Any]],
        current_task: Dict[str, Any]
    ) -> Dict[str, int]:
        """计算各维度分数 (0-10)"""
        scores = {
            "fluency": 5,  # 默认中等
            "vocabulary": 5,
            "grammar": 5,
            "task_completion": 5
        }
        
        if not recent_turns:
            return scores
        
        # Fluency: 基于回复长度、停顿次数
        scores["fluency"] = self._score_fluency(recent_turns)
        
        # Vocabulary: 基于词汇多样性
        scores["vocabulary"] = self._score_vocabulary(recent_turns)
        
        # Grammar: 基于语法错误检测
        scores["grammar"] = self._score_grammar(recent_turns)
        
        # Task Completion: 基于任务关键词匹配
        scores["task_completion"] = self._score_task_completion(
            recent_turns, 
            current_task
        )
        
        return scores
    
    def _score_fluency(self, turns: List[Dict[str, Any]]) -> int:
        """
        流利度评分 (0-10)
        - 回复长度适中 (10-50 词) : +2
        - 无长时间停顿 : +2
        - 连续完整句子 : +2
        - 自然连接词使用 : +2
        - 无重复/自我纠正 : +2
        """
        score = 5  # 基础分
        
        user_turns = [t for t in turns if t.get("role") == "user"]
        if not user_turns:
            return score
        
        # 分析回复长度
        avg_length = sum(len(t.get("content", "").split()) for t in user_turns) / len(user_turns)
        if 10 <= avg_length <= 50:
            score += 2
        elif avg_length > 5:
            score += 1
        
        # 分析句子完整性 (简单检查是否有主谓结构)
        complete_sentences = sum(
            1 for t in user_turns 
            if re.search(r'\b(I|You|We|They|He|She|It)\s+\w+', t.get("content", ""))
        )
        if complete_sentences >= len(user_turns) * 0.7:
            score += 2
        
        # 分析连接词使用
        connectors = ["and", "but", "because", "so", "however", "therefore", "then"]
        has_connectors = any(
            any(c in t.get("content", "").lower() for c in connectors)
            for t in user_turns
        )
        if has_connectors:
            score += 1
        
        return min(10, max(0, score))
    
    def _score_vocabulary(self, turns: List[Dict[str, Any]]) -> int:
        """
        词汇评分 (0-10)
        - 词汇多样性 : +3
        - 场景相关词汇 : +3
        - 高级词汇使用 : +2
        - 无重复用词 : +2
        """
        score = 5  # 基础分
        
        user_turns = [t for t in turns if t.get("role") == "user"]
        if not user_turns:
            return score
        
        # 提取所有单词
        all_words = []
        for t in user_turns:
            words = re.findall(r'\b[a-zA-Z]+\b', t.get("content", "").lower())
            all_words.extend(words)
        
        if not all_words:
            return score
        
        # 词汇多样性 (unique words / total words)
        unique_ratio = len(set(all_words)) / len(all_words)
        if unique_ratio > 0.7:
            score += 3
        elif unique_ratio > 0.5:
            score += 2
        elif unique_ratio > 0.3:
            score += 1
        
        # 检测高级词汇 (简单列表)
        advanced_words = [
            "excellent", "wonderful", "fantastic", "appreciate", "consider",
            "however", "therefore", "moreover", "furthermore", "consequently"
        ]
        advanced_count = sum(1 for w in all_words if w in advanced_words)
        if advanced_count >= 2:
            score += 2
        elif advanced_count >= 1:
            score += 1
        
        return min(10, max(0, score))
    
    def _score_grammar(self, turns: List[Dict[str, Any]]) -> int:
        """
        语法评分 (0-10)
        - 时态一致 : +3
        - 主谓一致 : +3
        - 句子结构完整 : +2
        - 无严重语法错误 : +2
        """
        score = 5  # 基础分
        
        user_turns = [t for t in turns if t.get("role") == "user"]
        if not user_turns:
            return score
        
        # 检测常见语法错误 (简化版)
        error_patterns = [
            (r"\bi is\b", "subject-verb agreement"),
            (r"\bhe have\b", "subject-verb agreement"),
            (r"\bshe have\b", "subject-verb agreement"),
            (r"\bthey has\b", "subject-verb agreement"),
            (r"\byesterday I go\b", "past tense"),
            (r"\blast week I go\b", "past tense"),
        ]
        
        error_count = 0
        for turn in user_turns:
            content = turn.get("content", "")
            for pattern, error_type in error_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    error_count += 1
        
        # 根据错误数量扣分
        if error_count == 0:
            score += 3
        elif error_count == 1:
            score += 2
        elif error_count == 2:
            score += 1
        
        return min(10, max(0, score))
    
    def _score_task_completion(
        self,
        turns: List[Dict[str, Any]],
        current_task: Dict[str, Any]
    ) -> int:
        """
        任务完成度评分 (0-10)
        - 包含任务关键词 : +4
        - 完成对话目标 : +3
        - 适当回应 : +3
        """
        score = 5  # 基础分
        
        if not current_task:
            return score
        
        task_description = current_task.get("task_description", "").lower()
        
        # 提取任务关键词
        task_keywords = re.findall(r'\b[a-zA-Z]{3,}\b', task_description)
        
        # 检查用户对话中是否包含关键词
        user_content = " ".join(
            t.get("content", "").lower() 
            for t in turns 
            if t.get("role") == "user"
        )
        
        matched_keywords = sum(
            1 for keyword in task_keywords 
            if keyword in user_content
        )
        
        if matched_keywords >= 3:
            score += 4
        elif matched_keywords >= 1:
            score += 2
        
        return min(10, max(0, score))
    
    def _calculate_proficiency_delta(self, scores: Dict[str, int]) -> int:
        """
        计算熟练度增量
        基于各维度平均分，每次 +1 到 +3
        """
        avg_score = sum(scores.values()) / len(scores)
        
        if avg_score >= 8:
            return 3  # 优秀，+3 分
        elif avg_score >= 6:
            return 2  # 良好，+2 分
        elif avg_score >= 4:
            return 1  # 一般，+1 分
        else:
            return 0  # 需要改进，不加分
    
    async def _update_user_proficiency(
        self,
        user_id: str,
        goal_id: int,
        task_id: int,
        proficiency_delta: int,
        scores: Dict[str, int],
        db_connection: Any
    ) -> Dict[str, Any]:
        """
        更新用户熟练度，检查是否完成任务
        
        Returns:
            {
                "proficiency_delta": int,
                "total_proficiency": int,
                "task_completed": bool,
                "scores": Dict
            }
        """
        result = {
            "proficiency_delta": proficiency_delta,
            "total_proficiency": 0,
            "task_completed": False,
            "scores": scores,
            "message": None
        }
        
        if proficiency_delta == 0:
            result["message"] = "Keep practicing! Focus on fluency and vocabulary."
            return result
        
        # 更新 task 的 score 和 interaction_count
        await db_connection.execute(
            """
            UPDATE user_tasks 
            SET score = score + $1,
                interaction_count = interaction_count + 1,
                updated_at = NOW()
            WHERE id = $2 AND user_id = $3
            """,
            proficiency_delta, task_id, user_id
        )
        
        # 获取当前 task 累计分数
        task_result = await db_connection.fetchrow(
            """
            SELECT score, status FROM user_tasks WHERE id = $1
            """,
            task_id
        )
        
        current_task_score = task_result.get("score", 0) if task_result else 0
        
        # 检查是否达到任务完成标准 (累计 3 分)
        if current_task_score >= 3 and task_result.get("status") != "completed":
            # 更新 task 状态为 completed
            await db_connection.execute(
                """
                UPDATE user_tasks 
                SET status = 'completed',
                    completed_at = NOW(),
                    feedback = $1
                WHERE id = $2
                """,
                f"Great job! Completed with {current_task_score} points.",
                task_id
            )
            
            result["task_completed"] = True
            result["message"] = f"🎉 Task completed! Score: {current_task_score} points"
        else:
            result["message"] = f"+{proficiency_delta} proficiency points. Keep going!"
        
        # 获取 goal 的当前熟练度
        goal_result = await db_connection.fetchrow(
            """
            SELECT current_proficiency FROM user_goals WHERE id = $1
            """,
            goal_id
        )
        
        current_proficiency = goal_result.get("current_proficiency", 0) if goal_result else 0
        new_proficiency = current_proficiency + proficiency_delta
        
        # 更新 goal 的熟练度
        await db_connection.execute(
            """
            UPDATE user_goals 
            SET current_proficiency = $1,
                updated_at = NOW()
            WHERE id = $2
            """,
            new_proficiency, goal_id
        )
        
        result["total_proficiency"] = new_proficiency
        
        return result


# 导出工作流实例
proficiency_scoring_workflow = ProficiencyScoringWorkflow()
