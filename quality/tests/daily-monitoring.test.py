#!/usr/bin/env python3
"""Daily monitoring boundaries, sanitized fetch failures and backup publication."""
import importlib.util
import io
import json
import os
from email.message import Message
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("daily", ROOT / "scripts/sdlc-daily.py")
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)
monitor = daily.monitor


def sample():
    now = int(time.time())
    end = now // 86400 * 86400
    return dict(schema_version=1, window_start_epoch=end - 86400, window_end_epoch=end,
                generated_at_epoch=now, source_last_observed_epoch=now - 30,
                observed_minutes=1440, sample_count=1000, five_xx_count=20, five_xx_rate=.02,
                resource_utilization=.5, previous_observed_minutes=1440,
                previous_sample_count=1000, previous_five_xx_rate=.03,
                previous_resource_utilization=.9, previous_window_available=True,
                backup_completed_at_epoch=now - 3600, backup_age_hours=1)


class Response(io.BytesIO):
    def __init__(self, value, content_type="application/json", status=200):
        super().__init__(value)
        self.headers = Message()
        self.headers["Content-Type"] = content_type
        self.status = status


class DailyTests(unittest.TestCase):
    def test_normal_and_same_metric_consecutive_days(self):
        data = monitor.validate_aggregate(sample())
        bands = monitor.parse_bands(ROOT / "bands.yaml")
        self.assertEqual(["5xx_rate_two_windows"], monitor.evaluate(data, bands)["reasons"])
        # Yesterday's resource breach + today's 5xx breach is not two windows.
        data["previous_five_xx_rate"] = 0
        self.assertEqual("observe", monitor.evaluate(data, bands)["severity"])
        data["resource_utilization"] = .9
        self.assertEqual(["resource_two_windows"], monitor.evaluate(data, bands)["reasons"])

    def test_backup_staleness_does_not_require_two_days(self):
        data = sample()
        data["backup_completed_at_epoch"] = data["generated_at_epoch"] - 27 * 3600
        data["backup_age_hours"] = 27
        result = monitor.evaluate(monitor.validate_aggregate(data), monitor.parse_bands(ROOT / "bands.yaml"))
        self.assertIn("backup_stale", result["reasons"])

    def test_empty_and_partial_metrics_rejected(self):
        for data in ({}, {"five_xx_rate": 0}, {"available": False}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                monitor.validate_aggregate(data)

    def test_invalid_contract_and_freshness(self):
        now = int(time.time())
        invalid = dict(schema_version=2, sample_count=0, five_xx_count=1001,
                       observed_minutes=1367, previous_observed_minutes=1441,
                       previous_window_available=False, previous_five_xx_rate=1.1,
                       generated_at_epoch=now - 301, source_last_observed_epoch=now - 181,
                       backup_completed_at_epoch=now + 1, backup_age_hours=3,
                       window_start_epoch=now, window_end_epoch=now,
                       five_xx_rate=float('nan'), resource_utilization=True)
        for key, value in invalid.items():
            with self.subTest(key=key), self.assertRaises(ValueError):
                monitor.validate_aggregate({**sample(), key: value}, now=now)

    def test_initial_baseline_explicit(self):
        data = sample()
        data.update(previous_observed_minutes=0, previous_sample_count=0,
                    previous_five_xx_rate=0, previous_resource_utilization=0,
                    previous_window_available=False)
        result = monitor.evaluate(monitor.validate_aggregate(data), monitor.parse_bands(ROOT / 'bands.yaml'))
        self.assertEqual(['previous_window_unavailable'], result['reasons'])

    def test_fetch_auth_deadline_and_numeric_payload(self):
        opener = Mock()
        opener.open.return_value = Response(json.dumps(sample()).encode())
        self.assertEqual(1000, daily.collect('https://monitor.example/daily', 'x' * 32, opener)['sample_count'])
        request = opener.open.call_args.args[0]
        self.assertEqual('Bearer ' + 'x' * 32, request.get_header('Authorization'))
        self.assertEqual(15, opener.open.call_args.kwargs['timeout'])

    def test_unsafe_urls_are_rejected_before_network(self):
        for url in ('http://monitor.example', 'https://user:pass@monitor.example', '', 'https://monitor.example/#fragment'):
            opener = Mock()
            with self.subTest(url=url), self.assertRaises(ValueError):
                daily.collect(url, 'x' * 32, opener)
            opener.open.assert_not_called()

    def test_redirect_does_not_forward_credentials(self):
        self.assertIsNone(daily.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://elsewhere.example'))

    def test_http_error_malformed_or_oversized_payload_rejected(self):
        for body, content_type, status in [(b'<html>private text</html>', 'text/html', 200),
                                            (b'{}', 'application/json', 401),
                                            (b'invalid', 'application/json', 200),
                                            (b' ' * 16385, 'application/json', 200)]:
            opener = Mock()
            opener.open.return_value = Response(body, content_type, status)
            with self.subTest(status=status, body_len=len(body)), self.assertRaises(ValueError):
                daily.collect('https://monitor.example', 'x' * 32, opener)

    def test_timeout_persists_only_fixed_failure_reason(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(daily, 'collect', side_effect=TimeoutError('private token')):
            path = Path(directory)
            (path / 'daily-metrics.json').write_text('stale successful metrics')
            with patch('sys.argv', ['sdlc-daily.py', directory]), patch('sys.stdout', new_callable=io.StringIO) as output:
                self.assertEqual(1, daily.main())
            self.assertNotIn('private token', output.getvalue())
            self.assertFalse((path / 'daily-metrics.json').exists())
            result = json.loads((path / 'zeabur-aggregate-evaluation.json').read_text())
            self.assertEqual('diagnose', result['severity'])
            self.assertEqual(['daily_aggregate_unavailable'], result['reasons'])


class BackupTests(unittest.TestCase):
    def test_cron_preserves_the_monitor_opt_in(self):
        entrypoint = (ROOT / 'services/backup-service/cron-entrypoint.sh').read_text()
        exported = entrypoint.split('names=(', 1)[1].split(')', 1)[0].split()
        self.assertIn('BACKUP_MONITOR_ENABLED', exported)

    def run_backup(self, fail_upload=False, fail_publish=False, enabled=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commands = {
                'pg_dump': 'for arg in "$@"; do case "$arg" in --file=*) touch "${arg#--file=}";; esac; done',
                'mongodump': 'for arg in "$@"; do case "$arg" in --archive=*) touch "${arg#--archive=}";; esac; done',
                'coscli': 'echo upload >> "$TRACE"; exit "$FAIL_UPLOAD"',
                'psql': 'echo publish >> "$TRACE"; exit "$FAIL_PUBLISH"',
            }
            for name, source in commands.items():
                target = root / name
                target.write_text('#!/usr/bin/env bash\n' + source + '\n')
                target.chmod(0o755)
            env = {**os.environ, 'PATH': str(root) + os.pathsep + os.environ['PATH'],
                   'POSTGRES_HOST': 'fixture', 'POSTGRES_PORT': '5432', 'POSTGRES_DB': 'fixture',
                   'POSTGRES_USER': 'fixture', 'PGPASSWORD': 'fixture', 'MONGO_URI': 'fixture',
                   'BACKUP_COS_BUCKET': 'fixture', 'BACKUP_COS_REGION': 'fixture',
                   'COS_SECRET_ID': 'fixture', 'COS_SECRET_KEY': 'fixture',
                   'BACKUP_STATUS_FILE': str(root / 'status.json'), 'BACKUP_ALERT_WEBHOOK': '',
                   'BACKUP_MONITOR_ENABLED': str(enabled).lower(), 'TRACE': str(root / 'trace'),
                   'FAIL_UPLOAD': str(int(fail_upload)), 'FAIL_PUBLISH': str(int(fail_publish))}
            result = subprocess.run(['bash', str(ROOT / 'services/backup-service/backup.sh')], env=env, capture_output=True, text=True)
            return result.returncode, (root / 'trace').read_text().splitlines()

    def test_success_publishes_after_all_uploads(self):
        code, trace = self.run_backup()
        self.assertEqual(0, code)
        self.assertGreaterEqual(trace.count('upload'), 2)
        self.assertEqual('publish', trace[-1])

    def test_failed_upload_never_updates_success_timestamp(self):
        code, trace = self.run_backup(fail_upload=True)
        self.assertNotEqual(0, code)
        self.assertNotIn('publish', trace)

    def test_failed_publish_is_visible_and_feature_can_be_disabled(self):
        self.assertNotEqual(0, self.run_backup(fail_publish=True)[0])
        code, trace = self.run_backup(enabled=False)
        self.assertEqual(0, code)
        self.assertNotIn('publish', trace)


if __name__ == '__main__':
    unittest.main()
