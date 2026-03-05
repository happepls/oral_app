"""
Workflow 2: Proficiency Scoring (熟练度打分)
负责提取最新 3-5 轮对话，动态增减用户口语熟练度
当熟练度增加 3 时，推送当前 mission task 已完成的标记

改进版本：
- 支持动态增减分（话题偏离时减分）
- 检测用户是否围绕任务场景交流
- 提供具体的改进建议
"""
import json
import re
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime


class ProficiencyScoringWorkflow:
    """
    熟练度打分工作流
    - 分析最近 3-5 轮对话
    - 评估 fluency, vocabulary, grammar, task_relevance
    - 动态增减熟练度 (每次 -1 到 +3)
    - 累计 +3 分时推送任务完成标记
    """

    # 场景关键词映射表
    SCENE_KEYWORDS = {
        "coffee": ["coffee", "drink", "order", "menu", "espresso", "latte", "cappuccino", "milk", "sugar", "cup", "barista"],
        "grocery": ["grocery", "shopping", "food", "vegetable", "fruit", "price", "checkout", "cart", "item", "buy"],
        "direction": ["direction", "location", "street", "road", "turn", "left", "right", "straight", "map", "address", "near"],
        "phone": ["phone", "call", "caller", "message", "answer", "hang", "speaking", "hold", "transfer"],
        "restaurant": ["restaurant", "table", "reservation", "menu", "order", "waiter", "bill", "tip", "food", "dish"],
        "greeting": ["hello", "hi", "hey", "good", "morning", "afternoon", "evening", "meet", "friend", "name", "nice"],
        "business": ["meeting", "project", "team", "client", "deadline", "report", "presentation", "schedule", "discuss"],
        "travel": ["travel", "flight", "hotel", "ticket", "airport", "booking", "destination", "trip", "vacation"]
    }

    def __init__(self):
        self.scoring_criteria = {
            "fluency": self._score_fluency,
            "vocabulary": self._score_vocabulary,
            "grammar": self._score_grammar,
            "task_relevance": self._score_task_relevance
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
            包含分数变化、是否完成任务、改进建议等信息
        """
        # 提取最近 3-5 轮对话
        recent_turns = self._extract_recent_turns(conversation_history, limit=5)

        # 分析各维度分数
        scores = await self._calculate_scores(recent_turns, current_task)

        # 计算本轮熟练度增量（可正可负）
        proficiency_delta, feedback = self._calculate_proficiency_delta_with_feedback(scores)

        # 更新累计分数
        result = await self._update_user_proficiency(
            user_id=user_id,
            goal_id=goal_id,
            task_id=current_task.get("id"),
            proficiency_delta=proficiency_delta,
            scores=scores,
            feedback=feedback,
            db_connection=db_connection,
            current_task=current_task
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
            "task_relevance": 5
        }

        if not recent_turns:
            return scores

        # Fluency: 基于回复长度、停顿次数
        scores["fluency"] = self._score_fluency(recent_turns)

        # Vocabulary: 基于词汇多样性
        scores["vocabulary"] = self._score_vocabulary(recent_turns)

        # Grammar: 基于语法错误检测
        scores["grammar"] = self._score_grammar(recent_turns)

        # Task Relevance: 基于任务/场景相关性
        scores["task_relevance"] = self._score_task_relevance(
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

    def _score_task_relevance(
        self,
        turns: List[Dict[str, Any]],
        current_task: Dict[str, Any]
    ) -> int:
        """
        任务相关性评分 (0-10)
        - 包含任务关键词 : +4
        - 包含场景关键词 : +3
        - 偏离话题 : -3
        - 无关内容 : -5
        """
        score = 5  # 基础分

        if not current_task:
            return score

        # 获取任务描述和场景标题
        task_desc = current_task.get("task_description", "").lower()
        scenario_title = current_task.get("scenario_title", "").lower()

        # 提取任务关键词
        task_keywords = set(re.findall(r'\b[a-zA-Z]{3,}\b', task_desc))

        # 提取场景关键词
        scene_keywords = set()
        for key, words in self.SCENE_KEYWORDS.items():
            if key in scenario_title or any(w in scenario_title for w in words):
                scene_keywords.update(words)

        # 获取用户对话内容
        user_content = " ".join(
            t.get("content", "").lower()
            for t in turns
            if t.get("role") == "user"
        )

        if not user_content:
            return score

        # 检查任务关键词匹配
        matched_task_keywords = sum(1 for kw in task_keywords if kw in user_content)

        # 检查场景关键词匹配
        matched_scene_keywords = sum(1 for kw in scene_keywords if kw in user_content)

        # 计算得分
        if matched_task_keywords >= 2:
            score += 4
        elif matched_task_keywords >= 1:
            score += 2

        if matched_scene_keywords >= 2:
            score += 3
        elif matched_scene_keywords >= 1:
            score += 1

        # 检测偏离话题（用户谈论完全不相关的内容）
        off_topic_indicators = [
            "politics", "religion", "sex", "violence", "weapon",
            "coding", "programming", "math", "physics", "chemistry",
            "stock", "crypto", "investment"
        ]
        # 场景相关词（应该避免的）
        task_related = task_keywords | scene_keywords

        # 如果用户说的内容和任务场景完全无关
        if task_related and matched_task_keywords == 0 and matched_scene_keywords == 0:
            # 检查是否有明显的无关内容
            has_off_topic = any(word in user_content for word in off_topic_indicators)
            if has_off_topic:
                score = max(0, score - 5)  # 严重偏离话题
            else:
                score = max(0, score - 3)  # 轻度偏离话题

        return min(10, max(0, score))

    def _calculate_proficiency_delta_with_feedback(
        self,
        scores: Dict[str, int]
    ) -> Tuple[int, str]:
        """
        计算熟练度增量（可正可负）
        返回: (delta, feedback_message)
        """
        avg_score = sum(scores.values()) / len(scores)
        task_relevance = scores.get("task_relevance", 5)

        # 如果话题严重偏离，不加分并给出反馈
        if task_relevance < 3:
            return 0, "请专注于当前任务场景练习"

        if avg_score >= 8:
            return 2, "表现优秀！继续加油！"
        elif avg_score >= 6:
            return 1, "表现良好，继续保持"
        elif avg_score >= 4:
            return 1, "有进步，继续练习"
        else:
            return 0, "需要多加练习，注意语法和词汇"
    
    async def _update_user_proficiency(
        self,
        user_id: str,
        goal_id: int,
        task_id: int,
        proficiency_delta: int,
        scores: Dict[str, int],
        feedback: str,
        db_connection: Any,
        current_task: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        更新用户熟练度，检查是否完成任务

        Returns:
            {
                "proficiency_delta": int,
                "total_proficiency": int,
                "task_completed": bool,
                "scores": Dict,
                "feedback": str,
                "improvement_tips": List[str]
            }
        """
        # 生成改进建议
        improvement_tips = self._generate_improvement_tips(scores, current_task)

        result = {
            "proficiency_delta": proficiency_delta,
            "total_proficiency": 0,
            "task_completed": False,
            "scores": scores,
            "feedback": feedback,
            "improvement_tips": improvement_tips,
            "message": None
        }

        # 如果话题偏离，不加分
        if proficiency_delta == 0:
            result["message"] = feedback
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
            SELECT score, status, interaction_count FROM user_tasks WHERE id = $1
            """,
            task_id
        )

        current_task_score = task_result.get("score", 0) if task_result else 0

        # 获取task信息
        task_info = await db_connection.fetchrow(
            """
            SELECT task_description, scenario_title FROM user_tasks WHERE id = $1
            """,
            task_id
        )

        result["task_score"] = current_task_score
        result["task_title"] = task_info.get("task_description", "Task") if task_info else "Task"
        result["scenario_title"] = task_info.get("scenario_title", "") if task_info else ""

        # 检查是否达到任务完成标准 (累计 10 分且至少 3 轮交互)
        if current_task_score >= 9 and task_result.get("interaction_count", 0) >= 3 and task_result.get("status") != "completed":
            # 生成任务完成的详细反馈
            completion_feedback = self._generate_completion_feedback(scores, improvement_tips)

            # 更新 task 状态为 completed
            await db_connection.execute(
                """
                UPDATE user_tasks
                SET status = 'completed',
                    completed_at = NOW(),
                    feedback = $1
                WHERE id = $2
                """,
                completion_feedback,
                task_id
            )

            result["task_completed"] = True
            result["message"] = completion_feedback
        else:
            result["message"] = f"+{proficiency_delta} 熟练度 | {feedback}"

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

    def _generate_improvement_tips(self, scores: Dict[str, int], current_task: Dict[str, Any] = None) -> List[str]:
        """根据评分生成具体的改进建议，包含句型示例和引导式教学"""
        tips = []

        fluency = scores.get("fluency", 5)
        vocabulary = scores.get("vocabulary", 5)
        grammar = scores.get("grammar", 5)
        task_relevance = scores.get("task_relevance", 5)

        # 获取当前任务信息
        task_desc = current_task.get("task_description", "") if current_task else ""
        scenario_title = current_task.get("scenario_title", "") if current_task else ""

        # 流利度建议
        if fluency < 5:
            tips.append("💬 你可以尝试这样表达：'I think...' 或 'In my opinion...' 来开始你的回答，而不是只说单词")
        elif fluency < 8:
            tips.append("💬 试着用连接词把句子连起来：'I want coffee because it helps me wake up' 比 'coffee, wake up' 更流畅")

        # 词汇量建议
        if vocabulary < 5:
            keywords = self._get_scene_keywords(scenario_title, task_desc)
            if keywords:
                example_sentence = self._generate_example_sentence(keywords[:3], scenario_title)
                tips.append(f"📚 试试用这些词：{', '.join(keywords[:3])}")
                if example_sentence:
                    tips.append(f"   例如：{example_sentence}")
            else:
                tips.append("📚 多使用场景相关的词汇，丰富表达")
        elif vocabulary < 8:
            tips.append("📚 试试更高级的表达：用 'I'd prefer' 代替 'I want'，用 'Could you' 代替 'Can you'")

        # 语法建议
        if grammar < 5:
            tips.append("✏️ 注意主谓一致：'I have' ✓ 而不是 'I has' ✗")
            tips.append("   试试这样说：'I need...' 或 'I would like...'")
        elif grammar < 8:
            tips.append("✏️ 注意句子完整性：确保每个句子都有主语和动词")
            tips.append("   例如：'Can I have a coffee?' 是完整的句子")

        # 任务相关性建议
        if task_relevance < 5:
            keywords = self._get_scene_keywords(scenario_title, task_desc)
            if keywords:
                example_sentence = self._generate_example_sentence(keywords[:3], scenario_title)
                tips.append(f"🎯 专注于当前任务，试试这样说：")
                if example_sentence:
                    tips.append(f"   例如：{example_sentence}")
            else:
                tips.append("🎯 请专注于当前任务场景进行练习")
        elif task_relevance < 8:
            task_suggestion = self._get_task_specific_suggestion(scenario_title, task_desc)
            if task_suggestion:
                tips.append(f"🎯 {task_suggestion}")

        return tips

    def _generate_example_sentence(self, keywords: List[str], scenario: str) -> str:
        """根据关键词生成示例句子"""
        if not keywords or len(keywords) < 2:
            return ""

        # 场景相关的句型模板
        sentence_templates = {
            "grocery": [
                f"Where can I find the {{0}}?",
                f"How much is the {{0}}?",
                f"I'm looking for {{0}} and {{1}}.",
                f"Do you have fresh {{0}}?"
            ],
            "coffee": [
                f"Can I get a {{0}}, please?",
                f"I'd like a {{0}} with {{1}}.",
                f"What size {{0}} do you have?",
                f"Could I have a {{0}} to go?"
            ],
            "restaurant": [
                f"Could we have a table for two?",
                f"I'd like to order the {{0}}.",
                f"Can I see the {{0}}?",
                f"Could I have the bill, please?"
            ],
            "direction": [
                f"Excuse me, where is the {{0}}?",
                f"How do I get to the {{0}}?",
                f"Is the {{0}} far from here?",
                f"Can you show me on the map?"
            ],
            "greeting": [
                f"Hi, my name is...",
                f"Nice to meet you!",
                f"How are you doing today?",
                f"Where are you from?"
            ],
            "shopping": [
                f"How much does this cost?",
                f"Do you have this in a different size?",
                f"Can I try this on?",
                f"Is there a discount on this?"
            ],
            "travel": [
                f"I'd like to book a flight to...",
                f"What time is my flight?",
                f"Where is the gate?",
                f"Can I have a window seat?"
            ],
            "business": [
                f"Let me introduce myself...",
                f"What do you think about...?",
                f"I suggest we...",
                f"Could you clarify...?"
            ]
        }

        # 匹配场景
        scenario_lower = scenario.lower() if scenario else ""
        matched_templates = []
        for scene_key, templates in sentence_templates.items():
            if scene_key in scenario_lower:
                matched_templates = templates
                break

        if not matched_templates:
            # 默认模板
            matched_templates = [
                f"Can I have {{0}}?",
                f"I need {{0}} and {{1}}.",
                f"Where is the {{0}}?"
            ]

        # 随机选择一个模板并填入关键词
        import random
        template = random.choice(matched_templates)
        try:
            sentence = template.format(*keywords)
        except (IndexError, KeyError):
            # 如果关键词不够，使用简单组合
            sentence = f"Can I have {' and '.join(keywords)}?"

        return sentence

    def _get_task_specific_suggestion(self, scenario_title: str, task_desc: str) -> str:
        """根据具体任务提供针对性建议"""
        task_lower = task_desc.lower() if task_desc else ""

        # 任务类型对应的建议
        task_suggestions = {
            "ask for": "🎯 试试用疑问句：'Could you tell me where...?' 或 'Do you know where...?'",
            "request": "🎯 用礼貌的请求句型：'Could I have...?' 或 'I'd like to request...'",
            "order": "🎯 点餐句型：'I'd like to order...' 或 'Can I get...?'",
            "buy": "🎯 购物句型：'How much is...?' 或 'I'm interested in buying...'",
            "describe": "🎯 描述句型：'It's...' 或 'There is/are...'",
            "explain": "🎯 解释句型：'Let me explain...' 或 'The reason is...'",
            "suggest": "🎯 建议句型：'How about...?' 或 'Why don't we...?'",
            "agree": "🎯 同意句型：'I agree with...' 或 'That's a good point'",
            "disagree": "🎯 不同意句型：'I see your point, but...' 或 'I'm not sure about...'",
            "ask about": "🎯 询问句型：'Could you tell me about...?' 或 'What do you think of...?'",
            "handle checkout": "🎯 结账句型：'Can I pay by card?' 或 'Could I have the receipt, please?'",
            "price": "🎯 询问价格：'How much does it cost?' 或 'What's the price of...?'",
            "quantity": "🎯 询问数量：'How many...?' 或 'Do you have more of these?'",
            "location": "🎯 询问位置：'Where can I find...?' 或 'Which aisle is...in?'"
        }

        # 匹配任务关键词
        for task_key, suggestion in task_suggestions.items():
            if task_key in task_lower:
                return suggestion

        # 默认建议
        return "🎯 专注于当前任务，用完整的句子表达你的想法"
    
    def _get_scene_keywords(self, scenario_title: str, task_desc: str) -> List[str]:
        """根据场景和任务返回具体关键词列表"""
        scenario_lower = scenario_title.lower() if scenario_title else ""
        task_lower = task_desc.lower() if task_desc else ""
        
        # 场景关键词映射表（扩展版）
        scene_keywords_map = {
            "grocery": ["vegetable", "fruit", "price", "checkout", "cart", "item", "location", "aisle", "organic", "fresh"],
            "coffee": ["coffee", "drink", "order", "menu", "espresso", "latte", "cappuccino", "milk", "sugar", "size"],
            "restaurant": ["restaurant", "table", "reservation", "menu", "order", "waiter", "bill", "tip", "food", "dish"],
            "direction": ["direction", "location", "street", "road", "turn", "left", "right", "straight", "map", "near"],
            "phone": ["phone", "call", "caller", "message", "answer", "hang", "speaking", "hold", "transfer"],
            "greeting": ["hello", "hi", "hey", "good", "morning", "afternoon", "meet", "friend", "name", "nice"],
            "business": ["meeting", "project", "team", "client", "deadline", "report", "presentation", "schedule"],
            "travel": ["travel", "flight", "hotel", "ticket", "airport", "booking", "destination", "trip"],
            "shopping": ["buy", "price", "cost", "discount", "size", "color", "try", "pay", "receipt"],
            "weather": ["weather", "sunny", "rainy", "cloudy", "temperature", "hot", "cold", "windy"]
        }
        
        # 匹配场景
        matched_keywords = []
        for scene_key, keywords in scene_keywords_map.items():
            if scene_key in scenario_lower or scene_key in task_lower:
                matched_keywords.extend(keywords)
        
        # 如果找到关键词，返回前 8 个
        if matched_keywords:
            return list(dict.fromkeys(matched_keywords))[:8]  # 去重
        
        # 默认返回通用关键词
        return ["practice", "conversation", "English", "speak", "learn"]

    def _generate_completion_feedback(
        self,
        scores: Dict[str, int],
        improvement_tips: List[str]
    ) -> str:
        """生成任务完成时的AI点评"""
        # 根据各维度得分生成针对性点评
        feedback_parts = []

        # 整体评价
        avg_score = sum(scores.values()) / len(scores)
        if avg_score >= 8:
            feedback_parts.append("🎉 恭喜完成本任务！你的表现非常出色！")
        elif avg_score >= 6:
            feedback_parts.append("✅ 任务完成！整体表现不错，还有提升空间。")
        else:
            feedback_parts.append("✅ 任务完成！继续加油！")

        # 具体维度评价
        fluency = scores.get("fluency", 5)
        vocabulary = scores.get("vocabulary", 5)
        grammar = scores.get("grammar", 5)
        task_relevance = scores.get("task_relevance", 5)

        if fluency >= 8:
            feedback_parts.append("流利度很好，表达自然流畅。")
        elif fluency < 5:
            feedback_parts.append("流利度需要提高，建议多练习使用连接词。")

        if vocabulary >= 8:
            feedback_parts.append("词汇丰富，能准确使用场景相关词汇。")
        elif vocabulary < 5:
            feedback_parts.append("词汇量有待增加，建议背诵更多场景词汇。")

        if grammar >= 8:
            feedback_parts.append("语法准确，句子结构完整。")
        elif grammar < 5:
            feedback_parts.append("语法需要加强，注意时态和主谓一致。")

        # 添加改进建议
        if improvement_tips:
            feedback_parts.append("\n💡 建议：")
            for tip in improvement_tips[:3]:  # 最多3条建议
                feedback_parts.append(f"  • {tip}")

        return "\n".join(feedback_parts)


# 导出工作流实例
proficiency_scoring_workflow = ProficiencyScoringWorkflow()
