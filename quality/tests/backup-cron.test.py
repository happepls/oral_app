"""Run the real entrypoint in an isolated directory with a stub cron."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ENTRYPOINT = Path(__file__).resolve().parents[2] / 'services/backup-service/cron-entrypoint.sh'

class CronCredentials(unittest.TestCase):
    def run_entrypoint(self, values):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            status = root / 'environment'
            stub = root / 'cron'
            stub.write_text('#!/bin/sh\nexit 0\n')
            stub.chmod(0o755)
            script = ENTRYPOINT.read_text().replace('/run/oral-backup.env', str(status))
            result = subprocess.run(['bash', '-c', script], env={'PATH': directory + ':' + os.environ['PATH'], **values}, capture_output=True)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout, b'')
            self.assertEqual(status.stat().st_mode & 0o777, 0o600)
            check = subprocess.check_output(['bash', '-c', '. "$1"; printf "%s|%s" "$COS_SECRET_ID" "$COS_SECRET_KEY"', 'check', str(status)])
            return check.decode()

    def test_aliases_reach_cron_with_shell_characters_preserved(self):
        self.assertEqual(self.run_entrypoint({'TENCENT_SECRET_ID': 'local id', 'TENCENT_SECRET_KEY': 'fake;$key'}), 'local id|fake;$key')

    def test_explicit_values_win(self):
        self.assertEqual(self.run_entrypoint({'COS_SECRET_ID': 'explicit', 'COS_SECRET_KEY': 'key', 'TENCENT_SECRET_ID': 'alias', 'TENCENT_SECRET_KEY': 'alias'}), 'explicit|key')

    def test_missing_credentials_remain_empty(self):
        self.assertEqual(self.run_entrypoint({}), '|')

if __name__ == '__main__':
    unittest.main()
