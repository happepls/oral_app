"""
Workflow Service - Main Entry Point
提供 4 个工作流的统一 API 接口
"""
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import asyncpg
import os
import json
import logging
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from workflows.oral_tutor import oral_tutor_workflow
from workflows.proficiency_scoring import proficiency_scoring_workflow
from workflows.scenario_review import scenario_review_workflow
from workflows.goal_planning import goal_planning_workflow
from workflows.batch_evaluation import batch_evaluation_workflow
from cache import cache, get_user_language_with_cache


app = FastAPI(
    title="Oral AI Workflow Service",
    description="Workflow orchestration for Oral AI application",
    version="1.0.0"
)

# Database connection pool
db_pool = None


@app.on_event("startup")
async def startup_db_pool():
    """Initialize database connection pool with retry logic"""
    global db_pool
    max_retries = 30
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Attempting to connect to PostgreSQL (attempt {attempt + 1}/{max_retries})...")
            
            db_pool = await asyncpg.create_pool(
                host=os.getenv("POSTGRES_HOST", "postgres"),
                port=os.getenv("POSTGRES_PORT", "5432"),
                user=os.getenv("POSTGRES_USER", "user"),
                password=os.getenv("POSTGRES_PASSWORD", "password"),
                database=os.getenv("POSTGRES_DB", "oral_app"),
                min_size=5,
                max_size=20,
                command_timeout=60,
                server_settings={
                    'application_name': 'workflow-service',
                    'jit': 'off'  # Disable JIT for faster startup
                }
            )
            
            # Test the connection
            async with db_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            
            logger.info("✅ PostgreSQL connection pool established successfully")
            break
            
        except Exception as e:
            logger.warning(f"❌ PostgreSQL connection attempt {attempt + 1} failed: {str(e)}")
            
            if attempt < max_retries - 1:
                logger.info(f"⏳ Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 1.5, 10)  # Exponential backoff, max 10s
            else:
                logger.error("❌ Failed to establish PostgreSQL connection after all retries")
                raise RuntimeError(f"Failed to connect to PostgreSQL after {max_retries} attempts: {str(e)}")
    
    if not db_pool:
        raise RuntimeError("Failed to establish database connection pool")

    # Initialize Redis connection (non-blocking, will fallback to DB if failed)
    logger.info("Initializing Redis cache...")
    cache.connect()
    if cache.is_connected():
        logger.info("✅ Redis cache initialized successfully")
    else:
        logger.warning("⚠️ Redis cache not available, will use database fallback")


@app.on_event("shutdown")
async def shutdown_db_pool():
    """Close database connection pool"""
    if db_pool:
        await db_pool.close()


# ============== Health Check ==============

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        if db_pool is None:
            return {"status": "unhealthy", "detail": "Database pool not initialized"}

        # Test database connection
        async with db_pool.acquire() as conn:
            result = await conn.fetchval("SELECT 1")
            if result != 1:
                return {"status": "unhealthy", "detail": "Database test query failed"}
        
        # Get Redis status
        redis_status = "connected" if cache.is_connected() else "disconnected"
        cache_stats = cache.get_cache_stats() if cache.is_connected() else {}
        
        return {
            "status": "healthy",
            "database": "connected",
            "redis": redis_status,
            "cache_stats": cache_stats
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {"status": "unhealthy", "detail": str(e)}


async def get_db_connection():
    """Get database connection from pool"""
    async with db_pool.acquire() as conn:
        yield conn


# ============== Request/Response Models ==============

class ConversationAnalysisRequest(BaseModel):
    user_message: str
    conversation_history: List[Dict[str, Any]]
    user_context: Dict[str, Any]
    current_task: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = None
    goal_id: Optional[int] = None
    task_id: Optional[int] = None


class ProficiencyUpdateRequest(BaseModel):
    user_id: str
    goal_id: int
    task_id: int
    conversation_history: List[Dict[str, Any]]
    current_task: Dict[str, Any]


class ScenarioReviewRequest(BaseModel):
    user_id: str
    goal_id: int
    scenario_title: str
    conversation_history: List[Dict[str, Any]]


class GoalCompletionCheckRequest(BaseModel):
    user_id: str
    goal_id: int
    all_tasks: List[Dict[str, Any]]


class NewGoalRequest(BaseModel):
    user_id: str
    goal_type: str
    target_language: str = "English"
    target_level: str = "B1"
    duration_days: int = 60
    interests: str = ""


class MagicPassEvaluateRequest(BaseModel):
    user_utterance: str
    target_sentence: str
    target_language: Optional[str] = "en"


class BatchEvaluateTurn(BaseModel):
    turn_index: int
    user_content: str
    ai_response: str
    timestamp: Optional[str] = None


class BatchEvaluateRequest(BaseModel):
    user_id: str
    goal_id: int
    task_id: int
    current_task: Dict[str, Any]
    native_language: str = "English"
    turn_window: List[BatchEvaluateTurn]
    window_size: int = 4


# ============== API Endpoints ==============

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "workflow-service"}


@app.post("/api/workflows/oral-tutor/analyze")
async def analyze_conversation(request: ConversationAnalysisRequest):
    """
    Workflow 1: Oral Tutor - Analyze user input and generate response strategy
    """
    try:
        logger.info(f"[ORAL_TUTOR] Analyzing message: '{request.user_message[:50]}...' (length: {len(request.user_message)})")
        if request.current_task:
            logger.info(f"[ORAL_TUTOR] Current task: {request.current_task.get('text', 'N/A')}")
        
        result = await oral_tutor_workflow.process_user_input(
            user_message=request.user_message,
            conversation_history=request.conversation_history,
            user_context=request.user_context,
            current_task=request.current_task
        )
        
        # Log detailed results
        logger.info(f"[ORAL_TUTOR] Task progress: {result.get('task_progress', 0):.1%}")
        logger.info(f"[ORAL_TUTOR] Should correct: {result.get('should_correct', False)}")
        
        proficiency_insights = result.get('proficiency_insights', {})
        if proficiency_insights:
            logger.info(f"[ORAL_TUTOR] Engagement: {proficiency_insights.get('engagement_level')}")
            logger.info(f"[ORAL_TUTOR] Language accuracy: {proficiency_insights.get('language_accuracy', 0):.1%}")
            logger.info(f"[ORAL_TUTOR] Complexity score: {proficiency_insights.get('complexity_score', 0):.1%}")
        
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"[ORAL_TUTOR] Error analyzing conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/workflows/proficiency-scoring/update")
async def update_proficiency_score(request: ProficiencyUpdateRequest, conn = Depends(get_db_connection)):
    """
    Workflow 2: Proficiency Scoring - Analyze conversation and update proficiency score
    """
    try:
        result = await proficiency_scoring_workflow.analyze_conversation_and_update_score(
            conversation_history=request.conversation_history,
            user_id=request.user_id,
            goal_id=request.goal_id,
            current_task=request.current_task,
            db_connection=conn
        )
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/workflows/proficiency-scoring/batch-evaluate")
async def batch_evaluate_proficiency(
    request: BatchEvaluateRequest,
    conn = Depends(get_db_connection)
):
    """
    Workflow: Batch Evaluation — analyze a window of N turns (default 4)
    with qwen-turbo LLM and update proficiency when delta > 0.
    Falls back to rule-based scoring on LLM failure.

    Design: docs/batch-evaluation-agent-design.md
    """
    try:
        logger.info(
            f"[BATCH_EVAL] user={request.user_id} goal={request.goal_id} "
            f"task={request.task_id} turns={len(request.turn_window)}"
        )
        result = await batch_evaluation_workflow.evaluate_window(
            user_id=request.user_id,
            goal_id=request.goal_id,
            turn_window=[t.dict() for t in request.turn_window],
            current_task=request.current_task,
            native_language=request.native_language,
            db_connection=conn,
        )
        logger.info(
            f"[BATCH_EVAL] result: delta={result.get('delta')} "
            f"mode={result.get('teaching_mode')} "
            f"task_completed={result.get('task_completed')}"
        )
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"[BATCH_EVAL] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/workflows/scenario-review/generate")
async def generate_scenario_review(request: ScenarioReviewRequest, conn = Depends(get_db_connection)):
    """
    Workflow 3: Scenario Review - Generate review report for completed scenario
    """
    try:
        logger.info(f"[SCENARIO_REVIEW] Request: user={request.user_id}, goal={request.goal_id}, scenario={request.scenario_title}, history={len(request.conversation_history)}")

        # Get user's native language from cache or database
        native_language = await get_user_language_with_cache(request.user_id, conn, cache)
        logger.info(f"[SCENARIO_REVIEW] User native language: {native_language} (from {'cache' if cache.get_user_language(request.user_id) else 'database'})")

        # Get completed tasks for this scenario
        tasks = await conn.fetch(
            """
            SELECT * FROM user_tasks
            WHERE goal_id = $1 AND scenario_title = $2 AND status = 'completed'
            ORDER BY completed_at DESC
            """,
            request.goal_id,
            request.scenario_title
        )

        completed_tasks = [dict(task) for task in tasks]
        logger.info(f"[SCENARIO_REVIEW] Completed tasks from DB: {len(completed_tasks)}")

        result = await scenario_review_workflow.generate_scenario_review(
            user_id=request.user_id,
            goal_id=request.goal_id,
            scenario_title=request.scenario_title,
            completed_tasks=completed_tasks,
            conversation_history=request.conversation_history,
            db_connection=conn,
            native_language=native_language
        )
        logger.info(f"[SCENARIO_REVIEW] Result: {result}")
        return {"success": True, "data": result}
    except Exception as e:
        logger.error(f"[SCENARIO_REVIEW] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/workflows/goal-planning/check-completion")
