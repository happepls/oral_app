"""Synthetic live local-workflow → Realtime check; never reads chat or writes scores.

Requires the local workflow container and an explicit --live flag. Reports
actual evaluator decisions, exact render checks and latency, including failures.
This is a service/model check, not a microphone or browser end-to-end test.
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
    CASES, MODEL, PREVIOUS_AI, TASK, PromptManager, load_dotenv,
    resolve_dashscope_config, run_one,
)
from current_turn_teaching import compose_speech, normalized_speech


def evaluate(context):
    # Credentials stay inside the local container; stdout contains synthetic
    # result data only. subprocess argument arrays avoid shell interpolation.
    code = """
import json, os, sys, urllib.request
request = urllib.request.Request(
    'http://localhost:3006/internal/scene-current-turn-feedback',
    data=sys.stdin.buffer.read(),
    headers={'Content-Type':'application/json',
             'X-Guaji-Internal-Auth':os.environ['INTERNAL_AUTH_SECRET']})
with urllib.request.urlopen(request, timeout=7) as response:
    print(response.read().decode())
"""
    started = time.monotonic()
    result = subprocess.run(
        ["docker", "exec", "-i", "oral_app_workflow_service", "python", "-c", code],
        input=json.dumps(context), text=True, capture_output=True, timeout=9,
    )
    if result.returncode:
        raise RuntimeError("local_workflow_unavailable")
    return json.loads(result.stdout).get("data"), round((time.monotonic() - started) * 1000)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.live:
        parser.error("--live is required for billable model calls")
    load_dotenv(args.env_file)
    logging.getLogger("dashscope").setLevel(logging.CRITICAL)
    config = resolve_dashscope_config(os.environ)
    base = PromptManager().generate_scene_theater_prompt("", [TASK], "Japanese", "Chinese", target_level="A1")
    report = dict(started_at=datetime.now(timezone.utc).isoformat(), model=MODEL,
                  scenario="自我介绍与职业背景说明", input_kind="synthetic_text", results=[])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for case in CASES:
        for repeat in range(1, args.repeats + 1):
            row = dict(expected_branch=case["branch"], repeat=repeat, mechanical_pass=False, semantic_pass=None)
            try:
                feedback, elapsed = evaluate(dict(
                    scenario=report["scenario"], current_task=TASK, target_language="Japanese",
                    native_language="Chinese", level="A1", user_text=case["user_text"], previous_ai_text=PREVIOUS_AI,
                ))
                row.update(evaluation_ms=elapsed, feedback=feedback)
                if feedback is None:
                    raise ValueError("no_valid_feedback")
                speech = compose_speech(feedback, allow_native_hint=True)
                row["speech"] = speech
                result = run_one(config, base, {**case, "spoken_script": speech}, repeat, "script_only")
                row.update(result)
                row["exact_speech"] = normalized_speech(result["transcript"]) == normalized_speech(speech)
                row["mechanical_pass"] = (feedback["teaching_mode"] == case["branch"] and result["transport_pass"] and row["exact_speech"])
                if result["transport_pass"] and row["exact_speech"]:
                    row["estimated_release_ms"] = elapsed + result["response_done_ms"]
            except Exception as exc:
                row["failure_type"] = type(exc).__name__
            report["results"].append(row)
            args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
            print(json.dumps(row, ensure_ascii=False), flush=True)
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    report["mechanical_pass"] = all(row["mechanical_pass"] for row in report["results"])
    report["gate"] = "pending_semantic_review"
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 0 if report["mechanical_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
