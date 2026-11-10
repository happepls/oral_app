import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

import zeabur_release as release


COMMIT = 'a' * 40
DIGEST = 'sha256:' + 'b' * 64
SOURCE = 'c' * 64
OLD_SOURCE = 'd' * 64


def plan():
    return {'ready': True, 'repository': release.REPO, 'commit': COMMIT,
            'gates': {key: [i, 1] for i, key in enumerate(release.REQUIRED)},
            'images': {name: DIGEST for name in release.SERVICES},
            'sources': {name: SOURCE for name in release.SERVICES}}


class FakeGitHub:
    approved = True

    def gates(self, commit):
        return plan()['gates']

    def approval_configured(self):
        return self.approved


class FakeZeabur:
    def __init__(self):
        self.states = {name: {'dockerfile': 'FROM ghcr.io/' + release.REPO + '/' + name + ':12381c9\nENV EXISTING=kept\n',
                             'deployment': 'old', 'status': 'RUNNING', 'deployment_status': 'RUNNING'}
                       for name in release.SERVICES}
        self.writes = []
        self.fail_update = None

    def state(self, name):
        return dict(self.states[name])

    def probe(self, name):
        new = '@sha256:' in self.states[name]['dockerfile']
        return {'health': 200, 'source': SOURCE if new else OLD_SOURCE, 'flag': 'unset'}

    def update(self, name, dockerfile):
        self.writes.append(('update', name, dockerfile))
        self.states[name]['dockerfile'] = dockerfile
        if self.fail_update == name:
            self.fail_update = None
            raise release.ReleaseError('uncertain_write_response')

    def redeploy(self, name):
        self.writes.append(('redeploy', name))
        self.states[name]['deployment'] += '-new'


class GatesTests(unittest.TestCase):
    def setUp(self):
        self.gh = release.GitHub('test-token')
        self.run = {'id': 10, 'created_at': '2026-11-10', 'head_sha': COMMIT,
                    'event': 'push', 'head_branch': 'master', 'head_repository': {'full_name': release.REPO},
                    'status': 'completed', 'conclusion': 'success', 'run_attempt': 2}
        self.runs = [self.run]

        def get(path):
            if path == 'git/ref/heads/master':
                return {'object': {'sha': COMMIT}}
            return {'workflow_runs': self.runs}
        self.gh.get = get

    def test_records_exact_successful_run_attempts(self):
        self.assertEqual(self.gh.gates(COMMIT), {name: [10, 2] for name in release.REQUIRED})

    def test_stale_candidate_is_skipped(self):
        self.assertIsNone(self.gh.gates('f' * 40))

    def test_missing_pending_failed_and_untrusted_runs_block(self):
        variants = [{'status': 'in_progress'}, {'conclusion': 'failure'}, {'head_sha': 'f' * 40},
                    {'event': 'pull_request'}, {'head_branch': 'develop'},
                    {'head_repository': {'full_name': 'other/fork'}}]
        for changes in variants:
            with self.subTest(changes=changes):
                self.runs = [dict(self.run, **changes)]
                self.assertIsNone(self.gh.gates(COMMIT))
        self.runs = []
        self.assertIsNone(self.gh.gates(COMMIT))

    def test_newer_failed_run_cannot_be_hidden_by_old_success(self):
        self.runs.append(dict(self.run, id=11, conclusion='failure'))
        self.assertIsNone(self.gh.gates(COMMIT))

    def test_environment_requires_explicit_reviewers(self):
        for rules, expected in [([], False), ([{'type': 'wait_timer'}], False),
                                ([{'type': 'required_reviewers', 'reviewers': []}], False),
                                ([{'type': 'required_reviewers', 'reviewers': [{'id': 1}]}], True)]:
            self.gh.get = lambda _, rules=rules: {'protection_rules': rules}
            self.assertEqual(self.gh.approval_configured(), expected)

    def test_duplicate_requires_successful_deploy_not_dry_run_or_pr(self):
        for event, conclusion, expected in [('workflow_run', 'success', True),
                                            ('workflow_dispatch', 'success', True),
                                            ('pull_request', 'success', False),
                                            ('workflow_dispatch', 'skipped', False),
                                            ('workflow_run', 'failure', False)]:
            self.gh.get = lambda path: ({'jobs': [{'name': 'deploy', 'conclusion': conclusion}]}
                                       if '/jobs?' in path else
                                       {'workflow_runs': [{'id': 12, 'head_sha': COMMIT, 'event': event}]})
            self.assertEqual(self.gh.already_released(COMMIT), expected)

    def test_only_read_requests_are_retried(self):
        for payload, expected in [(None, 3), ({'query': 'query{service{name}}'}, 3),
                                  ({'query': 'mutation{updateDockerfile}'}, 1)]:
            with (patch.object(release.urllib.request, 'urlopen', side_effect=urllib.error.URLError('offline')) as fetch,
                  patch.object(release.time, 'sleep')):
                with self.assertRaises(release.ReleaseError):
                    release.request('https://example.com', payload=payload)
                self.assertEqual(fetch.call_count, expected)


