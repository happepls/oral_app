import importlib.util
import ast
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "quality/fixtures/sdlc"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sdlc = load("sdlc", ROOT / "scripts/sdlc.py")
monitor = load("sdlc_monitor", ROOT / "scripts/sdlc-monitor.py")
review = load("sdlc_review", ROOT / "scripts/sdlc-review.py")


class ArtifactGateTests(unittest.TestCase):
    def test_repository_artifacts_are_valid(self):
        self.assertEqual([], sdlc.validate_artifacts())

    def test_code_requires_approved_plan(self):
        original = sdlc.parse_frontmatter_text
        try:
            sdlc.parse_frontmatter_text = lambda _text, _name: ({"status": "ready", "approval_evidence": "none"}, "")
            errors = sdlc.validate_precommit(["client/src/example.js"])
            self.assertTrue(any("approved plan" in error for error in errors))
        finally:
            sdlc.parse_frontmatter_text = original

    def test_governance_only_change_does_not_need_plan(self):
        self.assertEqual([], sdlc.validate_precommit(["docs/ai-sdlc.md"]))

    def test_artifact_only_commit_still_runs_validation(self):
        original = sdlc.validate_artifacts
        try:
            sdlc.validate_artifacts = lambda **_kwargs: ["invalid staged artifact"]
            self.assertEqual(["invalid staged artifact"], sdlc.validate_precommit(["plan.md"]))
        finally:
            sdlc.validate_artifacts = original

    def validate_mutation(self, filename, old, new):
        artifacts = {name: (FIXTURES / name).read_text() for name, _stage in sdlc.ARTIFACTS}
        self.assertEqual([], sdlc.validate_artifacts(loader=artifacts.__getitem__))
        self.assertEqual(1, artifacts[filename].count(old), "mutation must target exactly one fixture value")
        self.assertNotEqual(old, new, "mutation must actually change the fixture")
        artifacts[filename] = artifacts[filename].replace(old, new, 1)
        return sdlc.validate_artifacts(loader=artifacts.__getitem__)

    def test_fixtures_are_independent_of_live_root(self):
        original_root = sdlc.ROOT
        try:
            with tempfile.TemporaryDirectory() as directory:
                sdlc.ROOT = Path(directory)
                errors = self.validate_mutation("spec.md", "change_id: fixture-example-loop", "change_id: unrelated-next-loop")
                self.assertTrue(any("change_id mismatch" in error for error in errors))
        finally:
            sdlc.ROOT = original_root

    def test_fixture_can_model_a_later_loop_and_release_state(self):
        artifacts = {name: (FIXTURES / name).read_text().replace("fixture-example-loop", "issue-123-next-loop").replace("/r1", "/r7").replace("revision: 1", "revision: 7") for name, _stage in sdlc.ARTIFACTS}
        artifacts["release.md"] = artifacts["release.md"].replace("status: pending", "status: ready")
        self.assertEqual([], sdlc.validate_artifacts(loader=artifacts.__getitem__))

    def test_missing_mutation_target_fails_fast(self):
        with self.assertRaisesRegex(AssertionError, "exactly one fixture value"):
            self.validate_mutation("spec.md", "change_id: nonexistent-old-loop", "change_id: different-change")

    def test_change_id_mismatch_is_rejected(self):
        errors = self.validate_mutation("spec.md", "change_id: fixture-example-loop", "change_id: different-change")
        self.assertTrue(any("change_id mismatch" in error for error in errors))

    def test_missing_required_field_is_rejected(self):
        errors = self.validate_mutation("intent.md", "owner_role: fixture-owner\n", "")
        self.assertTrue(any("missing fields: owner_role" in error for error in errors))

    def test_stage_skip_is_rejected(self):
        errors = self.validate_mutation("spec.md", "status: complete", "status: pending")
        self.assertTrue(any("stage advanced" in error for error in errors))

    def test_approved_plan_without_evidence_is_rejected(self):
        errors = self.validate_mutation(
            "plan.md",
            "approval_evidence: fixture-plan-approval",
            "approval_evidence: pending",
        )
        self.assertTrue(any("approval" in error and "evidence" in error for error in errors))

    def test_planned_command_cannot_masquerade_as_actual(self):
        errors = self.validate_mutation("verification.md", "- `fixture-check` — exit 0", "- planned: npm test")
        self.assertTrue(any("exit N evidence" in error for error in errors))

    def test_unresolved_artifact_commit_is_rejected_in_history_mode(self):
        original_git = sdlc.git
        try:
            sdlc.git = lambda *args, **kwargs: ""
            errors = sdlc.validate_artifacts(history=True, loader=lambda name: (FIXTURES / name).read_text())
        finally:
            sdlc.git = original_git
        self.assertTrue(any("expected one commit trailer" in error for error in errors))

    def test_sha_shaped_artifact_commit_is_rejected(self):
        errors = self.validate_mutation(
            "intent.md", "artifact_commit: sdlc/fixture-example-loop/plan/r1",
            "artifact_commit: " + "0" * 40,
        )
        self.assertTrue(any("invalid artifact_commit" in error for error in errors))

    def test_token_must_match_frontmatter(self):
        errors = self.validate_mutation(
            "spec.md", "artifact_commit: sdlc/fixture-example-loop/design/r1",
            "artifact_commit: sdlc/fixture-example-loop/build/r1",
        )
        self.assertTrue(any("does not match change_id" in error for error in errors))

    def test_complete_approval_gate_requires_evidence(self):
        errors = self.validate_mutation("release.md", "status: pending", "status: complete")
        self.assertTrue(any("approval-gated stage lacks durable evidence" in error for error in errors))


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.bands = monitor.parse_bands(ROOT / "bands.yaml")

    def test_single_timeout_only_observes(self):
        result = monitor.evaluate({"health_consecutive_failures": 1}, self.bands)
        self.assertEqual("observe", result["severity"])

    def test_repeated_5xx_triggers_diagnosis(self):
        result = monitor.evaluate({"five_xx_rate": 0.02, "consecutive_windows": 2}, self.bands)
        self.assertEqual("diagnose", result["severity"])

    def test_security_event_is_immediate_and_secrets_are_redacted(self):
        result = monitor.evaluate({
            "critical_security_event": True,
            "summary": "token=abc123 email=a@example.com sk-abcdefghijklmnopqrstuvwxyz",
        }, self.bands)
        self.assertEqual("immediate", result["severity"])
        self.assertNotIn("abc123", result["redacted_summary"])
        self.assertNotIn("a@example.com", result["redacted_summary"])
        self.assertNotIn("sk-abc", result["redacted_summary"])

    def test_security_severity_cannot_be_downgraded(self):
        result = monitor.evaluate({
            "critical_security_event": True, "five_xx_rate": 0.1,
            "consecutive_windows": 2, "backup_age_hours": 99,
        }, self.bands)
        self.assertEqual("immediate", result["severity"])

    def test_aggregate_rejects_free_text(self):
        with self.assertRaises(ValueError):
            monitor.validate_aggregate({"five_xx_rate": 0.1, "message": "user said hello"})

    def test_aggregate_rejects_invalid_numeric_types_and_ranges(self):
        for value in (True, -0.1, float("nan"), 1.1):
            with self.subTest(value=value), self.assertRaises(ValueError):
                monitor.validate_aggregate({"five_xx_rate": value})
        with self.assertRaises(ValueError):
            monitor.validate_aggregate({"critical_security_event": 1})


