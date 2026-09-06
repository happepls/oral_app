#!/usr/bin/env python3
"""Evaluate redacted production observations against bands.yaml."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REDACTIONS = [
    (re.compile(r"(?i)(authorization|cookie|token|secret|password)([\"'=:\s]+)[^\s,;}]+"), r"\1\2[REDACTED]"),
    (re.compile(r"(?i)(user[_-]?id|email)([\"'=:\s]+)[^\s,;}]+"), r"\1\2[REDACTED]"),
    (re.compile(r"sk-[A-Za-z0-9_-]{12,}"), "[REDACTED_KEY]"),
]
AGGREGATE_FIELDS = {
    "five_xx_rate", "resource_utilization", "backup_age_hours", "consecutive_windows",
    "critical_security_event", "health_consecutive_failures", "ws_error_count",
    "dashscope_error_count", "history_save_error_count", "stripe_webhook_error_count",
    "sample_count", "latency_p95_ms",
}


def redact(value: str) -> str:
    for pattern, replacement in REDACTIONS:
        value = pattern.sub(replacement, value)
    return value


def parse_bands(path: Path) -> dict[str, dict[str, float]]:
    # bands.yaml intentionally uses a flat, conservative YAML subset.
    result: dict[str, dict[str, float]] = {}
    current = ""
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        key, value = line.strip().split(":", 1)
        if indent == 0 and not value.strip():
            current = key
            result[current] = {}
        elif indent == 2 and current:
            raw = value.strip()
            if raw.lower() in {"true", "false"}:
                result[current][key] = raw.lower() == "true"
            else:
                result[current][key] = float(raw)
    return result


def evaluate(observation: dict, bands: dict) -> dict:
    reasons: list[str] = []
    severity = "observe"
    hard = bands["hard"]
    if observation.get("critical_security_event"):
        reasons.append("critical_security_event")
        severity = "immediate"
    if float(observation.get("five_xx_rate", 0)) >= hard["five_xx_rate"] and int(observation.get("consecutive_windows", 0)) >= 2:
        reasons.append("5xx_rate_two_windows")
        if severity != "immediate": severity = "diagnose"
    if float(observation.get("resource_utilization", 0)) >= hard["resource_utilization"] and int(observation.get("consecutive_windows", 0)) >= 2:
        reasons.append("resource_two_windows")
        if severity != "immediate": severity = "diagnose"
    if float(observation.get("backup_age_hours", 0)) > hard["backup_age_hours"]:
        reasons.append("backup_stale")
        if severity != "immediate": severity = "diagnose"
    if int(observation.get("health_consecutive_failures", 0)) >= int(hard["health_consecutive_failures"]):
        reasons.append("health_failures")
        if severity != "immediate": severity = "diagnose"
    return {"severity": severity, "reasons": reasons, "redacted_summary": redact(str(observation.get("summary", "")))}


def validate_aggregate(value: object) -> dict:
    if not isinstance(value, dict):
        raise ValueError("aggregate must be a JSON object")
    unknown = set(value) - AGGREGATE_FIELDS
    if unknown:
        raise ValueError("free-text or unknown aggregate fields rejected")
    for key, item in value.items():
        if key == "critical_security_event":
            if not isinstance(item, bool):
                raise ValueError("critical_security_event must be boolean")
            continue
        if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item):
            raise ValueError(f"{key} must be a finite number")
        if item < 0:
            raise ValueError(f"{key} must be non-negative")
        if key in {"five_xx_rate", "resource_utilization"} and item > 1:
            raise ValueError(f"{key} must be between 0 and 1")
        if key.endswith("_count") or key in {"consecutive_windows", "health_consecutive_failures", "sample_count"}:
            if not float(item).is_integer():
                raise ValueError(f"{key} must be an integer")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("observation", help="JSON file, or - for stdin")
    parser.add_argument("--bands", default=str(ROOT / "bands.yaml"))
    parser.add_argument("--aggregate-only", action="store_true")
    args = parser.parse_args()
    raw = sys.stdin.read() if args.observation == "-" else Path(args.observation).read_text(encoding="utf-8")
    observation = json.loads(raw)
    if args.aggregate_only:
        observation = validate_aggregate(observation)
    result = evaluate(observation, parse_bands(Path(args.bands)))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