class ImageAndSourceTests(unittest.TestCase):
    def registry(self, revision=COMMIT, platform='amd64', corrupt=False, indexed=False):
        config = json.dumps({'os': 'linux', 'architecture': platform,
                             'config': {'Labels': {'org.opencontainers.image.revision': revision}}}).encode()
        config_digest = 'sha256:' + release.sha(config)
        runtime = json.dumps({'config': {'digest': config_digest}}).encode()
        runtime_digest = 'sha256:' + release.sha(runtime)
        index = json.dumps({'manifests': [{'platform': {'os': 'linux', 'architecture': 'amd64'},
                                         'digest': runtime_digest}]}).encode()

        def fetch(url, *args, **kwargs):
            if '/token?' in url:
                return b'{"token":"registry-token"}', {}
            if '/blobs/' in url:
                return config + (b' ' if corrupt else b''), {}
            if url.endswith(runtime_digest):
                return runtime, {}
            return (index if indexed else runtime), {}
        return fetch, 'sha256:' + release.sha(index if indexed else runtime)

    def test_single_manifest_and_index_pin_content_digest(self):
        for indexed in (False, True):
            fetch, expected = self.registry(indexed=indexed)
            with patch.object(release, 'request', fetch):
                self.assertEqual(release.resolve_image('user-service', COMMIT, 'token'), expected)

    def test_image_wrong_revision_platform_or_tampering_fails(self):
        for changes in ({'revision': 'e' * 40}, {'platform': 'arm64'}, {'corrupt': True}):
            fetch, _ = self.registry(**changes)
            with patch.object(release, 'request', fetch), self.assertRaises(release.ReleaseError):
                release.resolve_image('user-service', COMMIT, 'token')

    def test_from_replacement_preserves_other_content(self):
        old = 'FROM ghcr.io/' + release.REPO + '/user-service:12381c9\nENV KEY=value\nCMD ["node","src/index.js"]\n'
        new = release.replace_base('user-service', old, release.image_ref('user-service', DIGEST))
        self.assertEqual(new.splitlines()[1:], old.splitlines()[1:])
        self.assertIn('@' + DIGEST, new)

    def test_ambiguous_or_other_repository_dockerfile_rejected(self):
        for text in ('FROM node:20\n', 'FROM\nnode:20\n',
                     'FROM ghcr.io/happepls/oral_app/user-service:old\nFROM node:20\n',
                     'FROM ghcr.io/happepls/oral_app/comms-service:old\n'):
            with self.subTest(text=text), self.assertRaises(release.ReleaseError):
                release.base_line('user-service', text)

    def test_node_probe_matches_python_hash_and_actual_health_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / 'src'
            (directory / 'nested').mkdir(parents=True)
            (directory / 'z.js').write_text('console.log(1);\n')
            (directory / 'nested/a.json').write_text('{"x":2}')
            (directory / 'ignore.txt').write_text('ignored')
            expected = release.source_hash(directory)
            zb = release.Zeabur('not-used')

            def gql(query, variables):
                script = variables['command'][-1]
                self.assertIn('process.env.PORT||3000', script)
                self.assertIn('"/api/health"', script)
                result = subprocess.run(['node', '-e', 'global.fetch=async()=>({status:200});' + script],
                                        cwd=tmp, capture_output=True, text=True, check=True)
                return {'executeCommand': {'exitCode': 0, 'output': result.stdout}}
            zb.gql = gql
            self.assertEqual(zb.probe('user-service')['source'], expected)
            (directory / 'z.js').write_text('changed')
            self.assertNotEqual(release.source_hash(directory), expected)

    def test_missing_source_directory_rejected(self):
        with self.assertRaises(release.ReleaseError):
            release.source_hash(Path('/does-not-exist-release-test'))


