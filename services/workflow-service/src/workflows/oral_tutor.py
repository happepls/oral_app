"""
Workflow 1: Oral Tutor (口语导师)
负责在对话页面与用户的实时交流
"""
import json
import re
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


class OralTutorWorkflow:
    """
    口语导师工作流
    - 实时对话交互
    - 纠正发音和语法
    - 提供替代表达建议
    - 保持对话流畅性
    """
    
    def __init__(self):
        self.system_prompt = self._build_system_prompt()
    
    def _build_system_prompt(self) -> str:
        """构建优化的口语导师系统提示词"""
        return """# Role
You are "Omni", an expert oral language tutor specializing in **immersive conversation practice**.

# ENHANCED OPENING STRATEGY
**CRITICAL**: Start each scenario with a detailed, engaging introduction that:
1. **Sets the scene vividly** - Describe the environment, your role, and the situation
2. **Explains the objective clearly** - Tell the user exactly what they need to accomplish  
3. **Provides context clues** - Give hints about useful phrases without giving answers
4. **Creates motivation** - Explain why this skill matters in real life

**Example Opening**: Instead of "Hello! Ready to order coffee?" → "Welcome to Sunrise Café! I'm Sarah, your barista. You look like you need your morning caffeine fix. We have fresh Colombian roast, Italian espresso, and our signature caramel latte. What can I get started for you?"

# ENHANCED CORE PRINCIPLES
1. **User Talks 80%**: You talk 20%. Ask open questions that require full sentences.
2. **Natural Flow**: Keep conversation going like a real friend, not a textbook.
3. **Smart Guidance**: Use leading questions and contextual hints, never give direct answers.
4. **Stay in Character**: Maintain the role-play persona throughout the conversation.

# TOPIC ADHERENCE PROTOCOL
**When user goes off-topic:**
1. Acknowledge briefly: "I understand you're interested in [topic]..."
2. Redirect gently: "...but for this exercise, let's focus on [current task]"
3. Provide motivation: "This skill will really help you when you [real-world scenario]"
4. Ask guiding question: "So, what would you like to know about [relevant topic]?"

# ENHANCED INTERACTION STYLE
- **Brief Responses**: 1-2 sentences max (15-20 words), but make them engaging and contextual.
- **Question-Driven**: End most turns with a follow-up question that advances the conversation.
- **Context-Aware**: Reference previous topics naturally and build on them.

# ENHANCED CORRECTION STRATEGY
1. **Implicit Modeling**: Recast their sentence correctly in your natural response.
   - User: "I want table near window" → You: "A table by the window? Certainly, I have one available."

2. **Gentle Guidance (when needed)**: 
   - "Think about what information I might need for this request..."
   - "What details would be helpful to mention when asking about...?"

3. **Praise with Progress**: Celebrate improvements specifically.
   - "Excellent! You clearly explained your dietary requirements."

# ENHANCED COMPLETION CRITERIA
- **80% Accuracy Rule**: Accept responses that convey intended meaning, even with minor grammar issues.
- **Natural Phrasing Preferred**: Don't require exact textbook phrases - real conversation is flexible.
- **Context-Appropriate**: Judge completion based on situational appropriateness, not perfection.
- **Progressive Difficulty**: After completion, naturally increase complexity for next interaction.

# TRANSITION & FLOW MANAGEMENT
- **Smooth Transitions**: After task completion, naturally introduce next challenge.
  - "Great! Now that you're checked in, would you like to know about our baggage policy?"
- **Scene Building**: Add realistic details to make the conversation more immersive.
- **Cultural Context**: Include appropriate cultural references and etiquette for the scenario.

# EVALUATION RESPONSES (CRITICAL)
- **Task Completion**: Use ONLY natural praise like "Perfect!" / "Excellent!" / "Great job!" - NO system commands
- **Encouragement**: "Good!" / "Nice!" / "Keep going!" for partial success  
- **Gentle Redirection**: "Almost there!" / "Try thinking about..." when corrections needed
- **Never Say**: "SESSION COMPLETE" or any system keywords - only natural conversation

# EMOTIONAL TONE
- **Warm & Engaging**: Use natural conversation patterns, occasional humor when appropriate.
- **Encouraging**: Celebrate efforts and progress enthusiastically.
- **Patient & Supportive**: Never show frustration, always guide forward.

# DO NOT
- Give direct answers or model phrases before user attempts.
- Break character or refer to this as an exercise.
- Use formal academic language or robotic responses.
- Say "SESSION COMPLETE" or similar system phrases."""

    async def process_user_input(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        user_context: Dict[str, Any],
        current_task: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        处理用户输入，生成口语导师回复
        
        Args:
            user_message: 用户当前消息
            conversation_history: 对话历史 (最近 10 轮)
            user_context: 用户上下文 (包括 proficiency, target_language 等)
            current_task: 当前任务信息
            
        Returns:
            包含回复内容、是否需要纠正、任务进度等信息
        """
        # 分析用户消息 (增强版，包含当前任务)
        analysis = self._analyze_message(user_message, conversation_history, user_context, current_task)
        
        # 生成回复策略
        response_strategy = self._generate_response_strategy(
            analysis, 
            conversation_history, 
            current_task
        )
        
        return {
            "workflow": "oral_tutor",
            "response_strategy": response_strategy,
            "analysis": analysis,
            "should_correct": analysis.get("needs_correction", False),
            "task_progress": analysis.get("task_progress", 0),
            "proficiency_insights": {
                "engagement_level": analysis.get("engagement_level", "normal"),
                "language_accuracy": self._calculate_language_accuracy(user_message, user_context.get("target_language", "English")),
                "complexity_score": self._calculate_complexity_score(user_message),
                "improvement_suggestions": self._generate_improvement_suggestions(analysis, user_context)
            }
        }
    
    def _analyze_message(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        user_context: Dict[str, Any],
        current_task: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """增强的用户消息分析 - 优化任务完成检测和话题相关性"""
        analysis = {
            "text": user_message,
            "length": len(user_message),
            "language_detected": self._detect_language(user_message),
            "needs_correction": False,
            "correction_type": None,
            "task_progress": 0,
            "engagement_level": "normal",
            "is_on_topic": True,
            "task_completion_score": 0,
            "semantic_relevance": 0
        }
        
        # 检查语言匹配
        target_language = user_context.get("target_language", "English")
        if analysis["language_detected"] != target_language.lower():
            analysis["needs_correction"] = True
            analysis["correction_type"] = "language_switch"
        
        # 增强的任务完成检测
        if current_task:
            task_text = current_task.get("text", "")
            task_keywords = current_task.get("keywords", [])
            
            # 基础关键词匹配 (80%规则)
            completion_score = self._calculate_task_completion(
                user_message, task_text, task_keywords
            )
            analysis["task_completion_score"] = completion_score
            
            # 语义相关性分析
            semantic_score = self._calculate_semantic_relevance(
                user_message, task_text
            )
            analysis["semantic_relevance"] = semantic_score
            
            # 综合任务进度 (结合关键词和语义)
            if completion_score >= 0.8 or semantic_score >= 0.75:
                analysis["task_progress"] = 1.0  # 任务基本完成
                logger.info(f"🎯 TASK COMPLETION DETECTED - Score: {completion_score:.1%}, Semantic: {semantic_score:.1%}")
            elif completion_score >= 0.6 or semantic_score >= 0.5:
                analysis["task_progress"] = 0.7  # 需要小幅改进
                logger.info(f"📈 GOOD PROGRESS - Score: {completion_score:.1%}, Semantic: {semantic_score:.1%}")
            elif completion_score >= 0.3 or semantic_score >= 0.3:
                analysis["task_progress"] = 0.4  # 需要较多改进
                logger.info(f"📊 PARTIAL PROGRESS - Score: {completion_score:.1%}, Semantic: {semantic_score:.1%}")
            else:
                analysis["task_progress"] = 0.1  # 完全偏离
                logger.info(f"📉 MINIMAL PROGRESS - Score: {completion_score:.1%}, Semantic: {semantic_score:.1%}")
        
        # 话题相关性检测
        if conversation_history:
            last_topic = self._extract_topic(conversation_history)
            analysis["current_topic"] = last_topic
            analysis["is_on_topic"] = self._check_topic_relevance(
                user_message, last_topic, current_task
            )
            
            # 如果用户明显偏离话题，需要纠正
            if not analysis["is_on_topic"] and not analysis["task_progress"] > 0.5:
                analysis["needs_correction"] = True
                analysis["correction_type"] = "off_topic"
        
        # 参与度分析
        if len(user_message) < 10:
            analysis["engagement_level"] = "low"
        elif len(user_message) > 50 and self._has_substantive_content(user_message):
            analysis["engagement_level"] = "high"
        
        return analysis
    
    def _generate_response_strategy(
        self,
        analysis: Dict[str, Any],
        conversation_history: List[Dict[str, str]],
        current_task: Optional[Dict[str, Any]]
    ) -> Dict[str, str]:
        """生成回复策略"""
        strategy = {
            "type": "normal_response",  # normal, correction, praise, question
            "tone": "casual",
            "max_length": 50,  # words
            "include_question": True
        }
        
        if analysis.get("needs_correction"):
            strategy["type"] = "micro_correction"
            strategy["max_length"] = 30
        
        # 如果用户连续短回复，增加引导性问题
        if self._has_short_responses(conversation_history):
            strategy["type"] = "engagement_boost"
            strategy["include_question"] = True
        
        return strategy
    
    def _calculate_task_completion(self, user_message: str, task_text: str, task_keywords: List[str]) -> float:
        """计算任务完成度 (80%规则)"""
        if not task_text:
            return 0.0
        
        # 基础关键词匹配
        message_lower = user_message.lower()
        task_lower = task_text.lower()
        
        # 计算关键词匹配度
        keyword_matches = 0
        total_keywords = len(task_keywords) if task_keywords else 1
        
        if task_keywords:
            for keyword in task_keywords:
                if keyword.lower() in message_lower:
                    keyword_matches += 1
        else:
            # 如果没有明确关键词，检查任务文本中的关键概念
            task_words = task_lower.split()
            for word in task_words:
                if len(word) > 3 and word in message_lower:  # 只考虑有意义的词
                    keyword_matches += 1
            total_keywords = len([w for w in task_words if len(w) > 3])
        
        keyword_score = keyword_matches / total_keywords if total_keywords > 0 else 0
        
        # 语义相关性 (简化版)
        semantic_score = self._calculate_semantic_relevance(user_message, task_text)
        
        # 综合评分 (加权平均)
        completion_score = (keyword_score * 0.6 + semantic_score * 0.4)
        return min(completion_score, 1.0)
    
    def _calculate_semantic_relevance(self, user_message: str, task_text: str) -> float:
        """计算语义相关性 (简化版)"""
        if not task_text:
            return 0.0
        
        # 提取关键动词和名词
        user_words = set(user_message.lower().split())
        task_words = set(task_text.lower().split())
        
        # 移除停用词 (简化)
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        user_content_words = user_words - stop_words
        task_content_words = task_words - stop_words
        
        if not task_content_words:
            return 0.0
        
        # 计算词汇重叠度
        overlap = len(user_content_words & task_content_words)
        total_task_words = len(task_content_words)
        
        relevance_score = overlap / total_task_words if total_task_words > 0 else 0
        return min(relevance_score, 1.0)
    
    def _check_topic_relevance(self, user_message: str, last_topic: str, current_task: Optional[Dict[str, Any]]) -> bool:
        """检查话题相关性"""
        message_lower = user_message.lower()
        
        # 检查是否明显偏离当前任务
        if current_task:
            task_text = current_task.get("text", "").lower()
            task_keywords = [k.lower() for k in current_task.get("keywords", [])]
            
            # 如果用户消息与任务完全无关，标记为偏离
            has_task_content = any(keyword in message_lower for keyword in task_keywords) if task_keywords else task_text in message_lower
            
            if not has_task_content:
                # 检查是否可能是闲聊或问候 (允许一定的寒暄)
                casual_words = ['hello', 'hi', 'good', 'nice', 'weather', 'how are you', 'thank', 'thanks']
                is_casual = any(word in message_lower for word in casual_words)
                
                # 如果既不是任务相关内容，也不是合理的寒暄，则视为偏离
                if not is_casual:
                    return False
        
        return True
    
    def _has_substantive_content(self, user_message: str) -> bool:
        """检查消息是否有实质性内容"""
        # 移除标点符号和常见词
        import re
        clean_message = re.sub(r'[^\w\s]', '', user_message.lower())
        words = clean_message.split()
        
        # 检查是否有意义词 (长度>2)
        meaningful_words = [w for w in words if len(w) > 2]
        return len(meaningful_words) >= 3
    
    def _detect_language(self, text: str) -> str:
        """简单语言检测"""
        # 中文特征
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        if chinese_chars > len(text) * 0.3:
            return "chinese"
        
        # 英文特征 (简单判断)
        english_words = len(re.findall(r'\b[a-zA-Z]+\b', text))
        if english_words > len(text.split()) * 0.7:
            return "english"
        
        return "mixed"
    
    def _extract_topic(self, conversation_history: List[Dict[str, str]]) -> str:
        """从对话历史中提取当前话题"""
        # 简单实现：取最近一轮的关键词
        if not conversation_history:
            return "general"
        
        last_message = conversation_history[-1].get("content", "")
        words = last_message.lower().split()
        
        # 过滤常见词
        stop_words = {"the", "a", "is", "are", "was", "were", "i", "you", "we", "they"}
        keywords = [w for w in words if w not in stop_words and len(w) > 3]
        
        return keywords[0] if keywords else "general"
    
    def _has_short_responses(self, conversation_history: List[Dict[str, str]]) -> bool:
        """检查用户是否连续短回复"""
        if len(conversation_history) < 4:
            return False
        
        user_messages = [
            msg for msg in conversation_history[-4:] 
            if msg.get("role") == "user"
        ]
        
        short_count = sum(1 for msg in user_messages if len(msg.get("content", "")) < 20)
        return short_count >= len(user_messages) * 0.5
    
    def _calculate_language_accuracy(self, user_message: str, target_language: str) -> float:
        """计算语言准确度（简化版）"""
        detected_lang = self._detect_language(user_message)
        if detected_lang == target_language.lower():
            return 1.0
        elif detected_lang == "mixed":
            return 0.5
        else:
            return 0.0
    
    def _calculate_complexity_score(self, user_message: str) -> float:
        """计算语言复杂度得分"""
        import re
        
        # 基础指标
        words = user_message.split()
        sentences = re.split(r'[.!?]+', user_message)
        
        if len(words) == 0:
            return 0.0
        
        # 词汇多样性
        unique_words = len(set(word.lower() for word in words))
        diversity_score = unique_words / len(words)
        
        # 句子长度复杂度
        avg_sentence_length = len(words) / max(len(sentences), 1)
        length_score = min(avg_sentence_length / 15, 1.0)  # 理想句子长度15个词
        
        # 综合得分
        complexity_score = (diversity_score * 0.6 + length_score * 0.4)
        return min(complexity_score, 1.0)
    
    def _generate_improvement_suggestions(self, analysis: Dict[str, Any], user_context: Dict[str, Any]) -> List[str]:
        """生成改进建议"""
        suggestions = []
        
        # 基于任务完成度的建议
        task_progress = analysis.get("task_progress", 0)
        if task_progress < 0.3:
            suggestions.append("尝试更具体地描述您的需求")
        elif task_progress < 0.6:
            suggestions.append("很好！可以尝试添加更多细节")
        
        # 基于参与度的建议
        engagement = analysis.get("engagement_level", "normal")
        if engagement == "low":
            suggestions.append("可以尝试用完整的句子表达")
        
        # 基于语言准确度的建议
        if analysis.get("needs_correction"):
            correction_type = analysis.get("correction_type")
            if correction_type == "language_switch":
                target_lang = user_context.get("target_language", "English")
                suggestions.append(f"请尝试用{target_lang}回答")
            elif correction_type == "off_topic":
                suggestions.append("让我们回到当前的话题上来")
        
        # 基于复杂度的建议
        complexity = analysis.get("complexity_score", 0)
        if complexity < 0.3 and len(suggestions) == 0:
            suggestions.append("可以尝试使用更多样化的词汇")
        
        return suggestions[:2]  # 最多返回2条建议


# 导出工作流实例
oral_tutor_workflow = OralTutorWorkflow()