async def check_goal_completion(request: GoalCompletionCheckRequest, conn = Depends(get_db_connection)):
    """
    Workflow 4: Goal Planning - Check if goal is completed
    """
    try:
        result = await goal_planning_workflow.check_goal_completion(
            user_id=request.user_id,
            goal_id=request.goal_id,
            all_tasks=request.all_tasks,
            db_connection=conn
        )
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/workflows/goal-planning/suggestions")
async def get_goal_suggestions(
    user_id: str,
    goal_id: int,
    conn = Depends(get_db_connection)
):
    """
    Get new goal suggestions based on user profile and completed goal
    """
    try:
        # Get user profile
        user = await conn.fetchrow(
            "SELECT * FROM users WHERE id = $1",
            user_id
        )
        
        # Get completed goal
        goal = await conn.fetchrow(
            "SELECT * FROM user_goals WHERE id = $1",
            goal_id
        )
        
        if not user or not goal:
            raise HTTPException(status_code=404, detail="User or goal not found")
        
        # Get performance summary
        tasks = await conn.fetch(
            "SELECT * FROM user_tasks WHERE goal_id = $1",
            goal_id
        )
        
        completed_tasks = [t for t in tasks if t.get("status") == "completed"]
        avg_score = sum(t.get("score", 0) for t in completed_tasks) / len(completed_tasks) if completed_tasks else 0
        
        user_profile = {
            "interests": user.get("interests", ""),
            "target_language": user.get("target_language", "English")
        }
        
        completed_goal = dict(goal)
        performance_summary = {
            "avg_score": avg_score,
            "tasks_completed": len(completed_tasks),
            "practice_days": 0  # Calculate from timestamps
        }
        
        suggestions = goal_planning_workflow.generate_new_goal_suggestions(
            user_profile=user_profile,
            completed_goal=completed_goal,
            performance_summary=performance_summary
        )
        
        return {"success": True, "data": {"suggestions": suggestions}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/workflows/goal-planning/create")
async def create_new_goal(request: NewGoalRequest, conn = Depends(get_db_connection)):
    """
    Create a new goal from template
    """
    try:
        # Get goal template
        templates = goal_planning_workflow.goal_templates
        if request.goal_type not in templates:
            raise HTTPException(status_code=400, detail=f"Unknown goal type: {request.goal_type}")
        
        template = templates[request.goal_type].copy()
        template["target_language"] = request.target_language
        template["target_level"] = request.target_level
        template["duration_days"] = request.duration_days
        template["interests"] = request.interests
        
        result = await goal_planning_workflow.create_new_goal(
            user_id=request.user_id,
            goal_template=template,
            db_connection=conn
        )
        
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/workflows/magic-pass/evaluate")
async def evaluate_magic_pass(request: MagicPassEvaluateRequest):
    """
    Workflow: Magic Pass Evaluation
    Independently evaluate whether user's utterance correctly reproduces the target sentence.
    Decoupled from AI response text — uses normalized string similarity.
    Returns: {pass: bool, score: float, reason: str}
    """
    import re
    import unicodedata

    def _normalize(text: str) -> str:
        """Lowercase, strip punctuation, normalize unicode, collapse whitespace."""
        text = unicodedata.normalize("NFKC", text.lower())
        # Remove common punctuation (CJK and Latin)
        text = re.sub(r'[，。！？；：""''、《》【】\[\],.!?;:\'"()\-–—\s]+', ' ', text)
        return text.strip()

    def _cjk_char_overlap(a: str, b: str) -> float:
        """Character-level F1 for CJK text."""
        set_a = list(a.replace(' ', ''))
        set_b = list(b.replace(' ', ''))
        if not set_a or not set_b:
            return 0.0
        common = sum(min(set_a.count(c), set_b.count(c)) for c in set(set_a))
        precision = common / len(set_b) if set_b else 0
        recall = common / len(set_a) if set_a else 0
        if precision + recall == 0:
            return 0.0
        return 2 * precision * recall / (precision + recall)

    def _word_overlap(a: str, b: str) -> float:
        """Word-level F1 for Latin-script text."""
        words_a = a.split()
        words_b = b.split()
        if not words_a or not words_b:
            return 0.0
        common = sum(min(words_a.count(w), words_b.count(w)) for w in set(words_a))
        precision = common / len(words_b) if words_b else 0
        recall = common / len(words_a) if words_a else 0
        if precision + recall == 0:
            return 0.0
        return 2 * precision * recall / (precision + recall)

    CJK_LANGS = {"zh", "ja", "ko"}
    PASS_THRESHOLD = 0.75

    try:
        norm_user = _normalize(request.user_utterance)
        norm_target = _normalize(request.target_sentence)

        lang = (request.target_language or "en").lower()[:2]
        if lang in CJK_LANGS:
            score = _cjk_char_overlap(norm_user, norm_target)
        else:
            score = _word_overlap(norm_user, norm_target)

        passed = score >= PASS_THRESHOLD
        reason = "sufficient_overlap" if passed else "insufficient_overlap"

        logger.info(
            f"[MAGIC_PASS] lang={lang} score={score:.2f} pass={passed} "
            f"user='{request.user_utterance[:40]}' target='{request.target_sentence[:40]}'"
        )
        return {"pass": passed, "score": round(score, 3), "reason": reason}
    except Exception as e:
        logger.error(f"[MAGIC_PASS] Evaluation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3006)