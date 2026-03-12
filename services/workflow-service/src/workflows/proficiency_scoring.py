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

    def __init__(self):
        self.scoring_criteria = {
            "fluency": self._score_fluency,
            "vocabulary": self._score_vocabulary,
            "grammar": self._score_grammar,
            "task_relevance": self._score_task_relevance
        }
        self._keyword_cache = {}  # 缓存已生成的场景关键词

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
            current_task=current_task,
            conversation_history=conversation_history
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

        # 获取目标语言（从用户上下文或任务信息中获取）
        target_language = current_task.get("target_language", "English")
        if not target_language:
            target_language = "English"

        # Fluency: 基于回复长度、停顿次数
        scores["fluency"] = self._score_fluency(recent_turns)

        # Vocabulary: 基于词汇多样性
        scores["vocabulary"] = self._score_vocabulary(recent_turns)

        # Grammar: 基于语法错误检测（基于目标语言）
        scores["grammar"] = self._score_grammar(recent_turns, target_language)

        # Task Relevance: 基于任务/场景相关性（异步调用）
        scores["task_relevance"] = await self._score_task_relevance(
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

    def _score_grammar(self, turns: List[Dict[str, Any]], target_language: str = "English") -> int:
        """
        语法评分 (0-10) - 基于目标语言评估
        - 时态一致 : +3
        - 主谓一致 : +3
        - 句子结构完整 : +2
        - 无严重语法错误 : +2
        
        Args:
            turns: 对话轮次
            target_language: 目标语言（默认 English）
        """
        score = 5  # 基础分

        user_turns = [t for t in turns if t.get("role") == "user"]
        if not user_turns:
            return score

        # 检测用户输入是否为有效内容
        total_content = " ".join(t.get("content", "") for t in user_turns)

        # 检测无效输入（纯标点、纯语气词、无意义字符）
        invalid_patterns = [
            r'^[啊呀哦嗯哎哟哼哈嘿哇]+$',  # 纯语气词
            r'^[，。！？、；：""''（）()]+$',  # 纯标点
            r'^[\u4e00-\u9fa5]{1,4}$',  # 1-4 个中文字符（太短，无法评估）
        ]

        for pattern in invalid_patterns:
            if re.search(pattern, total_content.strip(), re.IGNORECASE):
                return 3  # 无效输入，给最低分

        # 检测用户输入语言是否与目标语言匹配
        # 简单策略：检查是否包含目标语言的字符特征
        target_language_lower = target_language.lower() if target_language else "english"
        
        # 英文特征：包含英文字母
        has_english = bool(re.search(r'[a-zA-Z]', total_content))
        # 中文特征：包含中文字符
        has_chinese = bool(re.search(r'[\u4e00-\u9fa5]', total_content))
        
        # 如果目标语言是英文，但用户输入全是中文，失去基础分和加分
        if 'english' in target_language_lower and has_chinese and not has_english:
            return 2  # 语言不匹配，给最低分
        
        # 如果目标语言是中文，但用户输入全是英文，失去基础分和加分
        if ('chinese' in target_language_lower or '中文' in target_language) and has_english and not has_chinese:
            return 2  # 语言不匹配，给最低分

        # 检测常见英文语法错误
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

        # 根据错误数量扣分/加分
        if error_count == 0:
            # 没有英文语法错误，但需要检查是否有完整的句子结构
            has_complete_sentence = any(
                len(t.get("content", "").split()) >= 3
                for t in user_turns
            )
            if has_complete_sentence:
                score += 3
            else:
                score += 1  # 句子太短，只加 1 分
        elif error_count == 1:
            score += 2
        elif error_count == 2:
            score += 1

        return min(10, max(0, score))

    async def _score_task_relevance(
        self,
        turns: List[Dict[str, Any]],
        current_task: Dict[str, Any]
    ) -> int:
        """
        任务相关性评分 (0-10) - 支持跨语言匹配
        - 包含任务特定关键词 : +5
        - 包含场景关键词 : +2
        - 偏离话题 : -3
        - 无关内容 : -5
        """
        score = 5  # 基础分

        if not current_task:
            return score

        # 获取任务描述和场景标题
        task_desc = current_task.get("task_description", "")
        scenario_title = current_task.get("scenario_title", "")

        # 使用动态生成的场景关键词（这是主要匹配依据，支持任何语言）
        scene_keywords = self._get_scene_keywords(scenario_title, task_desc)

        # 获取用户对话内容（转为小写用于匹配）
        user_content = " ".join(
            t.get("content", "").lower()
            for t in turns
            if t.get("role") == "user"
        )

        if not user_content:
            return score

        # 1. 从任务描述中提取任务特定关键词（支持任何语言）
        task_keywords_en = set(re.findall(r'\b[a-zA-Z]{3,}\b', task_desc.lower()))
        task_keywords_generic = set(task_desc.lower().split())
        task_keywords = task_keywords_en | task_keywords_generic
        # 过滤掉太短的词（<3 字符）和无意义词（中英文停用词）
        stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
                      'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
                      'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
                      'below', 'between', 'under', 'again', 'further', 'then', 'once', '的',
                      '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个'}
        task_keywords = {kw for kw in task_keywords if len(kw) >= 3 and kw not in stop_words}

        # 2. 如果任务描述是中文，尝试匹配预定义的任务特定关键词
        task_specific_keywords = await self._get_task_specific_keywords(
            task_desc, 
            scenario_title,
            current_task.get("id"),
            None,  # user_id - 暂不需要
            None   # token - 暂不需要
        )
        
        # 3. 检查任务特定关键词匹配（高权重）
        matched_task_specific = sum(1 for kw in task_specific_keywords if kw.lower() in user_content)
        
        # 4. 检查场景关键词匹配（低权重）
        matched_scene_keywords = sum(1 for kw in scene_keywords if kw.lower() in user_content)

        # 检测用户输入语言是否与目标语言匹配
        target_language = current_task.get("target_language", "English").lower()
        input_language = self._detect_input_language(user_content)
        
        # 如果输入语言与目标语言不匹配，判定为话题无关
        if input_language and input_language != target_language:
            # 语言不匹配，直接给最低分并扣分
            return max(0, 5 - 3)  # 基础分 5 分，扣 3 分

        # 检测无效输入（无意义字符、重复字符等）
        # 检测纯符号、重复字符、无意义输入（如"xxxx"、"。。。"、"!!!"等）
        if re.match(r'^[\x00-\x1f\W]{1,10}$', user_content.strip()) or \
           re.match(r'^(.)\1{2,}$', user_content.strip().lower()) or \
           len(user_content.strip()) < 3:
            # 无效输入，直接给最低分
            return 1

        # 计算得分 - 任务特定关键词权重更高
        if matched_task_specific >= 2:
            score += 5  # 高度相关
        elif matched_task_specific >= 1:
            score += 3  # 中等相关
        elif matched_scene_keywords >= 2:
            score += 2  # 低度相关
        elif matched_scene_keywords >= 1:
            score += 1  # 微弱相关
        else:
            # 没有匹配到任何关键词，说明偏离话题
            score = max(0, score - 3)

        # 检测偏离话题（用户谈论完全不相关的内容）
        # 1. 检测明显的无关话题关键词
        off_topic_indicators = [
            "politics", "religion", "sex", "violence", "weapon",
            "coding", "programming", "math", "physics", "chemistry",
            "stock", "crypto", "investment",
            # 食物相关（与问候/爱好场景无关）
            "eat", "food", "dinner", "lunch", "breakfast", "cook", "recipe",
            "吃", "饭", "晚餐", "午餐", "早餐", "做饭", "菜", "面", "面条", "下面"
        ]

        # 2. 检测用户输入是否包含任务特定关键词或场景关键词
        has_task_specific = any(kw.lower() in user_content for kw in task_specific_keywords)
        has_scene_keywords = any(kw.lower() in user_content for kw in scene_keywords)

        # 3. 检测是否有明显的无关内容
        has_off_topic = any(word in user_content for word in off_topic_indicators)

        # 4. 如果用户说的内容和任务场景完全无关，且有明显的无关话题（额外扣分）
        if not has_task_specific and not has_scene_keywords and has_off_topic:
            score = max(0, score - 2)  # 严重偏离话题，再扣 2 分

        return min(10, max(0, score))

    async def _get_task_specific_keywords(self, task_desc: str, scenario_title: str, task_id: int = None, user_id: str = None, token: str = None) -> List[str]:
        """根据任务描述获取任务特定关键词 - 从 user-service API 读取"""
        import os
        import httpx
        
        # 优先从 user-service API 获取关键词
        if task_id and user_id and token:
            try:
                user_service_url = os.getenv("USER_SERVICE_URL", "http://user-service:3000")
                async with httpx.AsyncClient(timeout=5.0) as client:
                    # 调用 user-service 的关键词 API
                    resp = await client.get(
                        f"{user_service_url}/api/users/tasks/{task_id}/keywords",
                        headers={"Authorization": f"Bearer {token}"}
                    )
                    if resp.status_code == 200:
                        keywords_data = resp.json().get('data', {}).get('keywords', [])
                        if keywords_data:
                            return keywords_data
            except Exception as e:
                # API 调用失败，降级到动态生成
                pass
        
        # 动态生成关键词（不再使用预定义映射）
        # 基于任务描述和场景标题提取关键词
        keywords = set()
        
        # 1. 提取英文单词
        en_words = re.findall(r'\b[a-zA-Z]{3,}\b', f"{task_desc} {scenario_title}".lower())
        stop_words = {'the', 'and', 'for', 'with', 'about', 'your', 'you', 'that', 'this', 'have', 'has', 'are', 'was', 'were'}
        for word in en_words:
            if word not in stop_words:
                keywords.add(word)
        
        # 2. 添加通用对话关键词
        common_keywords = ['hello', 'hi', 'thank you', 'please', 'excuse me', 'can you', 'could you', 'i would like']
        for kw in common_keywords:
            keywords.add(kw)
        
        return list(keywords)[:15]

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

        # 如果话题偏离（task_relevance < 3），不加分并给出反馈
        # 话题相关性是核心指标，如果用户说的内容与任务无关，即使语言表达再好也不应该加分
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
        current_task: Dict[str, Any] = None,
        conversation_history: List[Dict[str, Any]] = None
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
        # 生成改进建议（传入对话历史以生成更针对性的建议）
        improvement_tips = self._generate_improvement_tips(
            scores, 
            current_task,
            conversation_history
        )

        result = {
            "proficiency_delta": proficiency_delta,
            "total_proficiency": 0,
            "task_completed": False,
            "scores": scores,
            "feedback": feedback,
            "improvement_tips": improvement_tips,
            "message": None,
            "task_id": task_id,
            "task_score": 0,
            "task_title": "",
            "scenario_title": ""
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

        result["task_id"] = task_id
        result["task_score"] = current_task_score
        result["task_title"] = task_info.get("task_description", "Task") if task_info else "Task"
        result["scenario_title"] = task_info.get("scenario_title", "") if task_info else ""

        # 检查是否达到任务完成标准 (累计 9 分且至少 3 轮交互)
        # 注意：分数范围是 0-10，但 9 分即表示 100% 进度（与前端保持一致）
        # 需要至少 3 次交互，确保用户有足够的练习
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

    def _generate_improvement_tips(
        self,
        scores: Dict[str, int],
        current_task: Dict[str, Any] = None,
        conversation_history: List[Dict[str, Any]] = None
    ) -> List[str]:
        """根据评分、当前任务和对话历史生成灵活的改进建议"""
        tips = []

        fluency = scores.get("fluency", 5)
        vocabulary = scores.get("vocabulary", 5)
        grammar = scores.get("grammar", 5)
        task_relevance = scores.get("task_relevance", 5)

        # 获取当前任务信息
        task_desc = current_task.get("task_description", "") if current_task else ""
        scenario_title = current_task.get("scenario_title", "") if current_task else ""

        # 预加载场景关键词（供后续使用）
        keywords = self._get_scene_keywords(scenario_title, task_desc)

        # 分析用户最近的输入
        user_inputs = self._extract_user_inputs(conversation_history)
        common_errors = self._analyze_common_errors(user_inputs) if user_inputs else {}

        # 流利度建议 - 根据用户实际输入生成
        if fluency < 5:
            if user_inputs and len(user_inputs) > 0:
                short_inputs = [u for u in user_inputs if len(u.split()) <= 3]
                if short_inputs:
                    tips.append(f"💬 你刚才说了 '{short_inputs[0][:30]}...'，试着扩展成完整句子")
                    tips.append(f"   例如：'I would like to...' 或 'Can you tell me where...?'")
                else:
                    tips.append("💬 试着用完整句子表达，不要只说单词")
                    tips.append(f"   例如：'I think...' 或 'In my opinion...'")
            else:
                tips.append("💬 你可以尝试这样表达：'I think...' 或 'In my opinion...' 来开始你的回答")
        # fluency 5-7 分时，只在确实需要改进时才给建议
        elif fluency < 8:
            # 检查用户输入是否已经很好（完整句子 + 有连接词）
            if user_inputs:
                good_sentences = [
                    u for u in user_inputs
                    if len(u.split()) >= 5 and re.search(r'\b(and|but|because|so|however)\b', u.lower())
                ]
                # 如果用户已经能说出好的句子，不给建议或给更高级的建议
                if good_sentences:
                    tips.append("💬 表达很流畅！继续保持")
                else:
                    tips.append("💬 试着用连接词把句子连起来，让表达更流畅")
                    # 动态生成场景相关的示例
                    if keywords and len(keywords) >= 2:
                        example = self._generate_connector_example(keywords[:2], scenario_title)
                        if example:
                            tips.append(f"   例如：'{example}'")
            else:
                tips.append("💬 试着用连接词把句子连起来，让表达更流畅")

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
                elif missing_keywords:
                    example_sentence = self._generate_example_sentence(missing_keywords[:3], scenario_title)
                    tips.append(f"📚 试试用这些词：{', '.join(missing_keywords[:3])}")
                    if example_sentence:
                        tips.append(f"   例如：{example_sentence}")
                else:
                    tips.append("📚 词汇使用不错！试试更多高级表达")
            elif keywords:
                example_sentence = self._generate_example_sentence(keywords[:3], scenario_title)
                tips.append(f"📚 试试用这些词：{', '.join(keywords[:3])}")
                if example_sentence:
                    tips.append(f"   例如：{example_sentence}")
        elif vocabulary < 8:
            # 给出场景相关的高级表达建议，而不是通用建议
            keywords = self._get_scene_keywords(scenario_title, task_desc)
            if keywords:
                # 根据场景给出具体的高级表达建议
                if '问候' in scenario_title.lower() or 'greeting' in scenario_title.lower() or 'greet' in scenario_title.lower():
                    tips.append("📚 试试更自然的问候方式")
                    tips.append(f"   • 用 'How's it going?' 代替 'How are you?'")
                    tips.append(f"   • 用 'Great to meet you!' 代替 'Nice to meet you'")
                    tips.append(f"   • 用 'What brings you here?' 开始对话")
                elif '电话' in scenario_title.lower() or 'phone' in scenario_title.lower() or 'call' in scenario_title.lower():
                    tips.append("📚 试试更专业的电话用语")
                    tips.append(f"   • 用 'May I ask who's calling?' 代替 'Who is this?'")
                    tips.append(f"   • 用 'Hold on, please' 代替 'Wait'")
                    tips.append(f"   • 用 'I'll put you through' 代替 'I'll transfer'")
                elif '咖啡' in scenario_title.lower() or 'coffee' in scenario_title.lower():
                    tips.append("📚 试试更礼貌的点单方式")
                    tips.append(f"   • 用 'Could I get...' 代替 'I want...'")
                    tips.append(f"   • 用 'I'd like...' 代替 'Give me...'")
                    tips.append(f"   • 用 'For here or to go?' 询问用餐方式")
                elif '餐厅' in scenario_title.lower() or 'restaurant' in scenario_title.lower():
                    tips.append("📚 试试更优雅的餐厅用语")
                    tips.append(f"   • 用 'I'd like to order...' 代替 'I want...'")
                    tips.append(f"   • 用 'Could we have...' 代替 'Give us...'")
                    tips.append(f"   • 用 'This is delicious!' 表达赞美")
                elif '购物' in scenario_title.lower() or 'shopping' in scenario_title.lower():
                    tips.append("📚 试试更地道的购物表达")
                    tips.append(f"   • 用 'I'm just looking' 代替 'I don't need help'")
                    tips.append(f"   • 用 'Do you have this in...?' 询问尺寸/颜色")
                    tips.append(f"   • 用 'Is this on sale?' 询问折扣")
                elif '方向' in scenario_title.lower() or 'direction' in scenario_title.lower():
                    tips.append("📚 试试更礼貌的问路方式")
                    tips.append(f"   • 用 'Excuse me, could you tell me...' 开始问路")
                    tips.append(f"   • 用 'Is it far from here?' 询问距离")
                    tips.append(f"   • 用 'Can you show me on the map?' 请求帮助")
                elif '旅行' in scenario_title.lower() or 'travel' in scenario_title.lower():
                    tips.append("📚 试试更流畅的旅行表达")
                    tips.append(f"   • 用 'I'd like to book...' 代替 'I want...'")
                    tips.append(f"   • 用 'What time is my flight?' 询问时间")
                    tips.append(f"   • 用 'Is breakfast included?' 询问服务")
                elif '商务' in scenario_title.lower() or 'business' in scenario_title.lower():
                    tips.append("📚 试试更专业的商务表达")
                    tips.append(f"   • 用 'Let me introduce myself' 开始介绍")
                    tips.append(f"   • 用 'What do you think about...?' 征求意见")
                    tips.append(f"   • 用 'I suggest we...' 提出建议")
                elif '天气' in scenario_title.lower() or 'weather' in scenario_title.lower():
                    tips.append("📚 试试更生动的天气描述")
                    tips.append(f"   • 用 'It's pouring' 代替 'It's raining hard'")
                    tips.append(f"   • 用 'It's a beautiful day' 代替 'It's sunny'")
                    tips.append(f"   • 用 'It's chilly today' 代替 'It's cold'")
                else:
                    # 通用场景 - 给出与场景相关的高级表达
                    tips.append("📚 试试更高级的表达方式")
                    tips.append(f"   • 用 'I'd prefer' 代替 'I want'")
                    tips.append(f"   • 用 'Could you' 代替 'Can you'")
                    tips.append(f"   • 用完整句子表达想法")
            else:
                tips.append("📚 试试更高级的表达方式")
                tips.append(f"   • 用 'I'd prefer' 代替 'I want'")
                tips.append(f"   • 用 'Could you' 代替 'Can you'")

        # 语法建议 - 根据实际错误生成
        if grammar < 5:
            if common_errors:
                if common_errors.get('subject_verb'):
                    tips.append("✏️ 注意主谓一致")
                    tips.append(f"   ❌ 你说：'{common_errors['subject_verb']}'")
                    tips.append(f"   ✓ 应该说：'I have' 或 'He has'")
                if common_errors.get('article'):
                    tips.append("✏️ 记得加冠词 'the' 或 'a'")
                    tips.append(f"   ❌ 你说：'{common_errors['article']}'")
                    # 动态生成场景相关示例
                    if keywords:
                        kw = keywords[0] if keywords else "item"
                        tips.append(f"   ✓ 应该说：'Where is the {kw}?'")
                if common_errors.get('plural'):
                    tips.append("✏️ 注意名词复数")
                    tips.append(f"   ❌ 你说：'{common_errors['plural']}'")
                    # 动态生成场景相关示例
                    if keywords:
                        kw = keywords[0] if keywords else "item"
                        tips.append(f"   ✓ 应该说：'I need {kw}s'")
            else:
                tips.append("✏️ 注意基本语法规则")
                tips.append(f"   • 主谓一致：'I have' ✓ 不是 'I has' ✗")
                # 动态生成场景相关示例
                if keywords and len(keywords) >= 2:
                    tips.append(f"   • 试试这样说：'I need {keywords[0]}...' 或 'I would like {keywords[1]}...'")
                else:
                    tips.append(f"   • 试试这样说：'I need...' 或 'I would like...'")
        elif grammar < 8:
            tips.append("✏️ 注意句子完整性")
            tips.append(f"   确保每个句子都有主语和动词")
            # 动态生成场景相关示例
            if keywords:
                kw = keywords[0] if keywords else "something"
                tips.append(f"   例如：'Can I have {kw}?' 是完整的问句")
            else:
                tips.append(f"   例如：使用完整句子，不要只说单词")

        # 任务相关性建议 - 结合用户实际话题
        if task_relevance < 5:
            # 针对具体任务生成建议，而不是通用场景关键词
            task_examples = self._generate_task_specific_examples(task_desc, scenario_title)
            tips.append(f"🎯 专注于当前任务：{task_desc}")
            tips.append(f"   试试这样说：")
            if task_examples:
                tips.append(f"   例如：{task_examples[0]}")
            else:
                # Fallback to scene keywords
                keywords = self._get_scene_keywords(scenario_title, task_desc)
                if keywords:
                    example_sentence = self._generate_example_sentence(keywords[:3], scenario_title)
                    if example_sentence:
                        tips.append(f"   例如：{example_sentence}")
        elif task_relevance < 8:
            task_suggestion = self._get_task_specific_suggestion(scenario_title, task_desc)
            if task_suggestion:
                tips.append(f"🎯 {task_suggestion}")

        return tips

    def _extract_user_inputs(self, conversation_history: List[Dict[str, Any]]) -> List[str]:
        """从对话历史中提取用户输入"""
        if not conversation_history:
            return []
        
        user_inputs = []
        for msg in conversation_history[-8:]:  # 最近 8 条消息
            role = msg.get('role', '')
            # 处理 user 和 ai 角色
            if role in ['user', 'ai', 'assistant']:
                content = msg.get('content', '') or msg.get('transcript', '')
                if content and len(content) > 0:
                    # 只提取用户输入，不提取 AI 回复
                    if role == 'user':
                        user_inputs.append(content)
        return user_inputs

    def _analyze_common_errors(self, user_inputs: List[str]) -> Dict[str, str]:
        """分析用户输入中的常见错误"""
        errors = {}
        
        for text in user_inputs:
            text_lower = text.lower()
            
            # 检查主谓一致错误
            if 'i wants' in text_lower or 'he want' in text_lower or 'she want' in text_lower:
                errors['subject_verb'] = text[:40]
            
            # 检查冠词缺失
            if re.search(r'\b(where|what|can)\s+(is|do)\s+(you|i|we)\b', text_lower) and \
               not re.search(r'\bthe\b', text_lower):
                if 'where is' in text_lower and 'the' not in text_lower:
                    errors['article'] = text[:40]
            
            # 检查名词单复数
            if re.search(r'\b(an|one|two|some)\s+\w+\b', text_lower):
                if re.search(r'\btwo\s+\w+\b', text_lower) and not text_lower.endswith('s'):
                    errors['plural'] = text[:40]
            
            # 检查动词形式
            if re.search(r'\bneed\s+buy\b', text_lower):
                errors['verb_form'] = text[:40]
        
        return errors

    def _generate_example_sentence(self, keywords: List[str], scenario: str) -> str:
        """根据关键词生成示例句子"""
        if not keywords or len(keywords) < 2:
            return ""

        # 场景相关的句型模板（支持中英文场景名）
        sentence_templates = {
            # 中文场景名
            "问候": ["Hi, my name is...", "Nice to meet you!", "How are you doing today?", "Where are you from?", "Let me introduce myself."],
            "日常问候": ["Hi, my name is...", "Nice to meet you!", "How are you doing today?", "Where are you from?", "Let me introduce myself."],
            "电话": ["This is...", "May I ask who's calling?", "Hold on, please.", "Can I take a message?", "I'll put you through."],
            "通话": ["This is...", "May I ask who's calling?", "Hold on, please.", "Can I take a message?", "I'll put you through."],
            "咖啡": ["Can I get a {{0}}, please?", "I'd like a {{0}} with {{1}}.", "What size {{0}} do you have?", "Could I have a {{0}} to go?"],
            "餐厅": ["Could we have a table for two?", "I'd like to order the {{0}}.", "Can I see the menu?", "Could I have the bill, please?"],
            "购物": ["How much does this cost?", "Do you have this in a different size?", "Can I try this on?", "Is there a discount on this?"],
            "方向": ["Excuse me, where is the {{0}}?", "How do I get to the {{0}}?", "Is the {{0}} far from here?", "Can you show me on the map?"],
            "旅行": ["I'd like to book a flight to...", "What time is my flight?", "Where is the gate?", "Can I have a window seat?"],
            "商务": ["Let me introduce myself...", "What do you think about...?", "I suggest we...", "Could you clarify...?"],
            "天气": ["It's a beautiful day today.", "Looks like it might rain.", "How's the weather in your city?", "It's very hot/cold today."],
            # 英文场景名
            "greeting": ["Hi, my name is...", "Nice to meet you!", "How are you doing today?", "Where are you from?", "Let me introduce myself."],
            "phone": ["This is...", "May I ask who's calling?", "Hold on, please.", "Can I take a message?", "I'll put you through."],
            "coffee": ["Can I get a {{0}}, please?", "I'd like a {{0}} with {{1}}.", "What size {{0}} do you have?", "Could I have a {{0}} to go?"],
            "restaurant": ["Could we have a table for two?", "I'd like to order the {{0}}.", "Can I see the {{0}}?", "Could I have the bill, please?"],
            "shopping": ["How much does this cost?", "Do you have this in a different size?", "Can I try this on?", "Is there a discount on this?"],
            "direction": ["Excuse me, where is the {{0}}?", "How do I get to the {{0}}?", "Is the {{0}} far from here?", "Can you show me on the map?"],
            "travel": ["I'd like to book a flight to...", "What time is my flight?", "Where is the gate?", "Can I have a window seat?"],
            "business": ["Let me introduce myself...", "What do you think about...?", "I suggest we...", "Could you clarify...?"],
            "weather": ["It's a beautiful day today.", "Looks like it might rain.", "How's the weather in your city?", "It's very hot/cold today."]
        }

        # 匹配场景 - 支持中英文
        scenario_lower = scenario.lower() if scenario else ""
        matched_templates = []
        
        for scene_key, templates in sentence_templates.items():
            if scene_key in scenario_lower:
                matched_templates = templates
                break
        
        # 如果场景名包含"问候"或"greeting"，使用问候模板
        if not matched_templates:
            if '问候' in scenario_lower or 'greet' in scenario_lower:
                matched_templates = sentence_templates.get('问候', [])
            elif '电话' in scenario_lower or 'phone' in scenario_lower or 'call' in scenario_lower:
                matched_templates = sentence_templates.get('电话', [])
            elif '咖啡' in scenario_lower or 'coffee' in scenario_lower:
                matched_templates = sentence_templates.get('咖啡', [])
            elif '餐厅' in scenario_lower or 'restaurant' in scenario_lower:
                matched_templates = sentence_templates.get('餐厅', [])
            elif '购物' in scenario_lower or 'shopping' in scenario_lower or 'buy' in scenario_lower:
                matched_templates = sentence_templates.get('购物', [])
            elif '方向' in scenario_lower or 'direction' in scenario_lower or 'where' in scenario_lower:
                matched_templates = sentence_templates.get('方向', [])
            elif '旅行' in scenario_lower or 'travel' in scenario_lower:
                matched_templates = sentence_templates.get('旅行', [])
            elif '商务' in scenario_lower or 'business' in scenario_lower:
                matched_templates = sentence_templates.get('商务', [])
            elif '天气' in scenario_lower or 'weather' in scenario_lower:
                matched_templates = sentence_templates.get('天气', [])

        if not matched_templates:
            # 默认模板 - 使用通用句型，避免"Where is"这种不合适的句型
            matched_templates = [
                f"Can you tell me about {{0}}?",
                f"I'd like to know more about {{0}} and {{1}}.",
                f"Let's talk about {{0}}.",
                f"What do you think of {{0}}?"
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

    def _generate_task_specific_examples(self, task_desc: str, scenario_title: str) -> List[str]:
        """根据具体任务描述生成针对性例句"""
        task_lower = task_desc.lower() if task_desc else ""
        scenario_lower = scenario_title.lower() if scenario_title else ""
        
        # 任务相关的例句模板（支持中英文任务描述）
        task_examples_map = {
            # 中文任务 - 日常问候场景
            "奥特曼": ["I like Ultraman because he is very strong.", "My favorite hero is Ultraman.", "I enjoy watching Ultraman shows.", "Ultraman is my childhood hero."],
            "喜欢的": ["I like...", "My favorite... is...", "I enjoy...", "I'm interested in..."],
            "爱好": ["My hobby is...", "I like to...", "I enjoy...", "In my free time, I..."],
            "工作": ["I work as a...", "My job is...", "I'm responsible for...", "I work in..."],
            "家乡": ["I'm from...", "My hometown is...", "I was born in...", "I grew up in..."],
            "家庭": ["I have a...", "There are... people in my family.", "My family is...", "I live with..."],
            "周末": ["On weekends, I...", "I usually... on Saturday.", "My weekend plan is...", "I like to... during the weekend."],
            "朋友": ["My friend is...", "I like to... with my friends.", "We often...", "My best friend is..."],
            "城市": ["My city is...", "I live in...", "The weather in my city is...", "My city is famous for..."],
            # 英文任务
            "hobby": ["My hobby is...", "I like to...", "I enjoy...", "In my free time, I..."],
            "favorite": ["My favorite... is...", "I like... the most.", "I prefer...", "I'm fond of..."],
            "work": ["I work as a...", "My job is...", "I'm responsible for...", "I work in..."],
            "hometown": ["I'm from...", "My hometown is...", "I was born in...", "I grew up in..."],
            "family": ["I have a...", "There are... people in my family.", "My family is...", "I live with..."],
            "weekend": ["On weekends, I...", "I usually... on Saturday.", "My weekend plan is...", "I like to... during the weekend."],
            "friend": ["My friend is...", "I like to... with my friends.", "We often...", "My best friend is..."],
            "city": ["My city is...", "I live in...", "The weather in my city is...", "My city is famous for..."],
        }
        
        # 匹配任务关键词
        matched_examples = []
        for task_key, examples in task_examples_map.items():
            if task_key in task_lower or task_key in scenario_lower:
                matched_examples.extend(examples)
        
        # 返回匹配的例句，如果没有则返回通用例句
        if matched_examples:
            import random
            return random.sample(matched_examples, min(3, len(matched_examples)))
        
        # 默认返回通用例句
        return ["Can you tell me more about this?", "I'd like to know your opinion.", "What do you think about this?"]

    def _generate_connector_example(self, keywords: List[str], scenario: str) -> str:
        """根据关键词动态生成连接词示例句子 - 支持中英文场景名"""
        if not keywords or len(keywords) < 2:
            return ""

        kw1, kw2 = keywords[0], keywords[1]

        # 根据场景生成连接词示例
        scenario_lower = scenario.lower() if scenario else ""

        # 问候场景（支持中英文）- 使用更实用的模板
        if '问候' in scenario_lower or 'greeting' in scenario_lower or 'hello' in scenario_lower or 'meet' in scenario_lower:
            templates = [
                f"Hello! I'm interested in {kw1}, and I'd love to know about {kw2}.",
                f"Hi there! Let's talk about {kw1}, and then we can discuss {kw2}.",
                f"Nice to meet you! I enjoy {kw1}, and how about {kw2}?",
                f"Good morning! What do you think of {kw1}, and have you been to {kw2}?",
            ]
            import random
            return random.choice(templates)

        # 电话场景（支持中英文）
        if '电话' in scenario_lower or 'phone' in scenario_lower or 'call' in scenario_lower:
            return f"This is {kw1}, and I'd like to {kw2}."

        # 咖啡/餐厅场景（支持中英文）
        if '咖啡' in scenario_lower or '餐厅' in scenario_lower or 'coffee' in scenario_lower or 'restaurant' in scenario_lower or 'order' in scenario_lower:
            return f"I'd like {kw1}, and could I also have {kw2}?"

        # 购物场景（支持中英文）
        if '购物' in scenario_lower or 'shopping' in scenario_lower or 'buy' in scenario_lower or 'price' in scenario_lower:
            return f"How much is {kw1}, and do you have {kw2}?"

        # 方向场景（支持中英文）
        if '方向' in scenario_lower or 'direction' in scenario_lower or 'where' in scenario_lower:
            return f"Where is {kw1}, and how do I get to {kw2}?"

        # 旅行场景（支持中英文）
        if '旅行' in scenario_lower or 'travel' in scenario_lower or 'flight' in scenario_lower or 'hotel' in scenario_lower:
            return f"I'd like to {kw1}, and I need {kw2}."

        # 商务场景（支持中英文）
        if '商务' in scenario_lower or 'business' in scenario_lower or 'meeting' in scenario_lower:
            return f"Let's discuss {kw1}, and then we can move on to {kw2}."

        # 天气场景（支持中英文）
        if '天气' in scenario_lower or 'weather' in scenario_lower:
            return f"The weather is {kw1}, and I hope it stays {kw2}."

        # 默认：使用通用模板
        return f"Let's talk about {kw1}, and I'd also like to mention {kw2}."

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
        """根据场景和任务动态生成关键词列表 - 使用 AI 生成 + 智能 fallback"""
        scenario_lower = scenario_title.lower() if scenario_title else ""
        task_lower = task_desc.lower() if task_desc else ""
        combined = f"{scenario_lower} {task_lower}"

        # 创建缓存键
        cache_key = f"{scenario_lower}:{task_lower}"

        # 检查缓存
        if cache_key in self._keyword_cache:
            return self._keyword_cache[cache_key]

        # 场景关键词映射（作为 AI 调用失败的 fallback）- 支持中文场景名匹配
        scene_keywords_map = {
            # 中文场景名
            "问候": ["your hometown", "your job", "your hobbies", "your family", "your studies", "your interests", "your weekend", "your plans", "your friends", "your city"],
            "日常问候": ["your hometown", "your job", "your hobbies", "your family", "your studies", "your interests", "your weekend", "your plans", "your friends", "your city"],
            "电话": ["phone", "call", "calling", "speaking", "hold on", "one moment", "may I ask", "who's calling", "call back", "leave a message"],
            "通话": ["phone", "call", "calling", "speaking", "hold on", "one moment", "may I ask", "who's calling", "call back", "leave a message"],
            "咖啡": ["coffee", "latte", "cappuccino", "espresso", "order", "menu", "size", "milk", "sugar", "hot", "ice", "to go"],
            "餐厅": ["restaurant", "table", "reservation", "menu", "order", "bill", "tip", "food", "dish", "delicious", "hungry"],
            "购物": ["shopping", "buy", "price", "cost", "discount", "size", "color", "try on", "pay", "receipt"],
            "方向": ["direction", "where is", "how to get", "street", "road", "turn left", "turn right", "straight", "map", "near"],
            "旅行": ["travel", "flight", "hotel", "ticket", "airport", "booking", "destination", "trip", "passport", "visa"],
            "商务": ["business", "meeting", "project", "team", "client", "deadline", "report", "presentation", "schedule"],
            "天气": ["weather", "sunny", "rainy", "cloudy", "temperature", "hot", "cold", "windy", "forecast"],
            # 英文场景名
            "greeting": ["your hometown", "your job", "your hobbies", "your family", "your studies", "your interests", "your weekend", "your plans", "your friends", "your city"],
            "phone": ["phone", "call", "calling", "speaking", "hold on", "one moment", "may I ask", "who's calling", "call back", "leave a message"],
            "coffee": ["coffee", "latte", "cappuccino", "espresso", "order", "menu", "size", "milk", "sugar", "hot", "ice", "to go"],
            "restaurant": ["restaurant", "table", "reservation", "menu", "order", "bill", "tip", "food", "dish", "delicious", "hungry"],
            "shopping": ["shopping", "buy", "price", "cost", "discount", "size", "color", "try on", "pay", "receipt"],
            "direction": ["direction", "where is", "how to get", "street", "road", "turn left", "turn right", "straight", "map", "near"],
            "travel": ["travel", "flight", "hotel", "ticket", "airport", "booking", "destination", "trip", "passport", "visa"],
            "business": ["business", "meeting", "project", "team", "client", "deadline", "report", "presentation", "schedule"],
            "weather": ["weather", "sunny", "rainy", "cloudy", "temperature", "hot", "cold", "windy", "forecast"],
        }

        # 尝试匹配场景关键词 - 支持部分匹配
        matched_keywords = []
        for scene_key, keywords in scene_keywords_map.items():
            if scene_key in combined or combined in scene_key:
                matched_keywords.extend(keywords)
        
        # 如果匹配到关键词，返回去重后的结果
        if matched_keywords:
            unique_keywords = list(dict.fromkeys(matched_keywords))
            self._keyword_cache[cache_key] = unique_keywords[:15]
            return unique_keywords[:15]

        # 尝试 AI 动态生成
        try:
            import httpx
            import os

            prompt = f"""You are an English language teaching expert. For the following speaking practice scenario and task, generate 10-15 essential English keywords/phrases.

Scenario: {scenario_title or "General Conversation"}
Task: {task_desc or "Practice speaking English"}

Return ONLY a JSON array: ["keyword1", "keyword2", ...]"""

            api_key = os.getenv("QWEN3_OMNI_API_KEY")
            if api_key:
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                payload = {
                    "model": "qwen-turbo",
                    "input": {"messages": [{"role": "user", "content": prompt}]}
                }

                response = httpx.post(
                    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
                    headers=headers, json=payload, timeout=30.0
                )

                if response.status_code == 200:
                    result = response.json()
                    content = result.get("output", {}).get("choices", [{}])[0].get("message", {}).get("content", "[]")
                    import json
                    json_match = re.search(r'\[.*\]', content, re.DOTALL)
                    if json_match:
                        keywords = json.loads(json_match.group())
                        keywords = [kw.strip().lower() for kw in keywords if isinstance(kw, str) and len(kw) > 1]
                        if keywords:
                            self._keyword_cache[cache_key] = keywords[:15]
                            return keywords[:15]
        except Exception as e:
            pass  # AI 调用失败，使用 fallback

        # Fallback: 从文本提取关键词
        return self._extract_keywords_from_text(f"{scenario_title} {task_desc}")
    
    def _extract_keywords_from_text(self, text: str) -> List[str]:
        """从文本中提取关键词作为后备方案"""
        if not text:
            return ["practice", "conversation", "English", "speak", "learn", "express", "communicate"]
        
        text_lower = text.lower()
        
        # 提取实词（名词、动词、形容词）
        words = re.findall(r'\b[a-zA-Z]{3,}\b', text_lower)
        stop_words = {
            'the', 'and', 'for', 'with', 'your', 'that', 'this', 'from', 'have', 'been',
            'would', 'there', 'about', 'which', 'their', 'could', 'where', 'when', 'what',
            'how', 'are', 'you', 'doing', 'fine', 'thanks', 'hello', 'hi', 'hey', 'good',
            'practice', 'scenario', 'task', 'current', 'complete', 'finish'
        }
        keywords = [w for w in words if w not in stop_words]
        
        # 去重并保持顺序
        unique_keywords = list(dict.fromkeys(keywords))
        return unique_keywords[:10] if unique_keywords else ["practice", "conversation", "English", "speak", "learn"]

    def _detect_input_language(self, text: str) -> Optional[str]:
        """
        检测用户输入的主要语言
        返回：'english', 'chinese', 'spanish', 'french', 'german', 'japanese', 'korean' 或 None（无法检测）
        """
        if not text or len(text.strip()) < 3:
            return None
        
        text_lower = text.lower()
        
        # 检测中文字符
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        if chinese_chars > len(text) * 0.3:  # 30% 以上是中文
            return 'chinese'
        
        # 检测日文字符
        japanese_chars = len(re.findall(r'[\u3040-\u309f\u30a0-\u30ff]', text))
        if japanese_chars > len(text) * 0.2:  # 20% 以上是日文
            return 'japanese'
        
        # 检测韩文字符
        korean_chars = len(re.findall(r'[\uac00-\ud7af]', text))
        if korean_chars > len(text) * 0.2:  # 20% 以上是韩文
            return 'korean'
        
        # 检测西文字符（英文、法文、德文、西班牙文等使用拉丁字母）
        latin_chars = len(re.findall(r'[a-zA-Z]', text))
        if latin_chars > len(text) * 0.5:  # 50% 以上是拉丁字母
            # 尝试区分具体语言
            if re.search(r'\b(el|la|los|las|de|que|en|es|por|para|con)\b', text_lower):
                return 'spanish'
            elif re.search(r'\b(le|la|les|de|et|est|dans|pour|avec)\b', text_lower):
                return 'french'
            elif re.search(r'\b(der|die|das|und|ist|ein|mit)\b', text_lower):
                return 'german'
            else:
                return 'english'
        
        # 无法确定具体语言
        return None

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
