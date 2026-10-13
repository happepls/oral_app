"""Live synthetic repeated-success probe of the default Scene Theater path.

Uses the local v1 evaluator, actual scene prompt and previous-turn directive.
Never reads conversations or writes scores. Semantic review remains manual.
"""
import argparse
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import subprocess
import time

from scene_current_turn_probe import (
    Capture, MODEL, MultiModality, OmniRealtimeConversation, PromptManager,
    load_dotenv, resolve_dashscope_config,
)
from expression_feedback import format_directive

TASK = "Politely ask an airport agent whether your flight is on time."
INPUTS = ["Excuse me, is my flight on time?", "Excuse me, is my flight on time?",
          "Excuse me, is my flight on schedule?"]


def evaluate(text, previous_ai):
    context = dict(scenario="Flight punctuality", current_task=TASK,
                   target_language="English", native_language="Chinese", level="A1",
                   user_text=text, previous_ai_text=previous_ai)
    code = """
import json, os, sys, urllib.request
request=urllib.request.Request('http://localhost:3006/internal/scene-expression-feedback',
    data=sys.stdin.buffer.read(), headers={'Content-Type':'application/json',
    'X-Guaji-Internal-Auth':os.environ['INTERNAL_AUTH_SECRET']})
with urllib.request.urlopen(request, timeout=7) as response:
    print(response.read().decode())
"""
    result = subprocess.run(["docker", "exec", "-i", "oral_app_workflow_service", "python", "-c", code],
                            input=json.dumps(context), text=True, capture_output=True, timeout=9)
    if result.returncode:
        raise RuntimeError("local_workflow_unavailable")
    return json.loads(result.stdout).get("data")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.live:
        parser.error("--live is required for billable model calls")
    load_dotenv(args.env_file)
    logging.getLogger("dashscope").setLevel(logging.CRITICAL)
    config = resolve_dashscope_config(os.environ)
    base = PromptManager().generate_scene_theater_prompt("", [TASK], "English", "Chinese", target_level="A1")
    report = dict(started_at=datetime.now(timezone.utc).isoformat(), model=MODEL,
                  input_kind="synthetic_text", task=TASK, inputs=INPUTS,
                  gate="pending_semantic_review", results=[])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for repeat in range(1, 4):
        capture = Capture()
        conversation = OmniRealtimeConversation(model=MODEL, callback=capture, url=config.ws_url, api_key=config.ws_api_key)
        previous_ai, feedback = "Please ask the airport agent whether your flight is on time.", None
        try:
            conversation.connect()
            if not capture.created.wait(15) or capture.error_type:
                raise RuntimeError("session_unavailable")
            conversation.update_session(instructions=base, voice="Tina",
                                        output_modalities=[MultiModality.TEXT, MultiModality.AUDIO], enable_turn_detection=False)
            if not capture.updated.wait(15) or capture.error_type:
                raise RuntimeError("session_update_unavailable")
            conversation.send_raw(json.dumps({"type":"conversation.item.create", "item":{
                "type":"message", "role":"assistant", "content":[{"type":"text", "text":previous_ai}]}}))
            for index, text in enumerate(INPUTS, 1):
                capture.__init__()
                conversation.send_raw(json.dumps({"type":"conversation.item.create", "item":{
                    "type":"message", "role":"user", "content":[{"type":"input_text", "text":text}]}}))
                instruction = base + ("\n\n" + format_directive(feedback, "English", "Chinese") if feedback else "")
                capture.started = time.monotonic()
                conversation.create_response(instructions=instruction)
                if not capture.done.wait(25):
                    raise TimeoutError("response_timeout")
                row = dict(repeat=repeat, turn=index, input=text, transcript=capture.transcript,
                           status=capture.status, error_type=capture.error_type, audio_chunks=capture.audio_chunks,
                           first_audio_ms=capture.first_audio_ms,
                           response_done_ms=round((time.monotonic()-capture.started)*1000), semantic_pass=None)
                report["results"].append(row)
                try:
                    feedback = evaluate(text, previous_ai)
                    row["feedback"] = feedback
                except Exception as exc:
                    row["evaluation_error"] = type(exc).__name__
                    feedback = None
                previous_ai = capture.transcript
                args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
                print(json.dumps(row, ensure_ascii=False), flush=True)
        except Exception as exc:
            report["results"].append(dict(repeat=repeat, failure_type=type(exc).__name__, semantic_pass=None))
        finally:
            try:
                conversation.close()
            except Exception:
                pass
            args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    report["transport_pass"] = len(report["results"]) == 9 and all(
        r.get("status") == "completed" and r.get("audio_chunks") and not r.get("error_type") for r in report["results"])
    report["feedback_available"] = sum(isinstance(r.get("feedback"), dict) for r in report["results"])
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    # A successful voice-only fallback is not a complete evaluator-path pass.
    return 0 if report["transport_pass"] and report["feedback_available"] == 9 else 1


if __name__ == "__main__":
    raise SystemExit(main())
