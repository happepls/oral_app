#!/usr/bin/env python3
"""Deterministic gates for the oral_app AI-native SDLC.

This module deliberately uses only the Python standard library so the same
checks run in a developer hook and on a clean GitHub runner.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = [
    ("intent.md", "plan"),
    ("spec.md", "design"),
    ("plan.md", "build"),
    ("verification.md", "test"),
    ("release.md", "deploy"),
    ("maintenance.md", "maintain"),
]
REQUIRED = {
    "change_id", "stage", "status", "revision", "source", "created_at",
    "updated_at", "parent_artifact_commit", "artifact_commit", "risk_level",
    "owner_role", "approval_required", "approval_evidence",
}
STATUSES = {"pending", "ready", "approved", "blocked", "complete", "superseded"}
STAGES = {stage for _, stage in ARTIFACTS}
RISKS = {"low", "medium", "high", "critical"}
COMMIT_TOKEN = re.compile(r"^sdlc/[a-z0-9][a-z0-9-]{5,63}/(plan|design|build|test|deploy|maintain)/r[1-9][0-9]*$")
PLACEHOLDERS = re.compile(r"\b(TODO|TBD|PLACEHOLDER)\s*[:\-]", re.I)
SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"(?i)(authorization:\s*bearer|accessToken=|cookie:)\s*[^\s]+"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
]


class GateError(RuntimeError):
    pass


def parse_frontmatter_text(text: str, name: str) -> tuple[dict[str, object], str]:
    if not text.startswith("---\n") or "\n---\n" not in text[4:]:
        raise GateError(f"{name}: missing YAML frontmatter")
    raw, body = text[4:].split("\n---\n", 1)
    data: dict[str, object] = {}
    for number, line in enumerate(raw.splitlines(), 2):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise GateError(f"{name}:{number}: invalid frontmatter")
        key, value = line.split(":", 1)
        value = value.strip().strip('"').strip("'")
        if value.lower() in {"true", "false"}:
            data[key.strip()] = value.lower() == "true"
        elif key.strip() == "revision" and value.isdigit():
            data[key.strip()] = int(value)
        else:
            data[key.strip()] = value
    return data, body


def parse_frontmatter(path: Path) -> tuple[dict[str, object], str]:
    return parse_frontmatter_text(path.read_text(encoding="utf-8"), path.name)


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True, check=False
    )
    if check and result.returncode:
        raise GateError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def _valid_commit_ref(value: object, allow_pending: bool) -> bool:
    return bool(
        (allow_pending and value in {"pending", "none"})
        or (isinstance(value, str) and COMMIT_TOKEN.fullmatch(value))
    )


def validate_artifacts(history: bool = False, loader=None) -> list[str]:
    errors: list[str] = []
    parsed: list[tuple[Path, dict[str, object], str]] = []
    for filename, expected_stage in ARTIFACTS:
        path = ROOT / filename
        try:
            text = loader(filename) if loader else path.read_text(encoding="utf-8")
            meta, body = parse_frontmatter_text(text, filename)
        except (GateError, FileNotFoundError) as exc:
            errors.append(str(exc))
            continue
        parsed.append((path, meta, body))
        missing = sorted(REQUIRED - meta.keys())
        if missing:
            errors.append(f"{filename}: missing fields: {', '.join(missing)}")
        if meta.get("stage") != expected_stage:
            errors.append(f"{filename}: stage must be {expected_stage}")
        if meta.get("stage") not in STAGES:
            errors.append(f"{filename}: invalid stage")
        if meta.get("status") not in STATUSES:
            errors.append(f"{filename}: invalid status")
        if not isinstance(meta.get("revision"), int) or int(meta.get("revision", 0)) < 1:
            errors.append(f"{filename}: revision must be a positive integer")
        if meta.get("risk_level") not in RISKS:
            errors.append(f"{filename}: invalid risk_level")
        if not isinstance(meta.get("approval_required"), bool):
            errors.append(f"{filename}: approval_required must be true or false")
        if meta.get("status") == "approved" and str(meta.get("approval_evidence", "")).lower() in {"", "none", "pending"}:
            errors.append(f"{filename}: approved without approval_evidence")
        allow_pending = meta.get("status") not in {"complete", "superseded"}
        token = meta.get("artifact_commit")
        if not _valid_commit_ref(token, allow_pending):
            errors.append(f"{filename}: invalid artifact_commit")
        elif token not in {"pending", "none"}:
            expected_token = f"sdlc/{meta.get('change_id')}/{expected_stage}/r{meta.get('revision')}"
            if token != expected_token:
                errors.append(f"{filename}: artifact_commit does not match change_id, stage, and revision")
        if PLACEHOLDERS.search(body) and meta.get("status") in {"ready", "approved", "complete"}:
            errors.append(f"{filename}: ready artifact contains placeholder text")
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                errors.append(f"{filename}: possible secret or session data")
                break

    if not parsed:
        return errors
    change_ids = {str(meta.get("change_id")) for _, meta, _ in parsed}
    if len(change_ids) != 1 or "" in change_ids:
        errors.append("artifact chain: change_id mismatch")
    for index, (path, meta, _) in enumerate(parsed):
        expected_parent = "none" if index == 0 else parsed[index - 1][1].get("artifact_commit")
        if meta.get("parent_artifact_commit") != expected_parent:
            errors.append(f"{path.name}: parent_artifact_commit does not match previous artifact")
        if index and meta.get("status") in {"ready", "approved", "complete"}:
            upstream = parsed[index - 1][1].get("status")
            if upstream not in {"approved", "complete"}:
                errors.append(f"{path.name}: stage advanced before upstream approval/completion")

    plan = next((meta for path, meta, _ in parsed if path.name == "plan.md"), {})
    if plan.get("status") in {"approved", "complete"} and plan.get("approval_required") is not True:
        errors.append("plan.md: implementation plan must require approval")
    for path, meta, _ in parsed:
        if meta.get("approval_required") is True and meta.get("status") in {"approved", "complete"}:
            if str(meta.get("approval_evidence", "")).lower() in {"", "none", "pending"}:
                errors.append(f"{path.name}: approval-gated stage lacks durable evidence")

    verification = next(((meta, body) for path, meta, body in parsed if path.name == "verification.md"), ({}, ""))
    if verification[0].get("status") in {"ready", "complete"}:
        if "## Actual commands" not in verification[1] or "## Results" not in verification[1]:
            errors.append("verification.md: missing actual commands or results")
        actual = verification[1].split("## Actual commands", 1)[-1].split("## Results", 1)[0]
        if not re.search(r"-\s+`[^`]+`\s+—\s+exit\s+[0-9]+", actual):
            errors.append("verification.md: actual commands require `command` — exit N evidence")

    release = next(((meta, body) for path, meta, body in parsed if path.name == "release.md"), ({}, ""))
    if release[0].get("status") in {"ready", "complete"} and "## Rollback" not in release[1]:
        errors.append("release.md: missing rollback")

    if history:
        previous_commit = None
        head_commits = git("rev-list", "HEAD", check=False).splitlines()
        for index, (path, meta, _) in enumerate(parsed):
            if meta.get("status") in {"pending", "blocked"}:
                continue
            token = str(meta.get("artifact_commit", ""))
            if not COMMIT_TOKEN.fullmatch(token):
                continue
            commits = []
            for candidate in head_commits:
                message = git("log", "-1", "--format=%B", candidate, check=False)
                trailers = [line.strip() for line in message.splitlines() if line.startswith("SDLC-Artifact:")]
                if trailers.count(f"SDLC-Artifact: {token}") == 1:
                    commits.append(candidate)
            if len(commits) != 1:
                errors.append(f"{path.name}: expected one commit trailer for {token}, found {len(commits)}")
                continue
            changed = set(git("diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commits[0]).splitlines())
            allowed = {name for name, _ in ARTIFACTS} if index == 0 else {name for name, _ in ARTIFACTS[index:]}
            unexpected = sorted(changed - allowed)
            if unexpected:
                errors.append(f"{path.name}: stage commit includes non-stage files: {', '.join(unexpected)}")
            if path.name not in changed:
                errors.append(f"{path.name}: trailer commit does not change the artifact")
            if previous_commit:
                ancestry = git("rev-list", "--ancestry-path", f"{previous_commit}..{commits[0]}", check=False).splitlines()
                if commits[0] not in ancestry:
                    errors.append(f"{path.name}: stage commit is not ordered after the previous stage")
            previous_commit = commits[0]
            committed = git("show", f"{commits[0]}:{path.name}", check=False)
            current = (loader(path.name) if loader else path.read_text(encoding="utf-8")).rstrip("\n")
            if committed.rstrip("\n") != current:
                errors.append(f"{path.name}: current artifact blob differs from its trailer commit")
    return errors


def staged_paths() -> list[str]:
    output = git("diff", "--cached", "--name-only", "--diff-filter=ACMRD", check=False)
    return [line for line in output.splitlines() if line]


def validate_precommit(paths: list[str] | None = None) -> list[str]:
    paths = staged_paths() if paths is None else paths
    governed_exclusions = {
        filename for filename, _ in ARTIFACTS
    } | {"REVIEW.md", "bands.yaml", "docs/ai-sdlc.md"}
    code = [
        path for path in paths
        if path not in governed_exclusions
        and path not in {"core-rules.md", "AGENTS.md", "CLAUDE.md", ".codex/instructions.md"}
    ]
    artifact_changed = any(path in {name for name, _ in ARTIFACTS} for path in paths)
    if not code and not artifact_changed:
        return []
    staged = set(paths)
    def staged_loader(filename: str) -> str:
        if filename in staged:
            value = git("show", f":{filename}", check=False)
            if not value:
                raise FileNotFoundError(f"{filename}: deleted")
            return value + "\n"
        value = git("show", f"HEAD:{filename}", check=False)
        if value:
            return value + "\n"
        return (ROOT / filename).read_text(encoding="utf-8")
    errors = validate_artifacts(loader=staged_loader)
    if not code:
        return errors
    try:
        meta, _ = parse_frontmatter_text(staged_loader("plan.md"), "plan.md")
    except (GateError, FileNotFoundError) as exc:
        return errors + [f"code changes require plan.md: {exc}"]
    if meta.get("status") not in {"approved", "complete"}:
        errors.append("code changes require an approved plan.md")
    if not str(meta.get("approval_evidence", "")).strip() or meta.get("approval_evidence") == "pending":
        errors.append("code changes require plan approval evidence")
    return errors


def emit(errors: list[str]) -> int:
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("SDLC gate: clean")
    return 0


def init_artifacts(change_id: str, source: str, risk: str, replace_complete: bool = False) -> int:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{5,63}", change_id):
        raise GateError("change_id must be 6-64 lowercase letters, digits, or hyphens")
    if risk not in RISKS:
        raise GateError(f"risk must be one of: {', '.join(sorted(RISKS))}")
    existing = [(ROOT / filename) for filename, _ in ARTIFACTS if (ROOT / filename).exists()]
    if existing:
        if not replace_complete:
            raise GateError("an artifact set already exists; archive through Git history, do not overwrite it")
        errors = validate_artifacts(history=True)
        maintenance, _ = parse_frontmatter(ROOT / "maintenance.md")
        if errors or maintenance.get("status") != "complete":
            detail = "; ".join(errors) if errors else "maintenance.md is not complete"
            raise GateError(f"current loop cannot be replaced: {detail}")
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    parent = "none"
    for filename, stage in ARTIFACTS:
        token = f"sdlc/{change_id}/{stage}/r1"
        content = (
            "---\n"
            f"change_id: {change_id}\nstage: {stage}\nstatus: pending\nrevision: 1\n"
            f"source: {source}\ncreated_at: {now}\nupdated_at: {now}\n"
            f"parent_artifact_commit: {parent}\nartifact_commit: {token}\n"
            f"risk_level: {risk}\nowner_role: sdlc-agent\n"
            "approval_required: false\napproval_evidence: none\n---\n\n"
            f"# {stage.title()}\n\nPending for this loop.\n"
        )
        (ROOT / filename).write_text(content, encoding="utf-8")
        parent = token
    print(change_id)
    return 0


def replace_frontmatter(path: Path, updates: dict[str, object]) -> None:
    text = path.read_text(encoding="utf-8")
    raw, body = text[4:].split("\n---\n", 1)
    lines = raw.splitlines()
    remaining = dict(updates)
    for index, line in enumerate(lines):
        key = line.split(":", 1)[0].strip()
        if key in remaining:
            value = remaining.pop(key)
            if isinstance(value, bool):
                value = str(value).lower()
            lines[index] = f"{key}: {value}"
    for key, value in remaining.items():
        lines.append(f"{key}: {value}")
    path.write_text("---\n" + "\n".join(lines) + "\n---\n" + body, encoding="utf-8")


def approve_plan(evidence: str) -> int:
    plan_path = ROOT / "plan.md"
    meta, _ = parse_frontmatter(plan_path)
    if meta.get("status") != "ready":
        raise GateError("plan.md must be ready before approval")
    if not re.fullmatch(r"github-environment:https://[^\s]+/actions/runs/[0-9]+:reviewer=[A-Za-z0-9-]+", evidence):
        raise GateError("plan approval evidence must identify the environment run and reviewer")
    revision = int(meta["revision"]) + 1
    token = f"sdlc/{meta['change_id']}/build/r{revision}"
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    replace_frontmatter(plan_path, {
        "status": "approved", "revision": revision, "updated_at": now,
        "artifact_commit": token, "approval_required": True,
        "approval_evidence": evidence,
    })
    replace_frontmatter(ROOT / "verification.md", {"parent_artifact_commit": token})
    print(token)
    return 0


def revise_artifact(filename: str) -> int:
    names = {name: stage for name, stage in ARTIFACTS}
    if filename not in names:
        raise GateError(f"unknown artifact: {filename}")
    path = ROOT / filename
    meta, _ = parse_frontmatter(path)
    revision = int(meta["revision"]) + 1
    token = f"sdlc/{meta['change_id']}/{names[filename]}/r{revision}"
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    replace_frontmatter(path, {"revision": revision, "updated_at": now, "artifact_commit": token})
    index = [name for name, _ in ARTIFACTS].index(filename)
    if index + 1 < len(ARTIFACTS):
        replace_frontmatter(ROOT / ARTIFACTS[index + 1][0], {"parent_artifact_commit": token})
    print(token)
    return 0


def complete_release(evidence: str, deployed_version: str) -> int:
    if not re.fullmatch(r"[0-9a-f]{40}", deployed_version):
        raise GateError("deployed version must be a full Git commit SHA")
    if not re.fullmatch(r"github-pr:https://[^;\s]+:reviewer=[A-Za-z0-9-]+;zeabur-deployment:https://[^\s]+", evidence):
        raise GateError("release evidence must identify PR reviewer and Zeabur deployment")
    meta, _ = parse_frontmatter(ROOT / "release.md")
    if meta.get("status") != "ready":
        raise GateError("release.md must be ready before release completion")
    replace_frontmatter(ROOT / "release.md", {
        "status": "complete", "approval_required": True, "approval_evidence": evidence,
    })
    with (ROOT / "release.md").open("a", encoding="utf-8") as handle:
        handle.write(f"\n## Deployment evidence\n\n- Version: {deployed_version}\n- Approval/deployment: {evidence}\n")
    return revise_artifact("release.md")


def complete_maintenance(evidence: str, deployed_version: str) -> int:
    release, _ = parse_frontmatter(ROOT / "release.md")
    if release.get("status") != "complete":
        raise GateError("release.md must be complete before maintenance completion")
    if not re.fullmatch(r"[0-9a-f]{40}", deployed_version):
        raise GateError("deployed version must be a full Git commit SHA")
    if not re.fullmatch(r"observation:https://[^\s]+", evidence):
        raise GateError("maintenance evidence must identify an observation run")
    replace_frontmatter(ROOT / "maintenance.md", {
        "status": "complete", "approval_evidence": evidence,
    })
    with (ROOT / "maintenance.md").open("a", encoding="utf-8") as handle:
        handle.write(f"\n## Completion evidence\n\n- Version: {deployed_version}\n- Observation: {evidence}\n")
    return revise_artifact("maintenance.md")


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    validate = sub.add_parser("validate")
    validate.add_argument("--history", action="store_true")
    sub.add_parser("precommit")
    init = sub.add_parser("init")
    init.add_argument("--change-id", required=True)
    init.add_argument("--source", required=True)
    init.add_argument("--risk", default="medium")
    init.add_argument("--replace-complete", action="store_true")
    approve = sub.add_parser("approve-plan")
    approve.add_argument("--evidence", required=True)
    revise = sub.add_parser("revise")
    revise.add_argument("artifact", choices=[name for name, _ in ARTIFACTS])
    complete_release_parser = sub.add_parser("complete-release")
    complete_release_parser.add_argument("--evidence", required=True)
    complete_release_parser.add_argument("--deployed-version", required=True)
    complete_maintenance_parser = sub.add_parser("complete-maintenance")
    complete_maintenance_parser.add_argument("--evidence", required=True)
    complete_maintenance_parser.add_argument("--deployed-version", required=True)
    args = parser.parse_args()
    try:
        if args.command == "validate":
            return emit(validate_artifacts(args.history))
        if args.command == "precommit":
            return emit(validate_precommit())
        if args.command == "init":
            return init_artifacts(args.change_id, args.source, args.risk, args.replace_complete)
        if args.command == "approve-plan":
            return approve_plan(args.evidence)
        if args.command == "revise":
            return revise_artifact(args.artifact)
        if args.command == "complete-release":
            return complete_release(args.evidence, args.deployed_version)
        if args.command == "complete-maintenance":
            return complete_maintenance(args.evidence, args.deployed_version)
    except GateError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
