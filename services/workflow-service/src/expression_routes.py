"""Internal, score-independent endpoint for per-turn teaching."""
import logging
import os
import secrets
import asyncio
import json
import time

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from workflows.expression_feedback import evaluate_expression, feedback_enabled
from workflows.current_turn_feedback import evaluate_current_expression

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
    started = time.monotonic()
    try:
        result = await evaluate_expression(request.model_dump())
        return {"success": True, "data": result}
    except Exception as exc:
        # No user text, upstream body or credentials in logs. Feedback is optional.
        # Validator messages are static strings. Model output and user input
        # must never enter the diagnostic, including JSON decoder messages.
        if isinstance(exc, asyncio.TimeoutError):
            reason = 'upstream_timeout'
        elif isinstance(exc, json.JSONDecodeError):
            reason = 'invalid_json'
        elif isinstance(exc, ValueError):
            reason = {
                'invalid teaching mode': 'teaching_mode',
                'invalid off_topic': 'off_topic_type',
                'expected two or three alternatives': 'alternatives_count',
                'alternatives must be distinct student utterances': 'alternatives_voice',
                'invalid feedback text': 'text_shape',
                'feedback contains machine content': 'machine_content',
                'invalid errors': 'errors_shape',
                'invalid error entry': 'error_entry',
                'correction requires evidence': 'missing_error_evidence',
                'expected at most one question': 'question_count',
                'feedback_transport_shape': 'transport_shape',
            }.get(str(exc), 'schema_validation')
        else:
            reason = 'upstream_error'
        logger.warning("Scene expression feedback unavailable type=%s reason=%s elapsed_ms=%d",
                       type(exc).__name__, reason, round((time.monotonic() - started) * 1000))
        return {"success": True, "data": None}


@router.post("/internal/scene-current-turn-feedback")
async def current_turn_feedback(request: ExpressionRequest, x_guaji_internal_auth: str = Header(default="")):
    secret = os.getenv("INTERNAL_AUTH_SECRET", "")
    if not secret or not secrets.compare_digest(secret, x_guaji_internal_auth):
        raise HTTPException(status_code=403, detail="Internal authentication required")
    try:
        result = await evaluate_current_expression(request.model_dump())
        return {"success": True, "data": result}
    except Exception as exc:
        # Only exception type: never log student input or model response bodies.
        logger.warning("Scene current-turn feedback unavailable (%s)", type(exc).__name__)
        return {"success": True, "data": None}
