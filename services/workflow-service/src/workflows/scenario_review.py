"""
Workflow 3: Scenario Review (场景练习总结)
负责用户通过某一场景后 (3 个 mission task 每场景)，
提取该场景的所有对话信息并对用户的练习情况进行总结复盘，提出修正建议
"""
import json
import re
import os
import logging
import httpx
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


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
        self.language_templates = self._build_language_templates()

    def _build_language_templates(self) -> Dict[str, Dict[str, str]]:
        """构建多语言模板 - 支持15种语言"""
        return {
            "Chinese": {
                "title": "【{scenario_title}】练习总结",
                "overview": "练习概况",
                "completion_time": "完成时间",
                "interactions": "对话轮数",
                "avg_score": "综合评分",
                "tasks": "任务完成情况",
                "strengths": "表现亮点",
                "improvements": "待提升方面",
                "recommendations": "针对性建议",
                "excellent": "表现优秀！已掌握该场景。",
                "good": "表现良好！可挑战下一个场景。",
                "completed": "场景完成！建议复习后重试以获得更高分数。",
                "no_strengths": "坚持练习，持续进步",
                "no_weaknesses": "无明显问题，继续保持",
                "minutes": "分钟",
            },
            "English": {
                "title": "[{scenario_title}] Practice Summary",
                "overview": "Overview",
                "completion_time": "Completion Time",
                "interactions": "Interactions",
                "avg_score": "Average Score",
                "tasks": "Task Completion",
                "strengths": "Strengths",
                "improvements": "Areas for Improvement",
                "recommendations": "Recommendations",
                "excellent": "Excellent! You've mastered this scenario.",
                "good": "Great job! Ready for the next challenge.",
                "completed": "Scenario completed! Consider reviewing for a higher score.",
                "no_strengths": "Keep practicing and improving",
                "no_weaknesses": "No major issues, keep it up",
                "minutes": "minutes",
            },
            "Japanese": {
                "title": "【{scenario_title}】練習まとめ",
                "overview": "練習概要",
                "completion_time": "完了時間",
                "interactions": "対話回数",
                "avg_score": "総合評価",
                "tasks": "タスク完了状況",
                "strengths": "良かった点",
                "improvements": "改善点",
                "recommendations": "アドバイス",
                "excellent": "素晴らしい！このシナリオをマスターしました。",
                "good": "良い出来です！次のシナリオに挑戦しましょう。",
                "completed": "シナリオ完了！より高得点を目指して復習しましょう。",
                "no_strengths": "練習を続けて、上達しています",
                "no_weaknesses": "大きな問題はありません、この調子で",
                "minutes": "分",
            },
            "Spanish": {
                "title": "Resumen de práctica: {scenario_title}",
                "overview": "Resumen general",
                "completion_time": "Tiempo de finalización",
                "interactions": "Interacciones",
                "avg_score": "Puntuación promedio",
                "tasks": "Completación de tareas",
                "strengths": "Puntos fuertes",
                "improvements": "Áreas a mejorar",
                "recommendations": "Recomendaciones",
                "excellent": "¡Excelente! Has dominado este escenario.",
                "good": "¡Buen trabajo! Listo para el siguiente desafío.",
                "completed": "¡Escenario completado! Considera revisar para una puntuación más alta.",
                "no_strengths": "Sigue practicando y mejorando",
                "no_weaknesses": "Sin problemas importantes, sigue así",
                "minutes": "minutos",
            },
            "French": {
                "title": "Résumé de la pratique : {scenario_title}",
                "overview": "Vue d'ensemble",
                "completion_time": "Temps de réalisation",
                "interactions": "Interactions",
                "avg_score": "Score moyen",
                "tasks": "Achèvement des tâches",
                "strengths": "Points forts",
                "improvements": "Points à améliorer",
                "recommendations": "Recommandations",
                "excellent": "Excellent ! Vous maîtrisez ce scénario.",
                "good": "Bon travail ! Prêt pour le prochain défi.",
                "completed": "Scénario terminé ! Envisagez de réviser pour un meilleur score.",
                "no_strengths": "Continuez à pratiquer et à vous améliorer",
                "no_weaknesses": "Pas de problèmes majeurs, continuez comme ça",
                "minutes": "minutes",
            },
            "German": {
                "title": "Übungszusammenfassung: {scenario_title}",
                "overview": "Übersicht",
                "completion_time": "Abschlusszeit",
                "interactions": "Interaktionen",
                "avg_score": "Durchschnittspunktzahl",
                "tasks": "Aufgabenabschluss",
                "strengths": "Stärken",
                "improvements": "Verbesserungsbereiche",
                "recommendations": "Empfehlungen",
                "excellent": "Ausgezeichnet! Sie haben dieses Szenario gemeistert.",
                "good": "Gute Arbeit! Bereit für die nächste Herausforderung.",
                "completed": "Szenario abgeschlossen! Überlegen Sie, zu wiederholen für eine höhere Punktzahl.",
                "no_strengths": "Üben Sie weiter und verbessern Sie sich",
                "no_weaknesses": "Keine größeren Probleme, machen Sie weiter so",
                "minutes": "Minuten",
            },
            "Korean": {
                "title": "【{scenario_title}】연습 요약",
                "overview": "연습 개요",
                "completion_time": "완료 시간",
                "interactions": "대화 횟수",
                "avg_score": "종합 평가",
                "tasks": "과제 완료 현황",
                "strengths": "잘한 점",
                "improvements": "개선할 점",
                "recommendations": "추천 사항",
                "excellent": "훌륭합니다! 이 시나리오를 마스터했습니다.",
                "good": "잘했습니다! 다음 시나리오에 도전하세요.",
                "completed": "시나리오 완료! 더 높은 점수를 위해 복습하세요.",
                "no_strengths": "계속 연습하여 실력을 키우세요",
                "no_weaknesses": "큰 문제 없음, 계속 유지하세요",
                "minutes": "분",
            },
            "Portuguese": {
                "title": "Resumo da prática: {scenario_title}",
                "overview": "Visão geral",
                "completion_time": "Tempo de conclusão",
                "interactions": "Interações",
                "avg_score": "Pontuação média",
                "tasks": "Conclusão de tarefas",
                "strengths": "Pontos fortes",
                "improvements": "Áreas a melhorar",
                "recommendations": "Recomendações",
                "excellent": "Excelente! Você dominou este cenário.",
                "good": "Bom trabalho! Pronto para o próximo desafio.",
                "completed": "Cenário concluído! Considere revisar para uma pontuação mais alta.",
                "no_strengths": "Continue praticando e melhorando",
                "no_weaknesses": "Sem problemas importantes, continue assim",
                "minutes": "minutos",
            },
            "Russian": {
                "title": "Обзор практики: {scenario_title}",
                "overview": "Общий обзор",
                "completion_time": "Время завершения",
                "interactions": "Взаимодействия",
                "avg_score": "Средний балл",
                "tasks": "Выполнение заданий",
                "strengths": "Сильные стороны",
                "improvements": "Области для улучшения",
                "recommendations": "Рекомендации",
                "excellent": "Отлично! Вы освоили этот сценарий.",
                "good": "Хорошая работа! Готовы к следующему испытанию.",
                "completed": "Сценарий завершён! Рассмотрите возможность повторения для более высокого балла.",
                "no_strengths": "Продолжайте практиковаться и совершенствоваться",
                "no_weaknesses": "Нет серьёзных проблем, продолжайте в том же духе",
                "minutes": "минут",
            },
            "Italian": {
                "title": "Riepilogo pratica: {scenario_title}",
                "overview": "Panoramica",
                "completion_time": "Tempo di completamento",
                "interactions": "Interazioni",
                "avg_score": "Punteggio medio",
                "tasks": "Completamento attività",
                "strengths": "Punti di forza",
                "improvements": "Aree da migliorare",
                "recommendations": "Raccomandazioni",
                "excellent": "Eccellente! Hai padroneggiato questo scenario.",
                "good": "Ottimo lavoro! Pronto per la prossima sfida.",
                "completed": "Scenario completato! Considera di ripassare per un punteggio più alto.",
                "no_strengths": "Continua a praticare e migliorare",
                "no_weaknesses": "Nessun problema importante, continua così",
                "minutes": "minuti",
            },
            "Arabic": {
                "title": "ملخص التمرين: {scenario_title}",
                "overview": "نظرة عامة",
                "completion_time": "وقت الإنجاز",
                "interactions": "التفاعلات",
                "avg_score": "الدرجة المتوسطة",
                "tasks": "إنجاز المهام",
                "strengths": "نقاط القوة",
                "improvements": "مجالات التحسين",
                "recommendations": "التوصيات",
                "excellent": "ممتاز! لقد أتقنت هذا السيناريو.",
                "good": "عمل جيد! جاهز للتحدي التالي.",
                "completed": "اكتمل السيناريو! فكر في المراجعة للحصول على درجة أعلى.",
                "no_strengths": "استمر في الممارسة والتحسن",
                "no_weaknesses": "لا توجد مشاكل كبيرة، استمر على هذا النحو",
                "minutes": "دقيقة",
            },
            "Hindi": {
                "title": "अभ्यास सारांश: {scenario_title}",
                "overview": "सामान्य अवलोकन",
                "completion_time": "पूरा करने का समय",
                "interactions": "इंटरैक्शन",
                "avg_score": "औसत स्कोर",
                "tasks": "कार्य पूर्णता",
                "strengths": "ताकत",
                "improvements": "सुधार के क्षेत्र",
                "recommendations": "सुझाव",
                "excellent": "उत्कृष्ट! आपने इस परिदृश्य में महारत हासिल कर ली है।",
                "good": "अच्छा काम! अगली चुनौती के लिए तैयार।",
                "completed": "परिदृश्य पूरा हुआ! उच्च स्कोर के लिए पुनरावृत्ति पर विचार करें।",
                "no_strengths": "अभ्यास जारी रखें और सुधार करें",
                "no_weaknesses": "कोई बड़ी समस्या नहीं, ऐसे ही जारी रखें",
                "minutes": "मिनट",
            },
            "Thai": {
                "title": "สรุปการฝึกซ้อม: {scenario_title}",
                "overview": "ภาพรวม",
                "completion_time": "เวลาที่ใช้",
                "interactions": "การโต้ตอบ",
                "avg_score": "คะแนนเฉลี่ย",
                "tasks": "การทำงานที่เสร็จสิ้น",
                "strengths": "จุดเด่น",
                "improvements": "จุดที่ต้องปรับปรุง",
                "recommendations": "คำแนะนำ",
                "excellent": "ยอดเยี่ยม! คุณเชี่ยวชาญสถานการณ์นี้แล้ว",
                "good": "ทำได้ดี! พร้อมสำหรับความท้าทายถัดไป",
                "completed": "สถานการณ์เสร็จสมบูรณ์! พิจารณาทบทวนเพื่อคะแนนที่สูงขึ้น",
                "no_strengths": "ฝึกฝนต่อไปและพัฒนาขึ้น",
                "no_weaknesses": "ไม่มีปัญหาร้ายแรง ทำต่อไป",
                "minutes": "นาที",
            },
            "Vietnamese": {
                "title": "Tóm tắt luyện tập: {scenario_title}",
                "overview": "Tổng quan",
                "completion_time": "Thời gian hoàn thành",
                "interactions": "Tương tác",
                "avg_score": "Điểm trung bình",
                "tasks": "Hoàn thành nhiệm vụ",
                "strengths": "Điểm mạnh",
                "improvements": "Cần cải thiện",
                "recommendations": "Đề xuất",
                "excellent": "Xuất sắc! Bạn đã thành thạo tình huống này.",
                "good": "Làm tốt! Sẵn sàng cho thử thách tiếp theo.",
                "completed": "Hoàn thành tình huống! Hãy xem xét ôn tập để đạt điểm cao hơn.",
                "no_strengths": "Tiếp tục luyện tập và cải thiện",
                "no_weaknesses": "Không có vấn đề lớn, tiếp tục như vậy",
                "minutes": "phút",
            },
            "Indonesian": {
                "title": "Ringkasan Latihan: {scenario_title}",
                "overview": "Ikhtisar",
                "completion_time": "Waktu Penyelesaian",
                "interactions": "Interaksi",
                "avg_score": "Skor Rata-rata",
                "tasks": "Penyelesaian Tugas",
                "strengths": "Kekuatan",
                "improvements": "Area yang Perlu Ditingkatkan",
                "recommendations": "Rekomendasi",
                "excellent": "Sangat bagus! Anda telah menguasai skenario ini.",
                "good": "Kerja bagus! Siap untuk tantangan berikutnya.",
                "completed": "Skenario selesai! Pertimbangkan untuk meninjau kembali untuk skor yang lebih tinggi.",
                "no_strengths": "Terus berlatih dan meningkat",
                "no_weaknesses": "Tidak ada masalah besar, teruskan seperti ini",
                "minutes": "menit",
            },
        }

    def _get_template(self, native_language: str) -> Dict[str, str]:
        """获取指定语言的模板"""
        return self.language_templates.get(native_language, self.language_templates["English"])
    
    def _build_review_template(self) -> str:
        """构建复盘报告模板 - 简洁中文版本"""
        return """【{scenario_title}】练习总结

练习概况
- 完成时间：{completion_time}
- 对话轮数：{total_interactions}
- 综合评分：{avg_score}/10

任务完成情况
{task_breakdown}

表现亮点
{strengths}

待提升方面
{improvements}

针对性建议
{recommendations}

{achievement_message}
"""
    
    @staticmethod
    def _heuristic_detail_scores(analysis: Dict[str, Any]) -> Dict[str, int]:
        """Conservative 0-100 scores when LLM is unavailable.

        Derived from existing heuristic fields so the response shape stays stable.
        Intentionally capped below 90 — the LLM path is the canonical source of truth.
        """
        vocab_diversity = analysis.get("vocabulary_diversity", 0) or 0
        avg_len = analysis.get("avg_message_length", 0) or 0
        grammar_errors = analysis.get("grammar_errors", 0) or 0
        user_msgs = analysis.get("user_messages", 0) or 0

        # Baseline 60, adjusted by signals. Cap at 85 (LLM path can go higher).
        def _clamp(x): return max(30, min(85, int(x)))
        fluency = _clamp(50 + min(avg_len, 20) * 1.5)          # up to 80
        vocabulary = _clamp(40 + vocab_diversity * 70)          # up to 85 @ diversity ≥0.64
        grammar = _clamp(80 - grammar_errors * 10)              # -10 per error
        pronunciation = _clamp(55 + min(user_msgs, 10) * 2)     # participation proxy
        return {
            "pronunciation": pronunciation,
            "fluency": fluency,
            "intonation": (fluency + vocabulary) // 2,
            "vocabulary": vocabulary,
        }

    async def _llm_deep_evaluate(
        self,
        scenario_title: str,
        completed_tasks: List[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]],
        native_language: str = "English",
    ) -> Optional[Dict[str, Any]]:
        """Strict LLM evaluation of the entire scenario conversation.

        Returns 4-dimension scores (0-100) reflecting ACTUAL conversation quality —
        penalizes abstract filler, numeric parroting, off-task answers. Replaces the
        old DB-cumulative `user_tasks.score` path that always returned ~100/100.
        """
        api_key = os.getenv("QWEN3_OMNI_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
        if not api_key:
            logger.warning("[SCENARIO_REVIEW] No API key for deep evaluation, skipping")
            return None

        user_turns = [
            m.get("content", "").strip()
            for m in conversation_history
            if m.get("role") == "user" and m.get("content", "").strip()
        ]
        if not user_turns:
            return None

        tasks_text = "\n".join(
            f"- {t.get('task_description', t.get('text', ''))}"
            for t in completed_tasks
        ) or "- (tasks completed)"
        convo_text = "\n".join(f"Turn {i+1}: {t}" for i, t in enumerate(user_turns[-20:]))

        prompt = f"""You are a strict oral-language evaluator. Score a student's full-scenario conversation on 4 dimensions, each 0-100.

Scenario: "{scenario_title}"
Tasks the student was supposed to complete:
{tasks_text}

Student's actual turns (most recent, up to 20):
{convo_text}

## Dimensions (0-100 each)
- pronunciation: clarity, accuracy of sounds (infer from fluency markers / self-corrections)
- fluency: sentence completeness, connectors, avoidance of fragments
- intonation: natural sentence flow, appropriate hedges/particles
- vocabulary: task-relevant word choice, variety, avoidance of abstract filler

## STRICT SCORING RULES
- If the student used **numbers-as-words** (e.g. "七七六六零", "one two three"), abstract filler ("积极努力", "be positive"), or clearly irrelevant content → cap ALL 4 dimensions at 50.
- If turns are mostly single words or < 3 words → cap fluency at 40.
- If fewer than half the required task keywords appear → cap vocabulary at 50.
- If responses are well-formed, on-task, and use task keywords → 70-90 is normal; 90-100 only for truly excellent performance.
- DO NOT default to 90+. Average performance is 60-75.

## Output — strict JSON, no markdown fences
{{
  "pronunciation": 0-100,
  "fluency": 0-100,
  "intonation": 0-100,
  "vocabulary": 0-100,
  "overall_score": 0-100,
  "stars": 1-5,
  "reason": "<one-sentence justification in {native_language}>"
}}"""

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                resp = await client.post(
                    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "qwen-turbo",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                        "max_tokens": 300,
                    },
                )
                if resp.status_code != 200:
                    logger.warning(
                        f"[SCENARIO_REVIEW] deep-eval LLM error {resp.status_code}: {resp.text[:200]}"
                    )
                    return None
                content = resp.json()["choices"][0]["message"]["content"].strip()
                content = re.sub(r"^```json\s*|\s*```$", "", content, flags=re.DOTALL).strip()
                parsed = json.loads(content)
            # Clamp and normalize
            def _clamp(x, lo, hi):
                try:
                    v = int(round(float(x)))
                except (TypeError, ValueError):
                    return lo
                return max(lo, min(hi, v))
            scores = {
                "pronunciation": _clamp(parsed.get("pronunciation", 0), 0, 100),
                "fluency": _clamp(parsed.get("fluency", 0), 0, 100),
                "intonation": _clamp(parsed.get("intonation", 0), 0, 100),
                "vocabulary": _clamp(parsed.get("vocabulary", 0), 0, 100),
            }
            overall = parsed.get("overall_score")
            if overall is None:
                overall = sum(scores.values()) // 4
            overall = _clamp(overall, 0, 100)
            stars = parsed.get("stars")
            if stars is None:
                stars = max(1, min(5, round(overall / 20)))
            else:
                stars = _clamp(stars, 1, 5)
            return {
                "detail_scores": scores,
                "overall_score": overall,
                "stars": stars,
                "reason": str(parsed.get("reason", "")).strip(),
            }
        except Exception as e:
            logger.warning(f"[SCENARIO_REVIEW] deep-eval failed: {e}")
            return None

    async def _generate_ai_feedback(
        self,
        scenario_title: str,
        completed_tasks: List[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]],
        native_language: str = "English"
    ) -> Optional[Dict[str, str]]:
        """
        Call DashScope text LLM to generate personalized, scenario-specific feedback.
        Returns {"summary": str, "recommendation": str} or None on failure.
        """
        api_key = os.getenv("QWEN3_OMNI_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
        if not api_key:
            logger.warning("[SCENARIO_REVIEW] No API key for AI feedback, using template fallback")
            return None

        # Build a concise conversation excerpt (user turns only, last 12)
        user_turns = [
            m.get("content", "").strip()
            for m in conversation_history
            if m.get("role") == "user" and m.get("content", "").strip()
        ][-12:]

        if not user_turns:
            return None

        # Defense-in-depth: with <3 real user turns there is no meaningful
        # signal for the LLM to critique. Skip the call to save latency/tokens.
        if len(user_turns) < 3:
            logger.info(
                f"[SCENARIO_REVIEW] _generate_ai_feedback skipped: only {len(user_turns)} user turns"
            )
            return None

        tasks_text = "\n".join(
            f"- {t.get('task_description', t.get('text', ''))}"
            for t in completed_tasks
        ) or "- (tasks completed)"

        conversation_text = "\n".join(f"Student: {t}" for t in user_turns)

        prompt = f"""You are an expert oral English coach reviewing a student's practice session.

Scenario: "{scenario_title}"
Tasks the student completed:
{tasks_text}

Student's actual responses (selected):
{conversation_text}

Student's native language: {native_language}

Write a short, personalized performance review in {native_language}. Requirements:
- 2 sentences max for summary: mention something SPECIFIC from what they actually said
- 1 sentence for recommendation: give ONE concrete, scenario-specific improvement tip (e.g. a phrase they could have used, a topic they avoided, a grammar pattern to practice)
- No emojis, no generic praise, no filler
- Respond ONLY with valid JSON, no extra text:
{{"summary": "...", "recommendation": "..."}}"""

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "qwen-turbo",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.7,
                        "max_tokens": 200,
                    },
                )
                if resp.status_code == 200:
                    content = resp.json()["choices"][0]["message"]["content"].strip()
                    # Strip markdown code fences if present
                    content = re.sub(r"^```json\s*|\s*```$", "", content, flags=re.DOTALL).strip()
                    parsed = json.loads(content)
                    summary = parsed.get("summary", "").strip()
                    recommendation = parsed.get("recommendation", "").strip()
                    if summary and recommendation:
                        logger.info(f"[SCENARIO_REVIEW] AI feedback generated successfully")
                        return {"summary": summary, "recommendation": recommendation}
                else:
                    logger.warning(f"[SCENARIO_REVIEW] LLM API error {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"[SCENARIO_REVIEW] AI feedback failed: {e}, falling back to template")

        return None

    async def generate_scenario_review(
        self,
        user_id: str,
        goal_id: int,
        scenario_title: str,
        completed_tasks: List[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]],
        db_connection: Any,
        native_language: str = "English"
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
            native_language: 用户母语，用于生成对应语言的反馈

        Returns:
            包含复盘报告、建议等信息
        """
        # 分析对话历史
        analysis = await self._analyze_scenario_conversation(
            conversation_history,
            completed_tasks,
            native_language
        )

        # Guard: require >=3 real user turns for meaningful evaluation.
        # Below that, skip both deep LLM eval and heuristic scoring; return a
        # flat-40 placeholder with sufficient=False so the UI can flag the user.
        _real_user_turns = [
            m for m in conversation_history
            if m.get("role") == "user" and (m.get("content") or "").strip()
        ]
        if len(_real_user_turns) < 3:
            logger.warning(
                f"[SCENARIO_REVIEW] Insufficient practice: only {len(_real_user_turns)} user turns "
                f"(<3) for scenario '{scenario_title}'. Returning placeholder report."
            )
            analysis["sufficient"] = False
            analysis["user_turn_count"] = len(_real_user_turns)
            analysis["detail_scores"] = {
                "pronunciation": 40,
                "fluency": 40,
                "intonation": 40,
                "vocabulary": 40,
            }
            analysis["overall_score"] = 40
            analysis["stars"] = 2
            analysis["summary"] = "本场景练习数据不足，建议完整完成 3 个子任务后再查看报告。"
            analysis["strengths"] = []
            analysis["areas_to_improve"] = ["需要进行至少 3 轮完整对话以生成有意义的评估"]

            placeholder_report = analysis["summary"]
            placeholder_recs = ["完整完成 3 个子任务后再生成详细复盘报告"]

            await self._save_review_to_db(
                user_id=user_id,
                goal_id=goal_id,
                scenario_title=scenario_title,
                review_report=placeholder_report,
                recommendations=placeholder_recs,
                analysis=analysis,
                db_connection=db_connection
            )

            return {
                "workflow": "scenario_review",
                "scenario_title": scenario_title,
                "review_report": placeholder_report,
                "recommendations": placeholder_recs,
                "analysis": analysis,
                "all_scenarios_completed": False,
                "sufficient": False,
                "reason": "insufficient_practice",
            }

        analysis["sufficient"] = True

        # LLM 深度评估：基于实际对话生成 4 维度 0-100 分
        # （替代原来读 user_tasks.score 累积值 → 避免"满分 bug"）
        deep_eval = await self._llm_deep_evaluate(
            scenario_title,
            completed_tasks,
            conversation_history,
            native_language,
        )
        if deep_eval:
            analysis["detail_scores"] = deep_eval["detail_scores"]
            analysis["overall_score"] = deep_eval["overall_score"]
            analysis["stars"] = deep_eval["stars"]
            if deep_eval.get("reason"):
                analysis["eval_reason"] = deep_eval["reason"]
            logger.info(
                f"[SCENARIO_REVIEW] deep-eval scores={deep_eval['detail_scores']} "
                f"overall={deep_eval['overall_score']} stars={deep_eval['stars']}"
            )
        else:
            # Fallback: derive conservative scores from existing heuristics so the
            # payload always contains detail_scores (frontend depends on this shape).
            analysis["detail_scores"] = self._heuristic_detail_scores(analysis)
            analysis["overall_score"] = sum(analysis["detail_scores"].values()) // 4
            analysis["stars"] = max(1, min(5, round(analysis["overall_score"] / 20)))
            logger.info(
                f"[SCENARIO_REVIEW] heuristic scores (no LLM)={analysis['detail_scores']} "
                f"overall={analysis['overall_score']}"
            )

        # 尝试用 LLM 生成个性化点评（基于实际对话内容）
        ai_feedback = await self._generate_ai_feedback(
            scenario_title,
            completed_tasks,
            conversation_history,
            native_language
        )

        if ai_feedback:
            # Replace template-generated summary and lead recommendation with AI output
            analysis["summary"] = ai_feedback["summary"]
            logger.info(f"[SCENARIO_REVIEW] Using AI-generated summary: {ai_feedback['summary'][:80]}...")

        # 生成复盘报告（根据用户母语）
        review_report = self._generate_review_report(
            scenario_title,
            completed_tasks,
            analysis,
            native_language
        )

        # 生成改进建议（根据用户母语）
        recommendations = self._generate_recommendations(analysis, conversation_history, native_language)

        # Override first recommendation with AI-generated one if available
        if ai_feedback and ai_feedback.get("recommendation"):
            recommendations = [ai_feedback["recommendation"]] + (recommendations[1:] if len(recommendations) > 1 else [])

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
        completed_tasks: List[Dict[str, Any]],
        native_language: str = "English"
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
            "weaknesses": [],
            "summary": ""  # 添加总结字段
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
                analysis["strengths"].append("词汇丰富多样")
            elif analysis["vocabulary_diversity"] < 0.3:
                analysis["weaknesses"].append("词汇量有待扩展")

            if analysis["avg_message_length"] > 15:
                analysis["strengths"].append("回答详细完整")
            elif analysis["avg_message_length"] < 5:
                analysis["weaknesses"].append("回答过于简短")

            if analysis["grammar_errors"] == 0:
                analysis["strengths"].append("语法准确无误")
            elif analysis["grammar_errors"] > 3:
                analysis["weaknesses"].append("语法错误较多")
        
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

        # 生成总结（语言感知，无表情符号）
        if analysis["user_messages"] > 0:
            avg_score = sum(t.get("score", 0) for t in completed_tasks) / len(completed_tasks) if completed_tasks else 0
            n = len(completed_tasks)
            turns = analysis["user_messages"]
            fluent = analysis["vocabulary_diversity"] > 0.5
            short = analysis["avg_message_length"] < 10

            # 各语言的 summary 模板：(excellent, excellent_extra_fluent, excellent_extra_vocab,
            #                          good, good_extra_short, good_extra_long,
            #                          basic, basic_extra)
            # NOTE: avg_score is a cumulative task score (0-3 pts per interaction, completion threshold=9).
            # Do NOT display the raw number — branch selection is correct but the value is not a /10 rating.
            _summary_t = {
                "Chinese":    ("表现出色！共 {turns} 轮对话，完成 {n} 个任务。",
                               "表达流利自然，词汇使用准确。", "建议继续扩展词汇量。",
                               "表现良好！共 {turns} 轮对话，完成 {n} 个任务。",
                               "表达清晰，可继续练习复杂句型。", "保持当前的表达水平。",
                               "场景完成！共 {turns} 轮对话，建议重新练习以获得更好的效果。",
                               "尝试使用更多连接词和完整句子。"),
                "English":    ("Great work! {turns} exchanges, {n} tasks completed.",
                               "Your speech is fluent and vocabulary accurate.", "Keep expanding your vocabulary.",
                               "Well done! {turns} exchanges, {n} tasks completed.",
                               "Clear expression — try practicing more complex sentences.", "Keep up your current expression level.",
                               "Scenario complete! {turns} exchanges. Try again for a better result.",
                               "Use more connectors and complete sentences."),
                "Japanese":   ("素晴らしい！{turns} 回の対話、{n} タスク完了。",
                               "表現が流暢で語彙の使い方も正確です。", "引き続き語彙を広げてください。",
                               "よくできました！{turns} 回の対話、{n} タスク完了。",
                               "明確な表現 — より複雑な文型を練習しましょう。", "現在の表現レベルを維持してください。",
                               "シナリオ完了！{turns} 回の対話。より良い結果を目指して再挑戦しましょう。",
                               "接続詞と完全な文をもっと使いましょう。"),
                "Spanish":    ("¡Excelente! {turns} intercambios, {n} tareas completadas.",
                               "Tu expresión es fluida y el vocabulario es preciso.", "Sigue ampliando tu vocabulario.",
                               "¡Bien hecho! {turns} intercambios, {n} tareas completadas.",
                               "Expresión clara — practica frases más complejas.", "Mantén tu nivel actual de expresión.",
                               "¡Escenario completado! {turns} intercambios. Inténtalo de nuevo para mejorar.",
                               "Usa más conectores y oraciones completas."),
                "French":     ("Excellent ! {turns} échanges, {n} tâches accomplies.",
                               "Votre expression est fluide et le vocabulaire précis.", "Continuez à élargir votre vocabulaire.",
                               "Bien joué ! {turns} échanges, {n} tâches accomplies.",
                               "Expression claire — entraînez-vous sur des phrases plus complexes.", "Maintenez votre niveau actuel.",
                               "Scénario terminé ! {turns} échanges. Réessayez pour un meilleur résultat.",
                               "Utilisez plus de connecteurs et de phrases complètes."),
                "Korean":     ("훌륭합니다! {turns}번의 대화, {n}개 작업 완료.",
                               "표현이 유창하고 어휘 사용이 정확합니다.", "계속해서 어휘를 확장하세요.",
                               "잘 했습니다! {turns}번의 대화, {n}개 작업 완료.",
                               "명확한 표현 — 더 복잡한 문장을 연습하세요.", "현재 표현 수준을 유지하세요.",
                               "시나리오 완료! {turns}번의 대화. 더 나은 결과를 위해 다시 도전하세요.",
                               "연결어와 완전한 문장을 더 많이 사용하세요."),
            }
            t = _summary_t.get(native_language, _summary_t["English"])

            if avg_score >= 9:
                analysis["summary"] = t[0].format(turns=turns, n=n) + (t[1] if fluent else t[2])
            elif avg_score >= 7:
                analysis["summary"] = t[3].format(turns=turns, n=n) + (t[4] if short else t[5])
            else:
                analysis["summary"] = t[6].format(turns=turns, n=n) + (t[7] if analysis["avg_message_length"] < 8 else "")

        return analysis
    
    def _generate_review_report(
        self,
        scenario_title: str,
        completed_tasks: List[Dict[str, Any]],
        analysis: Dict[str, Any],
        native_language: str = "English"
    ) -> str:
        """生成复盘报告（支持多语言）"""
        # 获取语言模板
        lang = self._get_template(native_language)
        
        # 计算平均分
        task_scores = [task.get("score", 0) for task in completed_tasks]
        avg_score = sum(task_scores) / len(task_scores) if task_scores else 0

        # 生成任务分解（score 是累计积分，用完成状态代替原始数值显示）
        task_breakdown = ""
        for i, task in enumerate(completed_tasks, 1):
            task_name = task.get("task_description", f"{lang['tasks']} {i}")
            task_breakdown += f"- {lang['tasks']}{i}：{task_name[:30]}...\n"

        # 生成优点列表
        strengths_list = analysis.get("strengths", [])
        if not strengths_list:
            strengths_list = [lang["no_strengths"]]
        strengths = "\n".join(f"- {s}" for s in strengths_list)

        # 生成改进点
        weaknesses_list = analysis.get("weaknesses", [])
        if not weaknesses_list:
            weaknesses_list = [lang["no_weaknesses"]]
        improvements = "\n".join(f"- {w}" for w in weaknesses_list)

        # 生成成就信息（根据语言）
        if avg_score >= 9:
            achievement = lang["excellent"]
        elif avg_score >= 7:
            achievement = lang["good"]
        else:
            achievement = lang["completed"]

        # 构建报告（使用语言模板）
        report = f"""{lang['title'].format(scenario_title=scenario_title)}

{lang['overview']}
- {lang['completion_time']}：{analysis.get('completion_time_minutes', 0)} {lang['minutes']}
- {lang['interactions']}：{analysis.get('user_messages', 0)}

{lang['tasks']}
{task_breakdown}

{lang['strengths']}
{strengths}

{lang['improvements']}
{improvements}

{lang['recommendations']}
（见下方建议列表）

{achievement}
"""

        return report
    
    def _generate_recommendations(self, analysis: Dict[str, Any], conversation_history: List[Dict[str, Any]] = None, native_language: str = "English") -> List[str]:
        """生成针对性建议 - 基于统计分析和实际对话内容（支持多语言）"""
        # 多语言建议模板 - 支持15种语言
        recommendation_templates = {
            "Chinese": {
                "vocab": "尝试学习更多本场景相关的高级词汇，并在对话中主动使用",
                "length": "尝试给出更长、更详细的回答，使用'because'、'for example'、'I think'等连接词",
                "grammar": "注意主谓一致和时态使用，建议复习一般现在时和过去时的用法",
                "interaction": "尝试提出更多后续问题，分享更多个人细节和感受，让对话更自然流畅",
                "connectors": "多使用'and', 'but', 'because', 'however'等连接词，让句子更连贯自然",
                "complete_sentences": "尝试用完整句子回答，而不是单词或短语，例如：'Yes, I think...' 而不是 'Yes'",
                "questions": "尝试主动提问，如'Can you tell me...?', 'What do you think about...?'，让对话更互动",
                "default": "表现出色！你的表达流畅自然，词汇使用准确，建议继续练习更复杂的句型结构",
            },
            "English": {
                "vocab": "Try to learn more advanced vocabulary related to this scenario and use them actively in conversations",
                "length": "Try to give longer, more detailed responses using connectors like 'because', 'for example', 'I think'",
                "grammar": "Pay attention to subject-verb agreement and tense usage. Review simple present and past tenses",
                "interaction": "Try to ask more follow-up questions and share more personal details to make the conversation flow naturally",
                "connectors": "Use more connectors like 'and', 'but', 'because', 'however' to make your sentences more coherent",
                "complete_sentences": "Try to answer in complete sentences rather than single words or phrases, e.g., 'Yes, I think...' instead of just 'Yes'",
                "questions": "Try to ask questions proactively like 'Can you tell me...?', 'What do you think about...?' to make the conversation more interactive",
                "default": "Excellent performance! Your expression is fluent and natural with accurate vocabulary usage. Continue practicing more complex sentence structures",
            },
            "Japanese": {
                "vocab": "このシナリオに関連するより高度な語彙を学び、会話で積極的に使用してみましょう",
                "length": "'because'、'for example'、'I think'などの接続詞を使って、より長く詳細な回答を心がけましょう",
                "grammar": "主語と動詞の一致、時制の使い方に注意してください。現在形と過去形の復習をお勧めします",
                "interaction": "より多くのフォローアップ質問をし、個人的な詳細や感想を共有して、会話をより自然にしましょう",
                "connectors": "'and'、'but'、'because'、'however'などの接続詞を多く使い、文をより一貫性のあるものにしましょう",
                "complete_sentences": "単語や短句ではなく、完全な文で答えるようにしましょう。例：'Yes'ではなく'Yes, I think...'",
                "questions": "'Can you tell me...?'、'What do you think about...?'などの質問を積極的にして、会話をより対話的にしましょう",
                "default": "素晴らしいパフォーマンスです！表現が流暢で自然で、語彙の使い方も正確です。より複雑な文構造の練習を続けましょう",
            },
            "Spanish": {
                "vocab": "Intenta aprender más vocabulario avanzado relacionado con este escenario y úsalo activamente en las conversaciones",
                "length": "Intenta dar respuestas más largas y detalladas usando conectores como 'because', 'for example', 'I think'",
                "grammar": "Presta atención a la concordancia sujeto-verbo y al uso de los tiempos. Revisa los tiempos simples presente y pasado",
                "interaction": "Intenta hacer más preguntas de seguimiento y compartir más detalles personales para que la conversación fluya naturalmente",
                "connectors": "Usa más conectores como 'and', 'but', 'because', 'however' para hacer tus oraciones más coherentes",
                "complete_sentences": "Intenta responder en oraciones completas en lugar de palabras o frases sueltas, p. ej., 'Yes, I think...' en lugar de solo 'Yes'",
                "questions": "Intenta hacer preguntas proactivamente como 'Can you tell me...?', 'What do you think about...?' para hacer la conversación más interactiva",
                "default": "¡Excelente desempeño! Tu expresión es fluida y natural con uso preciso del vocabulario. Continúa practicando estructuras de oraciones más complejas",
            },
            "French": {
                "vocab": "Essayez d'apprendre plus de vocabulaire avancé lié à ce scénario et utilisez-le activement dans les conversations",
                "length": "Essayez de donner des réponses plus longues et détaillées en utilisant des connecteurs comme 'because', 'for example', 'I think'",
                "grammar": "Faites attention à l'accord sujet-verbe et à l'utilisation des temps. Révisez les temps simples présent et passé",
                "interaction": "Essayez de poser plus de questions de suivi et de partager plus de détails personnels pour que la conversation se déroule naturellement",
                "connectors": "Utilisez plus de connecteurs comme 'and', 'but', 'because', 'however' pour rendre vos phrases plus cohérentes",
                "complete_sentences": "Essayez de répondre en phrases complètes plutôt qu'en mots ou phrases isolés, par ex. 'Yes, I think...' au lieu de simplement 'Yes'",
                "questions": "Essayez de poser des questions de manière proactive comme 'Can you tell me...?', 'What do you think about...?' pour rendre la conversation plus interactive",
                "default": "Excellente performance! Votre expression est fluide et naturelle avec une utilisation précise du vocabulaire. Continuez à pratiquer des structures de phrases plus complexes",
            },
            "German": {
                "vocab": "Versuchen Sie, mehr fortgeschrittenen Wortschatz zu lernen, der mit diesem Szenario zusammenhängt, und verwenden Sie ihn aktiv in Gesprächen",
                "length": "Versuchen Sie, längere, detailliertere Antworten zu geben, indem Sie Konnektoren wie 'because', 'for example', 'I think' verwenden",
                "grammar": "Achten Sie auf die Subjekt-Verb-Übereinstimmung und die Zeitformen. Überprüfen Sie die einfachen Gegenwarts- und Vergangenheitszeiten",
                "interaction": "Versuchen Sie, mehr Folgefragen zu stellen und mehr persönliche Details zu teilen, damit das Gespräch natürlich verläuft",
                "connectors": "Verwenden Sie mehr Konnektoren wie 'and', 'but', 'because', 'however', um Ihre Sätze kohärenter zu machen",
                "complete_sentences": "Versuchen Sie, in vollständigen Sätzen zu antworten, anstatt in einzelnen Wörtern oder Phrasen, z.B. 'Yes, I think...' statt nur 'Yes'",
                "questions": "Versuchen Sie, proaktiv Fragen zu stellen wie 'Can you tell me...?', 'What do you think about...?', um das Gespräch interaktiver zu gestalten",
                "default": "Ausgezeichnete Leistung! Ihr Ausdruck ist flüssig und natürlich mit präziser Verwendung des Wortschatzes. Üben Sie weiter komplexere Satzstrukturen",
            },
            "Korean": {
                "vocab": "이 시나리오와 관련된 더 고급 어휘를 배우고 대화에서 적극적으로 사용해 보세요",
                "length": "'because', 'for example', 'I think' 등의 접속사를 사용하여 더 길고 자세한 답변을 해보세요",
                "grammar": "주어와 동사의 일치 및 시제 사용에 주의하세요. 일반 현재시제와 과거시제를 복습하세요",
                "interaction": "더 많은 후속 질문을 하고 더 많은 개인적인 세부 정보와 감정을 공유하여 대화가 자연스럽게 흘러가도록 해보세요",
                "connectors": "'and', 'but', 'because', 'however' 등의 접속사를 더 많이 사용하여 문장을 더 일관되게 만드세요",
                "complete_sentences": "단어나 구문이 아닌 완전한 문장으로 답변하세요. 예: 'Yes' 대신 'Yes, I think...'",
                "questions": "'Can you tell me...?', 'What do you think about...?'와 같은 질문을 적극적으로 하여 대화를 더 상호작용적으로 만드세요",
                "default": "훌륭한 성과입니다! 표현이 유창하고 자연스럽으며 어휘 사용이 정확합니다. 더 복잡한 문장 구조를 계속 연습하세요",
            },
            "Portuguese": {
                "vocab": "Tente aprender mais vocabulário avançado relacionado a este cenário e use-o ativamente nas conversas",
                "length": "Tente dar respostas mais longas e detalhadas usando conectores como 'because', 'for example', 'I think'",
                "grammar": "Preste atenção à concordância sujeito-verbo e ao uso dos tempos. Revise os tempos simples presente e passado",
                "interaction": "Tente fazer mais perguntas de acompanhamento e compartilhar mais detalhes pessoais para fazer a conversa fluir naturalmente",
                "connectors": "Use mais conectores como 'and', 'but', 'because', 'however' para tornar suas frases mais coerentes",
                "complete_sentences": "Tente responder em frases completas em vez de palavras ou frases soltas, por ex. 'Yes, I think...' em vez de apenas 'Yes'",
                "questions": "Tente fazer perguntas proativamente como 'Can you tell me...?', 'What do you think about...?' para tornar a conversa mais interativa",
                "default": "Desempenho excelente! Sua expressão é fluente e natural com uso preciso do vocabulário. Continue praticando estruturas de frases mais complexas",
            },
            "Russian": {
                "vocab": "Попробуйте выучить больше продвинутой лексики, связанной с этим сценарием, и активно используйте её в разговорах",
                "length": "Попробуйте давать более длинные, детальные ответы, используя союзы типа 'because', 'for example', 'I think'",
                "grammar": "Обратите внимание на согласование подлежащего и сказуемого, а также на использование времён. Повторите простые настоящее и прошедшее время",
                "interaction": "Попробуйте задавать больше уточняющих вопросов и делиться более личными подробностями, чтобы разговор протекал естественно",
                "connectors": "Используйте больше союзов типа 'and', 'but', 'because', 'however', чтобы ваши предложения были более связными",
                "complete_sentences": "Попробуйте отвечать полными предложениями, а не отдельными словами или фразами, например, 'Yes, I think...' вместо просто 'Yes'",
                "questions": "Попробуйте задавать вопросы проактивно, например, 'Can you tell me...?', 'What do you think about...?', чтобы сделать разговор более интерактивным",
                "default": "Отличная работа! Ваше выражение мыслей плавное и естественное с точным использованием словарного запаса. Продолжайте практиковать более сложные структуры предложений",
            },
            "Italian": {
                "vocab": "Prova a imparare più vocabolario avanzato relativo a questo scenario e usalo attivamente nelle conversazioni",
                "length": "Prova a dare risposte più lunghe e dettagliate usando connettori come 'because', 'for example', 'I think'",
                "grammar": "Presta attenzione alla concordanza soggetto-verbo e all'uso dei tempi. Ripassa i tempi semplici presente e passato",
                "interaction": "Prova a fare più domande di approfondimento e a condividere più dettagli personali per far scorrere la conversazione naturalmente",
                "connectors": "Usa più connettori come 'and', 'but', 'because', 'however' per rendere le tue frasi più coerenti",
                "complete_sentences": "Prova a rispondere in frasi complete piuttosto che in parole o frasi isolate, ad es. 'Yes, I think...' invece di solo 'Yes'",
                "questions": "Prova a fare domande in modo proattivo come 'Can you tell me...?', 'What do you think about...?' per rendere la conversazione più interattiva",
                "default": "Eccellente prestazione! La tua espressione è fluida e naturale con un uso preciso del vocabolario. Continua a praticare strutture di frasi più complesse",
            },
            "Arabic": {
                "vocab": "حاول تعلم المزيد من المفردات المتقدمة المتعلقة بهذا السيناريو واستخدمها بنشاط في المحادثات",
                "length": "حاول إعطاء إجابات أطول وأكثر تفصيلاً باستخدام روابط مثل 'because', 'for example', 'I think'",
                "grammar": "انتبه إلى تطابق الفعل مع الفاعل واستخدام الأزمنة. راجع المضارع والماضي البسيطين",
                "interaction": "حاول طرح المزيد من الأسئلة المتابعة ومشاركة المزيد من التفاصيل الشخصية لجعل المحادثة تسير بشكل طبيعي",
                "connectors": "استخدم المزيد من الروابط مثل 'and', 'but', 'because', 'however' لجمل أكثر تماسكاً",
                "complete_sentences": "حاول الإجابة بجمل كاملة بدلاً من كلمات أو عبارات منفصلة، مثل 'Yes, I think...' بدلاً من 'Yes' فقط",
                "questions": "حاول طرح الأسئلة بشكل استباقي مثل 'Can you tell me...?', 'What do you think about...?' لجعل المحادثة أكثر تفاعلية",
                "default": "أداء ممتاز! تعبيرك سلس وطبيعي مع استخدام دقيق للمفردات. استمر في ممارسة هياكل الجمل الأكثر تعقيداً",
            },
            "Hindi": {
                "vocab": "इस परिदृश्य से संबंधित अधिक उन्नत शब्दावली सीखने का प्रयास करें और उन्हें बातचीत में सक्रिय रूप से उपयोग करें",
                "length": "'because', 'for example', 'I think' जैसे कनेक्टर्स का उपयोग करके अधिक लंबे, विस्तृत उत्तर देने का प्रयास करें",
                "grammar": "कर्ता-क्रिया के संबंध और काल के उपयोग पर ध्यान दें। सामान्य वर्तमान और भूतकाल का पुनरावृत्ति करें",
                "interaction": "अधिक अनुवर्ती प्रश्न पूछने और अधिक व्यक्तिगत विवरण साझा करने का प्रयास करें ताकि बातचीत स्वाभाविक रूप से बहे",
                "connectors": "अपने वाक्यों को अधिक सुसंगत बनाने के लिए 'and', 'but', 'because', 'however' जैसे अधिक कनेक्टर्स का उपयोग करें",
                "complete_sentences": "शब्दों या वाक्यांशों के बजाय पूर्ण वाक्यों में उत्तर देने का प्रयास करें, जैसे 'Yes' के बजाय 'Yes, I think...'",
                "questions": "बातचीत को अधिक इंटरैक्टिव बनाने के लिए 'Can you tell me...?', 'What do you think about...?' जैसे प्रश्न सक्रिय रूप से पूछने का प्रयास करें",
                "default": "उत्कृष्ट प्रदर्शन! आपका अभिव्यक्ति सहज और प्राकृतिक है, शब्दावली का सटीक उपयोग है। अधिक जटिल वाक्य संरचनाओं का अभ्यास जारी रखें",
            },
            "Thai": {
                "vocab": "พยายามเรียนรู้คำศัพท์ขั้นสูงเพิ่มเติมที่เกี่ยวข้องกับสถานการณ์นี้และใช้อย่างแข็งขันในการสนทนา",
                "length": "พยายามตอบให้ยาวและละเอียดขึ้นโดยใช้คำเชื่อมเช่น 'because', 'for example', 'I think'",
                "grammar": "ให้ความสนใจกับการสอดคล้องระหว่างประธอกับกริยาและการใช้กาล ทบทวนกาลปัจจุบันและอดีตอย่างง่าย",
                "interaction": "พยายามถามคำถามต่อเนื่องเพิ่มเติมและแบ่งปันรายละเอียดส่วนตัวมากขึ้นเพื่อให้การสนทนาไหลลื่นเป็นธรรมชาติ",
                "connectors": "ใช้คำเชื่อมเพิ่มขึ้นเช่น 'and', 'but', 'because', 'however' เพื่อให้ประโยคของคุณสอดคล้องกันมากขึ้น",
                "complete_sentences": "พยายามตอบเป็นประโยคสมบูรณ์แทนที่จะเป็นคำหรือวลีเดี่ยว เช่น 'Yes, I think...' แทนที่จะเป็นแค่ 'Yes'",
                "questions": "พยายามถามคำถามเชิงรุกเช่น 'Can you tell me...?', 'What do you think about...?' เพื่อให้การสนทนามีปฏิสัมพันธ์มากขึ้น",
                "default": "ผลงานยอดเยี่ยม! การแสดงออกของคุณคล่องแคล่วและเป็นธรรมชาติโดยใช้คำศัพท์อย่างถูกต้อง ฝึกฝนโครงสร้างประโยคที่ซับซ้อนขึ้นต่อไป",
            },
            "Vietnamese": {
                "vocab": "Hãy cố gắng học thêm từ vựng nâng cao liên quan đến tình huống này và sử dụng chúng một cách chủ động trong các cuộc trò chuyện",
                "length": "Hãy cố gắng đưa ra câu trả lời dài và chi tiết hơn bằng cách sử dụng các liên từ như 'because', 'for example', 'I think'",
                "grammar": "Chú ý đến sự hòa hợp giữa chủ ngữ và động từ cũng như cách sử dụng thì. Ôn tập thì hiện tại và quá khứ đơn",
                "interaction": "Hãy cố gắng đặt thêm câu hỏi tiếp theo và chia sẻ thêm chi tiết cá nhân để cuộc trò chuyện diễn ra tự nhiên",
                "connectors": "Sử dụng nhiều liên từ hơn như 'and', 'but', 'because', 'however' để câu của bạn mạch lạc hơn",
                "complete_sentences": "Hãy cố gắng trả lời bằng câu hoàn chỉnh thay vì từ hoặc cụm từ riêng lẻ, ví dụ: 'Yes, I think...' thay vì chỉ 'Yes'",
                "questions": "Hãy cố gắng đặt câu hỏi một cách chủ động như 'Can you tell me...?', 'What do you think about...?' để cuộc trò chuyện tương tác hơn",
                "default": "Hiệu suất xuất sắc! Cách diễn đạt của bạn trôi chảy và tự nhiên với việc sử dụng từ vựng chính xác. Tiếp tục luyện tập các cấu trúc câu phức tạp hơn",
            },
            "Indonesian": {
                "vocab": "Cobalah untuk mempelajari lebih banyak kosakata tingkat lanjut yang terkait dengan skenario ini dan gunakan secara aktif dalam percakapan",
                "length": "Cobalah untuk memberikan respons yang lebih panjang dan detail dengan menggunakan konektor seperti 'because', 'for example', 'I think'",
                "grammar": "Perhatikan kesesuaian subjek-kata kerja dan penggunaan kala. Tinjau kala sederhana sekarang dan lampau",
                "interaction": "Cobalah untuk mengajukan lebih banyak pertanyaan lanjutan dan membagikan lebih banyak detail pribadi agar percakapan berjalan secara alami",
                "connectors": "Gunakan lebih banyak konektor seperti 'and', 'but', 'because', 'however' untuk membuat kalimat Anda lebih koheren",
                "complete_sentences": "Cobalah untuk menjawab dalam kalimat lengkap daripada kata atau frasa tunggal, misalnya 'Yes, I think...' alih-alih hanya 'Yes'",
                "questions": "Cobalah untuk mengajukan pertanyaan secara proaktif seperti 'Can you tell me...?', 'What do you think about...?' untuk membuat percakapan lebih interaktif",
                "default": "Performa sangat baik! Ekspresi Anda lancar dan alami dengan penggunaan kosakata yang akurat. Terus berlatih struktur kalimat yang lebih kompleks",
            },
        }
        
        lang = recommendation_templates.get(native_language, recommendation_templates["English"])
        recommendations = []

        # 基于词汇多样性
        vocab_diversity = analysis.get("vocabulary_diversity", 0)
        if vocab_diversity < 0.4:
            recommendations.append(lang["vocab"])

        # 基于平均回复长度
        avg_length = analysis.get("avg_message_length", 0)
        if avg_length < 8:
            recommendations.append(lang["length"])

        # 基于语法错误
        grammar_errors = analysis.get("grammar_errors", 0)
        if grammar_errors > 2:
            recommendations.append(lang["grammar"])

        # 基于互动次数
        user_messages = analysis.get("user_messages", 0)
        if user_messages < 10:
            recommendations.append(lang["interaction"])

        # 分析实际对话内容，生成具体建议
        if conversation_history and len(conversation_history) > 0:
            user_msgs = [m for m in conversation_history if m.get("role") == "user"]

            # 检测是否使用连接词
            connectors = ['and', 'but', 'because', 'so', 'however', 'therefore', 'also', 'then', 'well', 'actually']
            connector_usage = 0
            for msg in user_msgs:
                content = msg.get("content", "").lower()
                if any(connector in content for connector in connectors):
                    connector_usage += 1

            if connector_usage < len(user_msgs) * 0.3:  # 少于 30% 的消息使用连接词
                recommendations.append(lang["connectors"])

            # 检测是否使用完整句子
            short_responses = 0
            for msg in user_msgs:
                content = msg.get("content", "").strip()
                # 检测是否为短语或单词（少于 3 个词且无动词）
                words = content.split()
                if len(words) <= 3 and not any(v in content.lower() for v in ['is', 'are', 'was', 'were', 'have', 'has', 'do', 'does', 'can', 'will', 'would', 'like']):
                    short_responses += 1

            if short_responses > len(user_msgs) * 0.5:  # 超过 50% 是短句
                recommendations.append(lang["complete_sentences"])

            # 检测是否使用疑问句（提问能力）
            question_usage = 0
            for msg in user_msgs:
                content = msg.get("content", "").strip()
                if content.endswith('?') or content.lower().startswith(('can ', 'could ', 'do ', 'does ', 'is ', 'are ', 'what ', 'where ', 'how ', 'when ', 'why ')):
                    question_usage += 1

            if question_usage < 2 and len(user_msgs) > 5:
                recommendations.append(lang["questions"])

        # 默认建议
        if not recommendations:
            recommendations.append(lang["default"])

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
