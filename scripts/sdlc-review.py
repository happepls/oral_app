#!/usr/bin/env python3
"""Validate diff-bound review evidence for GitHub pull requests."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RULES = {
    "governance": (".github/workflows/sdlc", "scripts/sdlc", "oral-app-sdlc", "intent.md", "spec.md", "plan.md", "verification.md", "release.md", "maintenance.md", "bands.yaml", "REVIEW.md"),
    "auth": ("AuthContext", "auth", "middleware", "jwt", "user-service"),
    "stripe": ("stripe", "webhook", "subscription", "payment"),
    "scoring": ("scoring", "proficiency", "workflow-service", "ai-omni"),
    "websocket_audio": ("websocket", "ws", "comms-service", "audio", "tts", "Conversation"),
    "docker_release": ("Dockerfile", "docker-compose", ".github/workflows/deploy", "nginx"),
    "data": ("migration", "schema", "init.sql", "backup", "database"),
    "ui": ("client/src", "figma_app_template", "i18n", "tailwind"),
}
SHA = re.compile(r"[0-9a-f]{40}")
PR_EVIDENCE_START = "<!-- sdlc-pr-evidence:start -->"
PR_EVIDENCE_END = "<!-- sdlc-pr-evidence:end -->"
VERIFICATION_ROW = re.compile(
    r"\|\s*`(?P<command>[^`\n]+)`\s*\|\s*(?P<exit_code>[0-9]{1,3})\s*\|"
    r"\s*\[[^\]\n]+\]\(https://[^/\s()]+/[^\s()]+\)\s*\|"
)


def changed(base: str, head: str) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base}...{head}"],
        cwd=ROOT, text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise SystemExit(result.stderr.strip())
    return [line for line in result.stdout.splitlines() if line]


def classify(paths: list[str]) -> dict[str, list[str]]:
    return {
        risk: sorted({path for path in paths if any(term.lower() in path.lower() for term in terms)})
        for risk, terms in RULES.items()
        if any(any(term.lower() in path.lower() for term in terms) for path in paths)
    }


def validate_pr_evidence(body: str, base: str, merge_base: str, head: str) -> list[str]:
    lines = body.splitlines()
    if lines.count(PR_EVIDENCE_START) != 1 or lines.count(PR_EVIDENCE_END) != 1:
        return ["PR description must contain one sdlc-pr-evidence block from the PR template"]
    evidence = lines[lines.index(PR_EVIDENCE_START) + 1:lines.index(PR_EVIDENCE_END)]
    errors = []
    for field, expected in (("Base SHA", base), ("Merge base SHA", merge_base), ("Head SHA", head)):
        prefix = f"- {field} "
        values = [line.removeprefix(prefix).strip() for line in evidence if line.startswith(prefix)]
        if values != [f"`{expected}`"]:
            errors.append(f"PR evidence {field} must appear once and match `{expected}`")
    results = [VERIFICATION_ROW.fullmatch(line.strip()) for line in evidence]
    if not any(result and result["command"].strip() and int(result["exit_code"]) <= 255 for result in results):
        errors.append("PR evidence must include a verification command, exit code (0–255), and HTTPS evidence link")
    return errors


def review_pull_request(path: Path, event_base: str | None, event_head: str | None) -> list[str]:
    try:
        pr = json.loads(path.read_text(encoding="utf-8"))
        base = pr["base"]["sha"]
        head = pr["head"]["sha"]
        head_ref = pr["head"]["ref"]
        base_repo = pr["base"]["repo"]["id"]
        head_repo = (pr["head"]["repo"] or {}).get("id")
        body = pr["body"]
        if not (SHA.fullmatch(base) and SHA.fullmatch(head) and isinstance(head_ref, str)
                and type(base_repo) is int and (body is None or isinstance(body, str))):
            raise ValueError
    except (OSError, KeyError, TypeError, AttributeError, ValueError):
        return ["cannot read valid pull request metadata"]
    if (event_base is not None and event_base != base) or (event_head is not None and event_head != head):
        return ["pull request Base or Head changed since this run was triggered. Use a run for the current PR diff"]

    common = subprocess.run(
        ["git", "merge-base", base, head], cwd=ROOT, text=True, capture_output=True, check=False,
    )
    if common.returncode:
        return ["cannot resolve the PR merge base from the checked-out Git history"]
    merge_base = common.stdout.strip()
    paths = changed(merge_base, head)
    risks = classify(paths)
    uses_release_artifact = head_repo == base_repo and head_ref.startswith("agent/sdlc-")
    print(json.dumps({
        "evidence_source": "release.md" if uses_release_artifact else "PR description",
        "base_sha": base, "merge_base_sha": merge_base, "head_sha": head,
        "changed_paths": paths, "risk_areas": risks,
    }, indent=2, sort_keys=True))
    if uses_release_artifact:
        return validate_evidence(ROOT / "release.md", risks, merge_base, head, ROOT / "verification.md")
    return validate_pr_evidence(body or "", base, merge_base, head)


def validate_evidence(release_path: Path, risks: dict[str, list[str]], base: str | None = None, head: str | None = None, verification_path: Path | None = None) -> list[str]:
    errors: list[str] = []
    if not release_path.exists():
        return ["release.md is missing"]
    text = release_path.read_text(encoding="utf-8")
    status = re.search(r"^status:\s*(\S+)", text, re.M)
    if not status or status.group(1) not in {"ready", "complete"}:
        return ["release.md is not ready for review"]
    match = re.search(r"<!-- sdlc-review-json\n(\{.*?\})\n-->", text, re.S)
    if not match:
        return ["release.md lacks bound sdlc-review-json evidence"]
    try:
        evidence = json.loads(match.group(1))
    except json.JSONDecodeError:
        return ["release.md contains invalid sdlc-review-json"]
    if base and evidence.get("base_sha") != base:
        errors.append("review evidence base_sha does not match reviewed diff")
    if head and evidence.get("head_sha") != head:
        reviewed_head = str(evidence.get("head_sha", ""))
        ancestry = subprocess.run(["git", "merge-base", "--is-ancestor", reviewed_head, head], cwd=ROOT).returncode == 0
        delta = changed(reviewed_head, head) if ancestry else []
        if not ancestry or set(delta) - {"release.md", "maintenance.md"}:
            errors.append("review evidence head_sha is not the reviewed ancestor of the evidence-only commit")
    covered_json = set(evidence.get("risk_areas", []))
    missing_json = set(risks) - covered_json
    if missing_json:
        errors.append(f"structured review misses risk areas: {', '.join(sorted(missing_json))}")
    findings = evidence.get("findings")
    if not isinstance(findings, list):
        errors.append("structured review findings must be a list")
        findings = []
    for finding in findings:
        if not isinstance(finding, dict) or set(finding) != {"severity", "location", "impact", "fix", "resolved"}:
            errors.append("structured review contains a malformed finding")
            continue
        if finding["severity"] not in {"critical", "high", "medium", "low"} or not isinstance(finding["resolved"], bool):
            errors.append("structured review contains an invalid severity or resolution")
        if any(not isinstance(finding[field], str) or not finding[field] for field in ("location", "impact", "fix")):
            errors.append("structured review finding lacks location, impact, or fix")
    commands = evidence.get("commands")
    if not isinstance(commands, list) or not commands or any(not isinstance(command, str) or not command for command in commands):
        errors.append("structured review commands must be a non-empty string list")
        commands = []
    unresolved_count = sum(
        1 for finding in findings
        if isinstance(finding, dict) and finding.get("severity") in {"critical", "high"} and finding.get("resolved") is not True
    )
    if verification_path and verification_path.exists():
        verification = verification_path.read_text(encoding="utf-8")
        for command in commands:
            if command not in verification:
                errors.append(f"structured review command is absent from verification.md: {command}")
    if "## Review evidence" not in text:
        return errors + ["release.md lacks structured Review evidence"]
    section = text.split("## Review evidence", 1)[1].split("\n## ", 1)[0]
    required = ["Scope", "Diff", "Commands", "Risk areas", "Findings", "Unresolved high/critical", "Recommendation"]
    for field in required:
        if not re.search(rf"^- {re.escape(field)}:\s*\S", section, re.M):
            errors.append(f"release.md review evidence missing {field}")
    risk_match = re.search(r"^- Risk areas:\s*(.+)$", section, re.M)
    covered = set()
    if risk_match:
        covered = {item.strip() for item in risk_match.group(1).split(",")}
    missing = set(risks) - covered
    if missing:
        errors.append(f"release.md review evidence misses risk areas: {', '.join(sorted(missing))}")
    unresolved = re.search(r"^- Unresolved high/critical:\s*(\d+)\s*$", section, re.M)
    if not unresolved or int(unresolved.group(1)) != unresolved_count or unresolved_count != 0:
        errors.append("release.md has unresolved high/critical findings")
    recommendation = re.search(r"^- Recommendation:\s*(\S+)", section, re.M)
    derived_recommendation = "ready" if unresolved_count == 0 else "blocked"
    if not recommendation or recommendation.group(1) != derived_recommendation or derived_recommendation != "ready":
        errors.append("release.md recommendation is not ready")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base")
    parser.add_argument("--head")
    parser.add_argument("--pull-request", type=Path, help="current PR JSON from the GitHub REST API")
    parser.add_argument("--paths", nargs="*")
    args = parser.parse_args()
    if not (ROOT / "REVIEW.md").exists():
        print("REVIEW.md is missing")
        return 1
    if args.pull_request is not None:
        if args.paths is not None:
            parser.error("--paths cannot override the actual pull request diff")
        errors = review_pull_request(args.pull_request, args.base, args.head)
    else:
        base, head = args.base or "HEAD^", args.head or "HEAD"
        paths = args.paths if args.paths is not None else changed(base, head)
        risks = classify(paths)
        print(json.dumps({"changed_paths": paths, "risk_areas": risks}, indent=2, sort_keys=True))
        errors = validate_evidence(ROOT / "release.md", risks, base, head, ROOT / "verification.md")
    for error in errors:
        print(f"ERROR: {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
