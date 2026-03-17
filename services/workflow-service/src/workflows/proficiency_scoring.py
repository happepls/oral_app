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
        # 获取用户的母语
        user = await db_connection.fetchrow(
            "SELECT native_language FROM users WHERE id = $1",
            user_id
        )
        native_language = user["native_language"] if user and user["native_language"] else "English"

        # 提取最近 3-5 轮对话
        recent_turns = self._extract_recent_turns(conversation_history, limit=5)

        # 分析各维度分数
        scores = await self._calculate_scores(recent_turns, current_task)

        # 计算本轮熟练度增量（可正可负）
        proficiency_delta, feedback = self._calculate_proficiency_delta_with_feedback(scores)

        # 更新累计分数（传递 native_language 用于生成母语反馈）
        result = await self._update_user_proficiency(
            user_id=user_id,
            goal_id=goal_id,
            task_id=current_task.get("id"),
            proficiency_delta=proficiency_delta,
            scores=scores,
            feedback=feedback,
            db_connection=db_connection,
            current_task=current_task,
            conversation_history=conversation_history,
            native_language=native_language
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
    ) -> Dict[str, Any]:
        """计算各维度分数 (0-10)
        
        Returns:
            {
                "fluency": int,
                "vocabulary": int,
                "grammar": int,
                "task_relevance": int,
                "suggested_keywords": List[str],  # 建议的关键词（当task_relevance低时）
                "matched_keywords": List[str]  # 已匹配的关键词
            }
        """
        scores = {
            "fluency": 5,  # 默认中等
            "vocabulary": 5,
            "grammar": 5,
            "task_relevance": 5,
            "suggested_keywords": [],
            "matched_keywords": []
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
        task_relevance_result = await self._score_task_relevance(
            recent_turns,
            current_task
        )
        scores["task_relevance"] = task_relevance_result["score"]
        scores["suggested_keywords"] = task_relevance_result.get("suggested_keywords", [])
        scores["matched_keywords"] = task_relevance_result.get("matched_keywords", [])

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
    ) -> Dict[str, Any]:
        """
        任务相关性评分 (0-10) - 支持跨语言匹配
        - 包含任务特定关键词 : +5
        - 包含场景关键词 : +2
        - 偏离话题 : -3
        - 无关内容 : -5
        
        Returns:
            {
                "score": int,  # 0-10 的分数
                "suggested_keywords": List[str],  # 建议的关键词（当分数低时）
                "matched_keywords": List[str]  # 已匹配的关键词
            }
        """
        score = 5  # 基础分
        suggested_keywords = []
        matched_keywords = []

        if not current_task:
            return {"score": score, "suggested_keywords": suggested_keywords, "matched_keywords": matched_keywords}

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
            return {"score": score, "suggested_keywords": scene_keywords[:5], "matched_keywords": matched_keywords}

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
        
        # 定义通用礼貌用语（这些词不应该作为任务相关性评分依据）
        generic_polite_words = {'please', 'can you', 'could you', 'thank you', 'thanks', 'excuse me', 'sorry', 'pardon', 'hello', 'hi', 'hey'}
        
        # 3. 检查任务特定关键词匹配（高权重）
        # 过滤掉通用礼貌用语，只保留场景特定关键词
        for kw in task_specific_keywords:
            if kw.lower() in user_content and kw.lower() not in generic_polite_words:
                matched_keywords.append(kw)
        matched_task_specific = len(matched_keywords)

        # 4. 检查场景关键词匹配（低权重）
        # 同样过滤掉通用礼貌用语
        matched_scene_keywords_list = []
        for kw in scene_keywords:
            if kw.lower() in user_content and kw.lower() not in generic_polite_words:
                matched_scene_keywords_list.append(kw)
        matched_scene_keywords = len(matched_scene_keywords_list)

        # 检测用户输入语言是否与目标语言匹配
        target_language = current_task.get("target_language", "English").lower()
        input_language = self._detect_input_language(user_content)

        # 语言不匹配时降低分数，但不直接给最低分（继续关键词匹配）
        language_mismatch = False
        if input_language and input_language != target_language:
            # 明确检测到语言不匹配（如中文vs英文）
            language_mismatch = True
            score -= 2  # 扣2分
        # 注意：如果无法检测语言（返回None），不扣分，继续关键词匹配
        # 这避免短文本如"Hi", "Good morning"等被误判

        # 检测无效输入（无意义字符、重复字符等）
        # 检测纯符号、重复字符、无意义输入（如"xxxx"、"。。。"、"!!!"等）
        if re.match(r'^[\x00-\x1f\W]{1,10}$', user_content.strip()) or \
           re.match(r'^(.)\1{2,}$', user_content.strip().lower()) or \
           len(user_content.strip()) < 3:
            # 无效输入，直接给最低分，返回前5个场景关键词作为建议
            return {"score": 1, "suggested_keywords": scene_keywords[:5], "matched_keywords": []}

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

        # 2. 检测用户输入是否包含任务特定关键词或场景关键词（排除通用礼貌用语）
        has_task_specific = any(kw.lower() in user_content for kw in task_specific_keywords if kw.lower() not in generic_polite_words)
        has_scene_keywords = any(kw.lower() in user_content for kw in scene_keywords if kw.lower() not in generic_polite_words)

        # 3. 检测是否有明显的无关内容
        has_off_topic = any(word in user_content for word in off_topic_indicators)

        # 4. 如果用户说的内容和任务场景完全无关，且有明显的无关话题（额外扣分）
        if not has_task_specific and not has_scene_keywords and has_off_topic:
            score = max(0, score - 2)  # 严重偏离话题，再扣 2 分

        final_score = min(10, max(0, score))
        
        # 准备建议关键词（当分数较低时）
        suggested_keywords = []
        if final_score < 5:
            # 取未匹配的场景关键词作为建议
            suggested_keywords = [kw for kw in scene_keywords if kw not in matched_scene_keywords_list][:5]
            if not suggested_keywords:
                suggested_keywords = scene_keywords[:5]
        
        return {
            "score": final_score,
            "suggested_keywords": suggested_keywords,
            "matched_keywords": matched_keywords + matched_scene_keywords_list
        }

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
        combined_text = f"{task_desc} {scenario_title}".lower()

        # 1. 提取英文单词
        en_words = re.findall(r'\b[a-zA-Z]{3,}\b', combined_text)
        stop_words = {'the', 'and', 'for', 'with', 'about', 'your', 'you', 'that', 'this', 'have', 'has', 'are', 'was', 'were', 'just', 'new', 'old'}
        for word in en_words:
            if word not in stop_words:
                keywords.add(word)

        # 2. 根据任务描述内容添加特定关键词（严格匹配，不包含通用礼貌用语）
        # 问候相关任务
        if any(word in combined_text for word in ['问候', 'greet', 'meeting', 'meet', 'introduction', 'introduce']):
            keywords.update(['nice to meet', 'pleased to meet', 'good to meet', 'great to meet', 'hello', 'hi', 'hey', 'greetings', 'welcome', 'nice', 'meet', 'pleased', 'good', 'great', 'finally', 'excited', 'exciting'])
        
        # 电话相关任务
        if any(word in combined_text for word in ['电话', 'phone', 'call', '通话']):
            keywords.update(['speaking', 'call', 'phone', 'number', 'message', 'hold on', 'take a message'])
        
        # 餐厅相关任务
        if any(word in combined_text for word in ['餐厅', 'restaurant', 'dining', 'eat']):
            keywords.update(['table', 'menu', 'order', 'bill', 'check', 'food', 'delicious'])
        
        # 购物相关任务
        if any(word in combined_text for word in ['购物', 'shopping', 'buy']):
            keywords.update(['price', 'discount', 'size', 'color', 'how much', 'i\'ll take', 'looking for'])
        
        # 方向相关任务
        if any(word in combined_text for word in ['方向', 'direction', 'way', 'where']):
            keywords.update(['where is', 'how do i get', 'go straight', 'turn left', 'turn right', 'excuse me'])
        
        # 旅行相关任务
        if any(word in combined_text for word in ['旅行', 'travel', 'trip', 'hotel']):
            keywords.update(['booking', 'reservation', 'check in', 'check out', 'flight', 'ticket'])
        
        # 天气相关任务 - 新增
        if any(word in combined_text for word in ['天气', 'weather', 'sunny', 'rainy', 'temperature']):
            keywords.update(['weather', 'sunny', 'rainy', 'cloudy', 'temperature', 'forecast', 'wind', 'hot', 'cold', 'warm', 'cool', 'raining', 'snowing', 'jacket', 'wear', 'outside'])
        
        # 商务相关任务 - 新增
        if any(word in combined_text for word in ['商务', 'business', 'meeting', 'project']):
            keywords.update(['business', 'meeting', 'project', 'team', 'client', 'deadline', 'report', 'presentation', 'schedule', 'appointment'])

        # 注意：不再添加通用对话关键词，确保严格匹配场景特定词汇
        # 通用礼貌用语（please, can you, thank you等）不应作为任务相关性评分依据

        return list(keywords)[:20]

    def _calculate_proficiency_delta_with_feedback(
        self,
        scores: Dict[str, Any]
    ) -> Tuple[int, str]:
        """
        计算熟练度增量（可正可负）
        返回: (delta, feedback_message)
        
        注意：建议关键词会通过 scores 字典传递，不需要在此函数中返回
        """
        # 只计算整数分数的平均值
        numeric_scores = [
            scores.get("fluency", 5),
            scores.get("vocabulary", 5),
            scores.get("grammar", 5),
            scores.get("task_relevance", 5)
        ]
        avg_score = sum(numeric_scores) / len(numeric_scores)
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
        scores: Dict[str, Any],
        feedback: str,
        db_connection: Any,
        current_task: Dict[str, Any] = None,
        conversation_history: List[Dict[str, Any]] = None,
        native_language: str = "English"
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
        # 提取建议关键词（从scores中获取）
        suggested_keywords = scores.get("suggested_keywords", [])
        
        # 生成改进建议（传入对话历史和建议关键词以生成更针对性的建议）
        improvement_tips = self._generate_improvement_tips(
            scores,
            current_task,
            conversation_history,
            suggested_keywords
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
            # 生成任务完成的详细反馈（根据用户母语）
            completion_feedback = self._generate_completion_feedback(scores, improvement_tips, native_language)

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
        scores: Dict[str, Any],
        current_task: Dict[str, Any] = None,
        conversation_history: List[Dict[str, Any]] = None,
        suggested_keywords: List[str] = None
    ) -> List[str]:
        """生成精简的改进建议，只保留关键信息"""
        tips = []

        task_relevance = scores.get("task_relevance", 5)

        # 获取当前任务信息
        task_desc = current_task.get("task_description", "") if current_task else ""

        # 任务相关性建议 - 精简版，只保留关键词展示
        if task_relevance < 5:
            tips.append(f"🎯 {task_desc}")
            # 如果有建议关键词，显示它们
            if suggested_keywords and len(suggested_keywords) > 0:
                tips.append(f"💡 {', '.join(suggested_keywords[:5])}")
        elif task_relevance < 8:
            # 中等相关性，简要提示
            if suggested_keywords and len(suggested_keywords) > 0:
                tips.append(f"💡 {', '.join(suggested_keywords[:3])}")

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

        # 过滤掉不合理的关键词（短语、疑问句结构等）
        valid_keywords = []
        invalid_patterns = ['where is', 'how to', 'what is', 'can you', 'do you', 'is there']
        for kw in keywords:
            kw_lower = kw.lower().strip()
            # 只保留单个实义词（2-15 个字符，不包含空格）
            if 2 <= len(kw_lower) <= 15 and ' ' not in kw_lower:
                # 检查是否包含无效模式
                if not any(pattern in kw_lower for pattern in invalid_patterns):
                    valid_keywords.append(kw)
        
        # 如果过滤后不足 2 个关键词，使用默认模板
        if len(valid_keywords) < 2:
            return "Try using connectors: 'I think...', 'In my opinion...', 'Actually...'"

        kw1, kw2 = valid_keywords[0], valid_keywords[1]

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

        # 方向场景（支持中英文）- 修复语法错误
        if '方向' in scenario_lower or 'direction' in scenario_lower or 'where' in scenario_lower:
            # 避免生成 "Where is direction" 这种错误句子
            # 使用更自然的表达方式
            templates = [
                f"Excuse me, could you tell me how to get to the {kw1}?",
                f"Where can I find the {kw1}, and is it near the {kw2}?",
                f"Could you show me the way to the {kw1}?",
                f"How do I get to the {kw1} from here?",
            ]
            import random
            return random.choice(templates)

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

        # 任务描述关键词映射 - 用于从任务描述中提取具体场景
        # 键：任务描述中的关键词，值：对应的场景关键词列表
        task_desc_keywords_map = {
            # 天气相关任务
            "天气": ["weather", "sunny", "rainy", "cloudy", "temperature", "forecast", "wind", "hot", "cold", "warm", "cool", "raining", "snowing", "nice day", "beautiful day"],
            "weather": ["weather", "sunny", "rainy", "cloudy", "temperature", "forecast", "wind", "hot", "cold", "warm", "cool", "raining", "snowing"],
            # 电话相关任务
            "电话": ["phone", "call", "speaking", "number", "message", "hold on", "take a message"],
            "phone": ["phone", "call", "speaking", "number", "message"],
            # 咖啡相关任务
            "咖啡": ["coffee", "latte", "cappuccino", "espresso", "menu", "size", "milk", "sugar", "order"],
            "coffee": ["coffee", "latte", "cappuccino", "espresso", "menu", "size", "milk", "sugar"],
            # 餐厅相关任务
            "餐厅": ["restaurant", "table", "reservation", "menu", "bill", "food", "dish", "order"],
            "restaurant": ["restaurant", "table", "reservation", "menu", "bill", "food", "dish"],
            # 购物相关任务
            "购物": ["shopping", "price", "discount", "size", "color", "receipt", "payment", "how much"],
            "shopping": ["shopping", "price", "discount", "size", "color", "receipt", "payment"],
            # 方向相关任务
            "方向": ["street", "road", "station", "map", "direction", "where is", "how do i get", "excuse me"],
            "direction": ["street", "road", "station", "map", "direction", "where is", "how do i get"],
            # 旅行相关任务
            "旅行": ["travel", "flight", "hotel", "ticket", "airport", "booking", "destination", "trip"],
            "travel": ["travel", "flight", "hotel", "ticket", "airport", "booking", "destination"],
            # 商务相关任务
            "商务": ["business", "meeting", "project", "team", "client", "deadline", "report", "presentation"],
            "business": ["business", "meeting", "project", "team", "client", "deadline", "report"],
            # 问候相关任务
            "问候": ["hello", "hi", "nice", "meet", "pleased", "good morning", "how are you", "greetings"],
            "greet": ["hello", "hi", "nice", "meet", "pleased", "good morning", "how are you"],
        }

        # 场景关键词映射（作为 AI 调用失败的 fallback）- 支持中文场景名匹配
        # 包含问候语、常用表达和话题关键词
        scene_keywords_map = {
            # 中文场景名 - 问候场景
            "问候": ["hello", "hi", "hey", "nice", "meet", "pleased", "good morning", "good afternoon", "good evening", "how are you", "how do you do", "greetings", "welcome", "hometown", "job", "hobbies", "family", "studies", "interests", "weekend", "plans", "friends", "city"],
            "日常问候": ["hello", "hi", "hey", "nice", "meet", "pleased", "good morning", "good afternoon", "good evening", "how are you", "how do you do", "greetings", "welcome", "great to see", "nice to see", "hometown", "job", "hobbies", "family", "studies", "interests", "weekend", "plans", "friends", "city"],
            "电话": ["phone", "call", "message", "number", "callback", "voicemail", "hello", "speaking", "may i speak", "is this", "who is calling", "hold on", "take a message"],
            "通话": ["phone", "call", "message", "number", "callback", "voicemail", "hello", "speaking", "may i speak", "is this", "who is calling", "hold on", "take a message"],
            "咖啡": ["coffee", "latte", "cappuccino", "espresso", "menu", "size", "milk", "sugar", "order", "please", "would like", "can i get", "i'll have", "for here", "to go"],
            "餐厅": ["restaurant", "table", "reservation", "menu", "bill", "food", "dish", "order", "please", "would like", "can i have", "i'll have", "check please", "delicious"],
            "购物": ["shopping", "price", "discount", "size", "color", "receipt", "payment", "how much", "can i try", "i'll take", "do you have", "looking for", "expensive", "cheap"],
            "方向": ["street", "road", "station", "airport", "hotel", "restaurant", "map", "direction", "landmark", "building", "excuse me", "how do i get", "where is", "can you tell me", "go straight", "turn left", "turn right"],
            "旅行": ["travel", "flight", "hotel", "ticket", "airport", "booking", "destination", "trip", "passport", "check in", "check out", "reservation", "suitcase", "luggage"],
            "商务": ["business", "meeting", "project", "team", "client", "deadline", "report", "presentation", "schedule", "appointment", "discuss", "agenda", "proposal", "contract"],
            "天气": ["weather", "sunny", "rainy", "cloudy", "temperature", "forecast", "wind", "hot", "cold", "warm", "cool", "raining", "snowing", "jacket", "wear", "outside", "umbrella"],
            # 英文场景名
            "greeting": ["hello", "hi", "hey", "nice", "meet", "pleased", "good morning", "good afternoon", "good evening", "how are you", "how do you do", "greetings", "welcome", "great to see", "nice to see", "hometown", "job", "hobbies", "family", "studies", "interests", "weekend", "plans", "friends", "city"],
            "phone": ["phone", "call", "message", "number", "callback", "voicemail", "hello", "speaking", "may i speak", "is this", "who is calling", "hold on", "take a message"],
            "coffee": ["coffee", "latte", "cappuccino", "espresso", "menu", "size", "milk", "sugar", "order", "please", "would like", "can i get", "i'll have", "for here", "to go"],
            "restaurant": ["restaurant", "table", "reservation", "menu", "bill", "food", "dish", "order", "please", "would like", "can i have", "i'll have", "check please", "delicious"],
            "shopping": ["shopping", "price", "discount", "size", "color", "receipt", "payment", "how much", "can i try", "i'll take", "do you have", "looking for", "expensive", "cheap"],
            "direction": ["street", "road", "station", "airport", "hotel", "restaurant", "map", "direction", "landmark", "building", "excuse me", "how do i get", "where is", "can you tell me", "go straight", "turn left", "turn right"],
            "travel": ["travel", "flight", "hotel", "ticket", "airport", "booking", "destination", "trip", "passport", "check in", "check out", "reservation", "suitcase", "luggage"],
            "business": ["business", "meeting", "project", "team", "client", "deadline", "report", "presentation", "schedule", "appointment", "discuss", "agenda", "proposal", "contract"],
            "weather": ["weather", "sunny", "rainy", "cloudy", "temperature", "forecast", "wind", "nice day", "beautiful day", "hot", "cold", "warm", "cool", "raining", "snowing"],
        }

        # 步骤1: 首先检查任务描述关键词映射（最优先）
        # 这用于处理"日常问候"场景下的"聊聊天气"这类子任务
        for task_key, keywords in task_desc_keywords_map.items():
            if task_key in task_lower:
                # 找到了任务描述中的具体场景关键词
                unique_keywords = list(dict.fromkeys(keywords))
                self._keyword_cache[cache_key] = unique_keywords[:15]
                return unique_keywords[:15]
        
        # 步骤2: 尝试匹配场景关键词映射
        # 任务描述优先：如果任务描述中包含具体场景关键词（如"天气"），优先使用该场景
        task_specific_matched_keywords = []
        scenario_matched_keywords = []
        combined_matched_keywords = []
        
        for scene_key, keywords in scene_keywords_map.items():
            # 首先检查任务描述中是否包含具体场景关键词
            if scene_key in task_lower:
                task_specific_matched_keywords.extend(keywords)
            # 然后检查场景标题
            elif scene_key in scenario_lower:
                scenario_matched_keywords.extend(keywords)
            # 最后检查组合
            elif scene_key in combined:
                combined_matched_keywords.extend(keywords)
        
        # 优先使用任务描述匹配到的关键词（更具体）
        if task_specific_matched_keywords:
            unique_keywords = list(dict.fromkeys(task_specific_matched_keywords))
            self._keyword_cache[cache_key] = unique_keywords[:15]
            return unique_keywords[:15]
        
        # 如果任务描述没有匹配到，使用场景标题匹配的关键词
        if scenario_matched_keywords:
            unique_keywords = list(dict.fromkeys(scenario_matched_keywords))
            self._keyword_cache[cache_key] = unique_keywords[:15]
            return unique_keywords[:15]
        
        # 最后尝试组合匹配（兼容旧逻辑）
        if combined_matched_keywords:
            unique_keywords = list(dict.fromkeys(combined_matched_keywords))
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
        if not text or len(text.strip()) < 2:
            return None

        text_lower = text.lower()
        text_stripped = text.strip()

        # 检测中文字符（优先检测，因为中文最明确）
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        if chinese_chars > 0:
            # 只要有中文字符，就认为是中文
            return 'chinese'

        # 检测日文字符
        japanese_chars = len(re.findall(r'[\u3040-\u309f\u30a0-\u30ff]', text))
        if japanese_chars > 0:
            return 'japanese'

        # 检测韩文字符
        korean_chars = len(re.findall(r'[\uac00-\ud7af]', text))
        if korean_chars > 0:
            return 'korean'

        # 移除数字和空格，只保留实际字符用于语言检测
        text_for_detection = re.sub(r'[0-9\s]', '', text)
        if not text_for_detection:
            return None
        text_length = len(text_for_detection)

        # 检测西文字符（英文、法文、德文、西班牙文等使用拉丁字母）
        latin_chars = len(re.findall(r'[a-zA-Z]', text))
        # 降低阈值：只要有拉丁字母且占比超过30%，或纯拉丁字母文本，就认为是西文
        if latin_chars > 0 and (latin_chars > text_length * 0.3 or latin_chars == text_length):
            # 尝试区分具体语言
            if re.search(r'\b(el|la|los|las|de|que|en|es|por|para|con)\b', text_lower):
                return 'spanish'
            elif re.search(r'\b(le|la|les|de|et|est|dans|pour|avec)\b', text_lower):
                return 'french'
            elif re.search(r'\b(der|die|das|und|ist|ein|mit)\b', text_lower):
                return 'german'
            else:
                # 默认英文（最常见情况）
                return 'english'

        # 如果文本主要是拉丁字母但检测比例不够，仍然默认英文
        # 这处理短文本如 "Hi", "OK", "Yes" 等情况
        if latin_chars > 0 and text_length < 20:
            return 'english'

        # 无法确定具体语言
        return None

    def _generate_completion_feedback(
        self,
        scores: Dict[str, int],
        improvement_tips: List[str],
        native_language: str = "English"
    ) -> str:
        """生成任务完成时的AI点评 - 支持多语言（15种语言）"""
        # 多语言模板
        templates = {
            "Chinese": {
                "excellent": "任务完成！表现优秀，继续保持。",
                "good": "任务完成！整体表现良好，仍有提升空间。",
                "completed": "任务完成！继续加油，多练习会有进步。",
                "fluency": "流利度",
                "vocabulary": "词汇量",
                "grammar": "语法",
                "task_relevance": "任务相关性",
                "improve": "建议重点提升：",
                "suggestion": "练习建议：",
            },
            "English": {
                "excellent": "Task completed! Excellent performance, keep it up!",
                "good": "Task completed! Good performance overall, still room for improvement.",
                "completed": "Task completed! Keep practicing and you'll improve.",
                "fluency": "fluency",
                "vocabulary": "vocabulary",
                "grammar": "grammar",
                "task_relevance": "task relevance",
                "improve": "Focus on improving: ",
                "suggestion": "Practice suggestions: ",
            },
            "Japanese": {
                "excellent": "タスク完了！素晴らしいパフォーマンスです、この調子で続けてください。",
                "good": "タスク完了！全体的に良いパフォーマンスですが、まだ向上の余地があります。",
                "completed": "タスク完了！練習を続ければ上達します。",
                "fluency": "流暢さ",
                "vocabulary": "語彙",
                "grammar": "文法",
                "task_relevance": "タスク関連性",
                "improve": "改善に焦点を当ててください：",
                "suggestion": "練習のアドバイス：",
            },
            "Spanish": {
                "excellent": "¡Tarea completada! Desempeño excelente, ¡sigue así!",
                "good": "¡Tarea completada! Buen desempeño en general, aún hay margen de mejora.",
                "completed": "¡Tarea completada! Sigue practicando y mejorarás.",
                "fluency": "fluidez",
                "vocabulary": "vocabulario",
                "grammar": "gramática",
                "task_relevance": "relevancia de la tarea",
                "improve": "Enfócate en mejorar: ",
                "suggestion": "Sugerencias de práctica: ",
            },
            "French": {
                "excellent": "Tâche terminée ! Excellente performance, continuez comme ça !",
                "good": "Tâche terminée ! Bonne performance globale, il reste encore de la marge de progression.",
                "completed": "Tâche terminée ! Continuez à pratiquer et vous vous améliorerez.",
                "fluency": "fluidité",
                "vocabulary": "vocabulaire",
                "grammar": "grammaire",
                "task_relevance": "pertinence de la tâche",
                "improve": "Concentrez-vous sur l'amélioration de : ",
                "suggestion": "Suggestions de pratique : ",
            },
            "German": {
                "excellent": "Aufgabe abgeschlossen! Ausgezeichnete Leistung, machen Sie weiter so!",
                "good": "Aufgabe abgeschlossen! Gute Gesamtleistung, es gibt noch Verbesserungspotenzial.",
                "completed": "Aufgabe abgeschlossen! Üben Sie weiter und Sie werden sich verbessern.",
                "fluency": "Flüssigkeit",
                "vocabulary": "Wortschatz",
                "grammar": "Grammatik",
                "task_relevance": "Aufgabenrelevanz",
                "improve": "Konzentrieren Sie sich auf die Verbesserung von: ",
                "suggestion": "Übungsvorschläge: ",
            },
            "Korean": {
                "excellent": "과제 완료! 훌륭한 성과입니다, 계속 유지하세요!",
                "good": "과제 완료! 전반적으로 좋은 성과이지만, 여전히 개선의 여지가 있습니다.",
                "completed": "과제 완료! 계속 연습하면 실력이 늘 것입니다.",
                "fluency": "유창성",
                "vocabulary": "어휘",
                "grammar": "문법",
                "task_relevance": "과제 관련성",
                "improve": "개선에 집중하세요: ",
                "suggestion": "연습 제안: ",
            },
            "Portuguese": {
                "excellent": "Tarefa concluída! Desempenho excelente, continue assim!",
                "good": "Tarefa concluída! Bom desempenho geral, ainda há espaço para melhorias.",
                "completed": "Tarefa concluída! Continue praticando e você vai melhorar.",
                "fluency": "fluência",
                "vocabulary": "vocabulário",
                "grammar": "gramática",
                "task_relevance": "relevância da tarefa",
                "improve": "Concentre-se em melhorar: ",
                "suggestion": "Sugestões de prática: ",
            },
            "Russian": {
                "excellent": "Задание выполнено! Отличная работа, продолжайте в том же духе!",
                "good": "Задание выполнено! Хорошая общая работа, есть ещё возможности для улучшения.",
                "completed": "Задание выполнено! Продолжайте практиковаться, и вы улучшитесь.",
                "fluency": "беглость",
                "vocabulary": "словарный запас",
                "grammar": "грамматика",
                "task_relevance": "соответствие заданию",
                "improve": "Сосредоточьтесь на улучшении: ",
                "suggestion": "Предложения по практике: ",
            },
            "Italian": {
                "excellent": "Compito completato! Prestazione eccellente, continua così!",
                "good": "Compito completato! Buona prestazione complessiva, c'è ancora spazio per migliorare.",
                "completed": "Compito completato! Continua a praticare e migliorerai.",
                "fluency": "fluidità",
                "vocabulary": "vocabolario",
                "grammar": "grammatica",
                "task_relevance": "rilevanza del compito",
                "improve": "Concentrati sul miglioramento di: ",
                "suggestion": "Suggerimenti per la pratica: ",
            },
            "Arabic": {
                "excellent": "اكتملت المهمة! أداء ممتاز، استمر على هذا النحو!",
                "good": "اكتملت المهمة! أداء جيد بشكل عام، لا يزال هناك مجال للتحسن.",
                "completed": "اكتملت المهمة! استمر في الممارسة وستتحسن.",
                "fluency": "الطلاقة",
                "vocabulary": "المفردات",
                "grammar": "القواعد",
                "task_relevance": "مدى ملاءمة المهمة",
                "improve": "ركز على تحسين: ",
                "suggestion": "اقتراحات الممارسة: ",
            },
            "Hindi": {
                "excellent": "कार्य पूरा हुआ! उत्कृष्ट प्रदर्शन, ऐसे ही जारी रखें!",
                "good": "कार्य पूरा हुआ! समग्र रूप से अच्छा प्रदर्शन, अभी भी सुधार की गुंजाइश है।",
                "completed": "कार्य पूरा हुआ! अभ्यास जारी रखें और आप सुधरेंगे।",
                "fluency": "धाराप्रवाहता",
                "vocabulary": "शब्दावली",
                "grammar": "व्याकरण",
                "task_relevance": "कार्य प्रासंगिकता",
                "improve": "इस पर सुधार करने पर ध्यान दें: ",
                "suggestion": "अभ्यास के सुझाव: ",
            },
            "Thai": {
                "excellent": "ภารกิจเสร็จสมบูรณ์! ผลงานยอดเยี่ยม ทำต่อไป!",
                "good": "ภารกิจเสร็จสมบูรณ์! ผลงานโดยรวมดี ยังมีที่ว่างให้ปรับปรุง",
                "completed": "ภารกิจเสร็จสมบูรณ์! ฝึกฝนต่อไปและคุณจะดีขึ้น",
                "fluency": "ความคล่องแคล่ว",
                "vocabulary": "คำศัพท์",
                "grammar": "ไวยากรณ์",
                "task_relevance": "ความเกี่ยวข้องของภารกิจ",
                "improve": "มุ่งเน้นที่การปรับปรุง: ",
                "suggestion": "คำแนะนำการฝึกฝน: ",
            },
            "Vietnamese": {
                "excellent": "Nhiệm vụ hoàn thành! Hiệu suất xuất sắc, hãy tiếp tục!",
                "good": "Nhiệm vụ hoàn thành! Hiệu suất tốt nói chung, vẫn còn chỗ để cải thiện.",
                "completed": "Nhiệm vụ hoàn thành! Tiếp tục luyện tập và bạn sẽ tiến bộ.",
                "fluency": "sự trôi chảy",
                "vocabulary": "từ vựng",
                "grammar": "ngữ pháp",
                "task_relevance": "mức độ liên quan của nhiệm vụ",
                "improve": "Tập trung cải thiện: ",
                "suggestion": "Đề xuất luyện tập: ",
            },
            "Indonesian": {
                "excellent": "Tugas selesai! Performa sangat baik, teruskan!",
                "good": "Tugas selesai! Performa baik secara keseluruhan, masih ada ruang untuk perbaikan.",
                "completed": "Tugas selesai! Terus berlatih dan Anda akan meningkat.",
                "fluency": "kelancaran",
                "vocabulary": "kosakata",
                "grammar": "tata bahasa",
                "task_relevance": "relevansi tugas",
                "improve": "Fokus pada peningkatan: ",
                "suggestion": "Saran praktik: ",
            },
        }

        lang = templates.get(native_language, templates["English"])
        
        # 根据各维度得分生成针对性点评
        feedback_parts = []

        # 整体评价（简洁，无表情符号）
        avg_score = sum(scores.values()) / len(scores)
        if avg_score >= 8:
            feedback_parts.append(lang["excellent"])
        elif avg_score >= 6:
            feedback_parts.append(lang["good"])
        else:
            feedback_parts.append(lang["completed"])

        # 具体维度评价（简洁）
        fluency = scores.get("fluency", 5)
        vocabulary = scores.get("vocabulary", 5)
        grammar = scores.get("grammar", 5)
        task_relevance = scores.get("task_relevance", 5)

        # 只显示需要改进的维度，简洁呈现
        areas_to_improve = []
        if fluency < 6:
            areas_to_improve.append(lang["fluency"])
        if vocabulary < 6:
            areas_to_improve.append(lang["vocabulary"])
        if grammar < 6:
            areas_to_improve.append(lang["grammar"])
        if task_relevance < 6:
            areas_to_improve.append(lang["task_relevance"])

        if areas_to_improve:
            feedback_parts.append(f"{lang['improve']}{', '.join(areas_to_improve)}。")

        # 添加改进建议（最多2条，简洁）
        if improvement_tips:
            # 过滤掉带表情符号的建议，只取核心内容
            clean_tips = []
            for tip in improvement_tips[:2]:
                # 移除表情符号和多余空格
                clean_tip = re.sub(r'[💬📚✏️🎯💡•\s]+', '', tip).strip()
                if clean_tip:
                    clean_tips.append(clean_tip)
            if clean_tips:
                feedback_parts.append(f"{lang['suggestion']}{'; '.join(clean_tips)}")

        return "\n".join(feedback_parts)


# 导出工作流实例
proficiency_scoring_workflow = ProficiencyScoringWorkflow()
