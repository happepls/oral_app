"""Internal, score-independent endpoint for per-turn teaching."""
import logging
import os
import secrets

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from workflows.expression_feedback import evaluate_expression, feedback_enabled

router = APIRouter()
logger = logging.getLogger(__name__)


class ExpressionRequest(BaseModel):
    scenario: str = Field(min_length=1, max_length=300)
    current_task: str = Field(min_length=1, max_length=2000)
    target_language: str = Field(min_length=1, max_length=80)
    native_language: str = Field(min_length=1, max_length=80)
    level: str = Field(default="B1", max_length=80)
    user_text: str = Field(min_length=1, max_length=4000)
    previous_ai_text: str = Field(default="", max_length=2000)


@router.post("/internal/scene-expression-feedback")
async def expression_feedback(request: ExpressionRequest, x_guaji_internal_auth: str = Header(default="")):
    secret = os.getenv("INTERNAL_AUTH_SECRET", "")
    if not secret or not secrets.compare_digest(secret, x_guaji_internal_auth):
        raise HTTPException(status_code=403, detail="Internal authentication required")
    if not feedback_enabled():
        return {"success": True, "data": None}
    try:
        result = await evaluate_expression(request.model_dump())
        return {"success": True, "data": result}
    except Exception as exc:
        # No user text, upstream body or credentials in logs. Feedback is optional.
        logger.warning("Scene expression feedback unavailable (%s)", type(exc).__name__)
        return {"success": True, "data": None}