class RolloutTests(unittest.TestCase):
    def setUp(self):
        self.gh, self.zb = FakeGitHub(), FakeZeabur()
        self.report = {'status': 'started', 'services': {}}
        self.original = copy.deepcopy(self.zb.states)

    def apply(self, candidate=None, wait=release.wait_for):
        release.apply(self.gh, self.zb, candidate or plan(), self.report, lambda: None, wait=wait)

    def test_success_updates_all_five_preserves_configuration_and_records_evidence(self):
        self.apply()
        self.assertEqual(self.report['status'], 'verified')
        self.assertEqual(len(self.zb.writes), 10)
        for name in release.SERVICES:
            self.assertEqual(self.report['services'][name]['status'], 'verified')
            self.assertIn('ENV EXISTING=kept\n', self.zb.states[name]['dockerfile'])
        self.assertNotIn('EXISTING=kept', json.dumps(self.report))

    def test_idempotent_repeated_release_does_not_redeploy(self):
        self.apply()
        self.zb.writes.clear()
        self.apply()
        self.assertEqual(self.zb.writes, [])
        self.assertTrue(all(s['status'] == 'already_verified' for s in self.report['services'].values()))

    def test_no_approval_or_changed_gates_prevents_writes(self):
        self.gh.approved = False
        with self.assertRaises(release.ReleaseError):
            self.apply()
        self.gh.approved = True
        self.gh.gates = lambda _: None
        with self.assertRaises(release.ReleaseError):
            self.apply()
        self.assertEqual(self.zb.writes, [])

    def test_preflight_checks_all_services_before_first_mutation(self):
        self.zb.states['conversation-service']['status'] = 'CRASHED'
        with self.assertRaises(release.ReleaseError):
            self.apply()
        self.assertEqual(self.zb.writes, [])

    def test_failed_or_uncertain_update_restores_touched_services_in_reverse_order(self):
        names = list(release.SERVICES)
        self.zb.fail_update = names[1]
        with self.assertRaises(release.ReleaseError):
            self.apply()
        self.assertEqual(self.report['status'], 'failed')
        updates = [item[1] for item in self.zb.writes if item[0] == 'update']
        self.assertEqual(updates, [names[0], names[1], names[1], names[0]])
        for name in names:
            self.assertEqual(self.zb.states[name]['dockerfile'], self.original[name]['dockerfile'])

    def test_candidate_advances_mid_rollout_restores_previous_services(self):
        calls = []

        def gates(commit):
            calls.append(commit)
            return plan()['gates'] if len(calls) < 3 else None
        self.gh.gates = gates
        with self.assertRaises(release.ReleaseError):
            self.apply()
        first = next(iter(release.SERVICES))
        self.assertEqual(self.report['services'][first]['status'], 'rolled_back')

    def test_concurrent_configuration_drift_is_never_overwritten_by_rollback(self):
        def failing_wait(zb, name, *args):
            zb.states[name]['dockerfile'] = 'FROM operator/change:latest\n'
            raise release.ReleaseError('operator_changed_config')
        with self.assertRaises(release.ReleaseError):
            self.apply(wait=failing_wait)
        first = next(iter(release.SERVICES))
        self.assertEqual(self.report['services'][first]['status'], 'rollback_requires_operator')
        self.assertEqual(len(self.zb.writes), 2)

    def test_failed_deployment_or_wrong_source_or_changed_flag_cannot_pass(self):
        name = next(iter(release.SERVICES))
        self.zb.states[name]['deployment'] = 'new'
        for change in ('failed', 'source', 'flag'):
            with self.subTest(change=change):
                self.zb.states[name]['deployment_status'] = 'FAILED' if change == 'failed' else 'RUNNING'
                clock = iter([0, 1, 241])
                with self.assertRaises(release.ReleaseError):
                    release.wait_for(self.zb, name, self.zb.states[name]['dockerfile'], 'old',
                                     SOURCE if change == 'source' else OLD_SOURCE,
                                     'true' if change == 'flag' else 'unset',
                                     sleep=lambda _: None, clock=lambda: next(clock))

    def test_incomplete_or_tampered_plan_is_rejected_without_writes(self):
        for change in ('ready', 'repository', 'images', 'sources', 'gates'):
            candidate = plan()
            candidate[change] = False if change == 'ready' else {} if change in ('images', 'sources', 'gates') else 'fork/repo'
            with self.subTest(change=change), self.assertRaises(release.ReleaseError):
                self.apply(candidate)
        self.assertEqual(self.zb.writes, [])


if __name__ == '__main__':
    unittest.main()