class ReviewGateTests(unittest.TestCase):
    def test_review_requires_all_classified_risks(self):
        with tempfile.TemporaryDirectory() as directory:
            release = Path(directory) / "release.md"
            release.write_text("""---
status: ready
---
<!-- sdlc-review-json
{"base_sha":"0000000000000000000000000000000000000000","head_sha":"1111111111111111111111111111111111111111","scope":"full diff","commands":["npm test"],"risk_areas":["auth"],"findings":[]}
-->
## Review evidence
- Scope: full diff
- Diff: abc..def
- Commands: npm test
- Risk areas: auth
- Findings: none
- Unresolved high/critical: 0
- Recommendation: ready
""")
            errors = review.validate_evidence(release, {"auth": [], "stripe": []})
        self.assertTrue(any("stripe" in error for error in errors))

    def test_review_blocks_unresolved_high_findings(self):
        with tempfile.TemporaryDirectory() as directory:
            release = Path(directory) / "release.md"
            release.write_text("""---
status: ready
---
<!-- sdlc-review-json
{"base_sha":"0000000000000000000000000000000000000000","head_sha":"1111111111111111111111111111111111111111","scope":"full diff","commands":["npm test"],"risk_areas":["auth"],"findings":[{"severity":"high","location":"x:1","impact":"bad","fix":"fix","resolved":false}]}
-->
## Review evidence
- Scope: full diff
- Diff: abc..def
- Commands: npm test
- Risk areas: auth
- Findings: one high
- Unresolved high/critical: 1
- Recommendation: blocked
""")
            errors = review.validate_evidence(release, {"auth": []})
        self.assertTrue(any("unresolved" in error for error in errors))


class WorkflowContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loop = (ROOT / ".github/workflows/sdlc-loop.yml").read_text()
        cls.maintain = (ROOT / ".github/workflows/sdlc-maintain.yml").read_text()

    @staticmethod
    def step(workflow, name):
        return workflow.split(f"      - name: {name}\n", 1)[1].split("      - ", 1)[0]

    def scheduled_step_runs(self, name, schedule="", cadence="", event="schedule", enabled="true", severity="", previous_success=True):
        step = self.step(self.maintain, name)
        expression = re.search(r"^        if: (.+)$", step, re.M).group(1)
        # GitHub implicitly requires success() unless a status function is present.
        if "always()" not in expression and not previous_success:
            return False
        expression = expression.replace("always()", "True")
        for field, value in {"github.event.schedule": schedule, "inputs.cadence": cadence, "github.event_name": event, "vars.DAILY_AGGREGATES_ENABLED": enabled, "steps.combined.outputs.severity": severity}.items():
            expression = expression.replace(field, repr(value))
        tree = ast.parse(expression.replace("||", "or").replace("&&", "and"), mode="eval")

        def evaluate(node):
            if isinstance(node, ast.Constant):
                return node.value
            if isinstance(node, ast.BoolOp):
                values = [evaluate(value) for value in node.values]
                if isinstance(node.op, ast.Or):
                    return any(values)
                if isinstance(node.op, ast.And):
                    return all(values)
            if isinstance(node, ast.Compare) and len(node.ops) == 1 and isinstance(node.ops[0], ast.Eq):
                return evaluate(node.left) == evaluate(node.comparators[0])
            self.fail(f"Unexpected schedule expression: {ast.dump(node)}")

        return evaluate(tree.body)

    def test_each_commit_job_sets_local_identity_on_a_clean_repository(self):
        for job in ("plan-design", "build-test-review"):
            with self.subTest(job=job), tempfile.TemporaryDirectory() as directory:
                block = self.loop.split(f"  {job}:\n", 1)[1].split("\n  build-test-review:", 1)[0]
                identity = self.step(block, "Configure commit identity")
                commands = identity.split("        run: |\n", 1)[1]
                self.assertLess(block.index("Configure commit identity"), block.index("git commit"))
                env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_") and key != "EMAIL"}
                env.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull, GIT_CONFIG_NOSYSTEM="1")

                def run(*args):
                    return subprocess.run(args, cwd=directory, env=env, check=True, text=True, capture_output=True).stdout.strip()

                run("git", "init")
                run("bash", "-eu", "-c", commands)
                run("git", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "synthetic identity test")
                self.assertEqual("github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>", run("git", "log", "-1", "--format=%an <%ae>"))
                self.assertEqual("local", run("git", "config", "--show-scope", "--get", "user.name").split()[0])

    def test_verification_setup_precedes_build_and_is_shared_with_clean_ci(self):
        build = self.loop.split("  build-test-review:\n", 1)[1]
        setup = "uses: ./.github/actions/setup-verification"
        self.assertLess(build.index("Record plan approval"), build.index(setup))
        self.assertLess(build.index(setup), build.index("Build one task block"))
        self.assertLess(build.index(setup), build.index("npm run verify"))
        clean_ci = (ROOT / ".github/workflows/sdlc-toolchain.yml").read_text()
        self.assertIn(setup, clean_ci)
        self.assertIn("run: npm run verify", clean_ci)
        self.assertNotIn("secrets.", clean_ci)
        action = (ROOT / ".github/actions/setup-verification/action.yml").read_text()
        self.assertIn("node-version: 20.x", action)
        self.assertIn("python-version: '3.10'", action)
        self.assertIn("bash scripts/ci/install-verification-deps.sh", action)

    def test_installer_covers_verifier_services_and_checks_download(self):
        installer = (ROOT / "scripts/ci/install-verification-deps.sh").read_text()
        verifier = (ROOT / "scripts/quality/verify.mjs").read_text()
        self.assertIn("\nnpm ci\n", installer)
        self.assertIn("npm ci --legacy-peer-deps --prefix client", installer)
        for service in set(re.findall(r"cwd: path.join\(root, 'services/([^']+)'\)", verifier)):
            self.assertIn(service, installer)
        self.assertIn('npm ci --prefix "services/$service"', installer)
        for service in ("workflow-service", "ai-omni-service"):
            self.assertIn(f"-r services/{service}/requirements.txt", installer)
        self.assertIn("pytest pytest-asyncio", installer)
        self.assertRegex(installer, r"gitleaks_sha256=[0-9a-f]{64}\n")
        self.assertLess(installer.index("sha256sum --check --strict"), installer.index("tar -xzf"))
        self.assertIn("GITHUB_PATH", installer)

    def test_schedule_events_partition_every_quarter_hour(self):
        self.assertEqual(["*/15 * * * *", "15 0 * * *"], re.findall(r"cron: '([^']+)'", self.maintain))
        for hour in range(24):
            for minute in (0, 15, 30, 45):
                schedule = "*/15 * * * *"
                with self.subTest(hour=hour, minute=minute):
                    self.assertFalse(self.scheduled_step_runs("Read daily structured aggregates", schedule))

    def test_old_delayed_events_do_not_reenable_deferred_aggregates(self):
        # Previously queued schedule events must also stay health-only.
        for name in ("Read daily structured aggregates",):
            self.assertFalse(self.scheduled_step_runs(name, "0 0 * * *"))
            self.assertNotIn("date ", self.step(self.maintain, name))
        self.assertFalse(self.scheduled_step_runs("Read daily structured aggregates", "15 0 * * *", enabled="false"))
        self.assertTrue(self.scheduled_step_runs("Read daily structured aggregates", "15 0 * * *"))
        self.assertIn("'metrics': metrics", self.maintain)

    def test_manual_cadence_is_explicit_and_defaults_to_health(self):
        self.assertIn("default: health", self.maintain)
        for cadence in ("", "health", "hourly", "daily"):
            with self.subTest(cadence=cadence):
                self.assertEqual(cadence == "daily", self.scheduled_step_runs("Read daily structured aggregates", cadence=cadence, event="workflow_dispatch", enabled="false"))
        self.assertIn("options: [health, daily]", self.maintain)

    def test_queue_has_close_and_periodic_recovery(self):
        self.assertIn("pull_request_target:", self.loop)
        self.assertIn("cron: '*/10 * * * *'", self.loop)
        self.assertIn("for orphan in", self.loop)
        self.assertLess(self.loop.index("gh pr create"), self.loop.rindex("--add-label sdlc:active"))

    def test_approval_is_bound_to_state_and_environment(self):
        self.assertIn('.state == "approved"', self.loop)
        self.assertIn('.name == "sdlc-plan"', self.loop)

    def test_test_stage_completes_and_every_artifact_write_has_trailer(self):
        self.assertIn("blocked on failure or complete on success", self.loop)
        self.assertIn("SDLC-Artifact: $token", self.loop)
        self.assertIn("validate --history", self.loop)

    def test_aggregate_severity_is_combined(self):
        self.assertIn("Combine health and aggregate severity", self.maintain)
        self.assertIn("steps.combined.outputs.severity", self.maintain)

    def test_diagnostic_queue_survives_failed_collection_without_queueing_healthy_runs(self):
        for previous_success in (True, False):
            for severity in ("", "normal", "watch", "diagnose", "immediate"):
                with self.subTest(previous_success=previous_success, severity=severity):
                    self.assertEqual(
                        severity in ("diagnose", "immediate"),
                        self.scheduled_step_runs("Queue evidence-backed diagnostic", severity=severity, previous_success=previous_success),
                    )

    def test_diagnostic_queue_token_can_read_prs_and_write_issues(self):
        permissions = self.maintain.split("permissions:\n", 1)[1].split("\n\n", 1)[0]
        self.assertIn("  pull-requests: read", permissions)
        self.assertIn("  issues: write", permissions)


if __name__ == "__main__":
    unittest.main()
