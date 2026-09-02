import importlib.util
import shutil
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


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
        original_root = sdlc.ROOT
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            for artifact, _stage in sdlc.ARTIFACTS:
                shutil.copy(ROOT / artifact, temp / artifact)
            path = temp / filename
            path.write_text(path.read_text().replace(old, new, 1))
            sdlc.ROOT = temp
            try:
                return sdlc.validate_artifacts()
            finally:
                sdlc.ROOT = original_root

    def test_change_id_mismatch_is_rejected(self):
        errors = self.validate_mutation("spec.md", "change_id: ai-native-sdlc-bootstrap", "change_id: different-change")
        self.assertTrue(any("change_id mismatch" in error for error in errors))

    def test_missing_required_field_is_rejected(self):
        errors = self.validate_mutation("intent.md", "owner_role: product-owner\n", "")
        self.assertTrue(any("missing fields: owner_role" in error for error in errors))

    def test_stage_skip_is_rejected(self):
        errors = self.validate_mutation("spec.md", "status: complete", "status: pending")
        self.assertTrue(any("stage advanced" in error for error in errors))

    def test_approved_plan_without_evidence_is_rejected(self):
        errors = self.validate_mutation(
            "plan.md",
            "approval_evidence: explicit-user-request-to-implement-provided-plan-2026-09-02",
            "approval_evidence: pending",
        )
        self.assertTrue(any("approval" in error and "evidence" in error for error in errors))

    def test_planned_command_cannot_masquerade_as_actual(self):
        original_root = sdlc.ROOT
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            for artifact, _stage in sdlc.ARTIFACTS:
                shutil.copy(ROOT / artifact, temp / artifact)
            verification = temp / "verification.md"
            text = verification.read_text()
            before, rest = text.split("## Actual commands", 1)
            _actual, after = rest.split("## Results", 1)
            verification.write_text(before + "## Actual commands\n\n- planned: npm test\n\n## Results" + after)
            sdlc.ROOT = temp
            try:
                errors = sdlc.validate_artifacts()
            finally:
                sdlc.ROOT = original_root
        self.assertTrue(any("exit N evidence" in error for error in errors))

    def test_unresolved_artifact_commit_is_rejected_in_history_mode(self):
        original_git = sdlc.git
        try:
            sdlc.git = lambda *args, **kwargs: ""
            errors = sdlc.validate_artifacts(history=True)
        finally:
            sdlc.git = original_git
        self.assertTrue(any("expected one commit trailer" in error for error in errors))

    def test_sha_shaped_artifact_commit_is_rejected(self):
        errors = self.validate_mutation(
            "intent.md", "artifact_commit: sdlc/ai-native-sdlc-bootstrap/plan/r1",
            "artifact_commit: " + "0" * 40,
        )
        self.assertTrue(any("invalid artifact_commit" in error for error in errors))

    def test_token_must_match_frontmatter(self):
        errors = self.validate_mutation(
            "spec.md", "artifact_commit: sdlc/ai-native-sdlc-bootstrap/design/r1",
            "artifact_commit: sdlc/ai-native-sdlc-bootstrap/build/r1",
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


if __name__ == "__main__":
    unittest.main()
