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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from workflows.oral_tutor import oral_tutor_workflow
from workflows.proficiency_scoring import proficiency_scoring_workflow
from workflows.scenario_review import scenario_review_workflow
from workflows.goal_planning import goal_planning_workflow


app = FastAPI(
    title="Oral AI Workflow Service",
    description="Workflow orchestration for Oral AI application",
    version="1.0.0"
)

# Database connection pool
db_pool = None


@app.on_event("startup")
async def startup_db_pool():
    """Initialize database connection pool"""
    global db_pool
    db_pool = await asyncpg.create_pool(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=os.getenv("POSTGRES_PORT", "5432"),
        user=os.getenv("POSTGRES_USER", "user"),
        password=os.getenv("POSTGRES_PASSWORD", "password"),
        database=os.getenv("POSTGRES_DB", "oral_app"),
        min_size=5,
        max_size=20
    )


@app.on_event("shutdown")
async def shutdown_db_pool():
    """Close database connection pool"""
    if db_pool:
        await db_pool.close()


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


@app.post("/api/workflows/scenario-review/generate")
async def generate_scenario_review(request: ScenarioReviewRequest, conn = Depends(get_db_connection)):
    """
    Workflow 3: Scenario Review - Generate review report for completed scenario
    """
    try:
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
        
        result = await scenario_review_workflow.generate_scenario_review(
            user_id=request.user_id,
            goal_id=request.goal_id,
            scenario_title=request.scenario_title,
            completed_tasks=completed_tasks,
            conversation_history=request.conversation_history,
            db_connection=conn
        )
        return {"success": True, "data": result}
    except Exception as e:
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3006)