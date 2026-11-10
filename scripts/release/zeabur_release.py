"""Approved, digest-pinned rollout of the five existing production backends.

No database, environment-variable, service-creation or secret-management API is
used. Reports contain image references and hashes, never Dockerfile contents.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

REPO = 'happepls/oral_app'
PROJECT = '6a0d7fd433d1a635fa37f18b'
ENVIRONMENT = '6a0d7fd4f3b70f2a79fbd8fd'
SERVICES = {
    'user-service': ('6a361c21b2350c13adc3f31e', 3000, '/api/health'),
    'developer-api-service': ('6a744b0c472e2c91a9e72838', 3010, '/health'),
    'comms-service': ('6a361c5d558aac447d435ddc', 3003, '/health'),
    'history-analytics-service': ('6a361c44b2350c13adc3f323', 3004, '/health'),
    'conversation-service': ('6a361c4c558aac447d435dd8', 8083, '/health'),
}
REQUIRED = ('ci.yml', 'docker.yml', 'security.yml', 'sdlc-checks.yml')
SHA = re.compile(r'^[0-9a-f]{40}$')
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')


class ReleaseError(RuntimeError):
    pass


def require(condition, reason):
    if not condition:
        raise ReleaseError(reason)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def request(url, token=None, payload=None, headers=None):
    values = {'Accept': 'application/json', 'User-Agent': 'oral-app-release'}
    if token:
        values['Authorization'] = 'Bearer ' + token
    values.update(headers or {})
    if payload is not None:
        values['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=None if payload is None else json.dumps(payload).encode(), headers=values)
    # Retry reads only. A timed-out mutation may already have succeeded.
    read_only = payload is None or payload.get('query', '').lstrip().startswith('query')
    for attempt in range(3 if read_only else 1):
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                return response.read(), dict(response.headers)
        except (urllib.error.URLError, TimeoutError) as error:
            if not read_only or attempt == 2:
                raise ReleaseError('remote_request_failed') from error
            time.sleep(attempt + 1)


class GitHub:
    def __init__(self, token):
        self.token = token

    def get(self, path):
        body, _ = request('https://api.github.com/repos/' + REPO + '/' + path, self.token)
        return json.loads(body)

    def gates(self, commit):
        require(SHA.fullmatch(commit), 'invalid_commit')
        if self.get('git/ref/heads/master')['object']['sha'] != commit:
            return None
        runs = {}
        for workflow in REQUIRED:
            query = urllib.parse.urlencode({'branch': 'master', 'event': 'push', 'head_sha': commit, 'per_page': 100})
            candidates = self.get('actions/workflows/' + workflow + '/runs?' + query)['workflow_runs']
            candidates = [r for r in candidates if r['head_sha'] == commit and r['event'] == 'push'
                          and r['head_branch'] == 'master' and r['head_repository']['full_name'] == REPO]
            if not candidates:
                return None
            latest = max(candidates, key=lambda r: (r['created_at'], r['id']))
            if latest['status'] != 'completed' or latest['conclusion'] != 'success':
                return None
            runs[workflow] = [latest['id'], latest.get('run_attempt', 1)]
        return runs

    def approval_configured(self):
        rules = self.get('environments/production')['protection_rules']
        return any(r['type'] == 'required_reviewers' and r.get('reviewers') for r in rules)

    def already_released(self, commit):
        query = urllib.parse.urlencode({'branch': 'master', 'head_sha': commit,
                                        'status': 'success', 'per_page': 100})
        runs = self.get('actions/workflows/zeabur-production-release.yml/runs?' + query)['workflow_runs']
        for run in runs:
            if run['head_sha'] != commit or run['event'] not in ('workflow_run', 'workflow_dispatch'):
                continue
            jobs = self.get('actions/runs/' + str(run['id']) + '/jobs?per_page=100')['jobs']
            if any(job['name'] == 'deploy' and job['conclusion'] == 'success' for job in jobs):
                return True
        return False


def image_ref(name, digest):
    require(name in SERVICES and DIGEST.fullmatch(digest), 'invalid_image')
    return 'ghcr.io/' + REPO + '/' + name + '@' + digest


def resolve_image(name, commit, github_token):
    repository = REPO + '/' + name
    credentials = base64.b64encode((os.environ.get('GITHUB_ACTOR', 'release') + ':' + github_token).encode()).decode()
    query = urllib.parse.urlencode({'service': 'ghcr.io', 'scope': 'repository:' + repository + ':pull'})
    body, _ = request('https://ghcr.io/token?' + query, headers={'Authorization': 'Basic ' + credentials})
    token = json.loads(body)['token']

    def manifest(reference):
        body, _ = request('https://ghcr.io/v2/' + repository + '/manifests/' + reference, token,
                          headers={'Accept': 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'})
        return json.loads(body), 'sha256:' + sha(body)

    index, digest = manifest(commit[:7])
    runtime = index
    if 'manifests' in index:
        linux = [m for m in index['manifests'] if m.get('platform', {}).get('os') == 'linux'
                 and m['platform'].get('architecture') == 'amd64']
        require(len(linux) == 1, 'missing_unique_linux_amd64_image')
        runtime, actual = manifest(linux[0]['digest'])
        require(actual == linux[0]['digest'], 'manifest_digest_mismatch')
    config_digest = runtime['config']['digest']
    body, _ = request('https://ghcr.io/v2/' + repository + '/blobs/' + config_digest, token)
    require('sha256:' + sha(body) == config_digest, 'config_digest_mismatch')
    config = json.loads(body)
    require(config.get('os') == 'linux' and config.get('architecture') == 'amd64', 'unexpected_image_platform')
    require(config['config'].get('Labels', {}).get('org.opencontainers.image.revision') == commit,
            'image_revision_mismatch')
    return digest


def source_hash(directory):
    require(directory.is_dir(), 'source_directory_missing')
    digest = hashlib.sha256()
    for path in sorted(p for p in directory.rglob('*') if p.is_file() and p.suffix in ('.js', '.json')):
        digest.update(path.relative_to(directory).as_posix().encode() + b'\0')
        digest.update(path.read_bytes() + b'\0')
    return digest.hexdigest()


def base_line(name, dockerfile):
    matches = list(re.finditer(r'(?m)^FROM[ \t]+(\S+)[ \t]*\r?$', dockerfile))
    require(len(matches) == 1, 'unsupported_dockerfile')
    match = matches[0]
    old = match[1]
    prefix = 'ghcr.io/' + REPO + '/' + name
    require(re.fullmatch(re.escape(prefix) + r'(?::[A-Za-z0-9_.-]+|@sha256:[0-9a-f]{64})', old),
            'unexpected_base_image')
    return match, old


def replace_base(name, dockerfile, replacement):
    match, _ = base_line(name, dockerfile)
    return dockerfile[:match.start(1)] + replacement + dockerfile[match.end(1):]


class Zeabur:
    def __init__(self, token):
        self.token = token

    def gql(self, query, variables):
        body, _ = request('https://api.zeabur.com/graphql', self.token,
                          {'query': query, 'variables': variables})
        data = json.loads(body)
        require(not data.get('errors'), 'zeabur_api_rejected_request')
        return data['data']

    def state(self, name):
        data = self.gql('query($id:ObjectID!,$env:ObjectID!){service(_id:$id){name project{_id} status(environmentID:$env) spec{source{dockerfile}} deployments(environmentID:$env){_id status}}}',
                        {'id': SERVICES[name][0], 'env': ENVIRONMENT})['service']
        require(data['name'] == name and data['project']['_id'] == PROJECT, 'target_identity_mismatch')
        require(data['deployments'], 'deployment_identity_missing')
        return {'dockerfile': data['spec']['source']['dockerfile'], 'status': data['status'],
                'deployment': data['deployments'][0]['_id'], 'deployment_status': data['deployments'][0]['status']}

    def update(self, name, dockerfile):
        data = self.gql('mutation($id:ObjectID!,$dockerfile:String!){updateDockerfile(serviceID:$id,dockerfile:$dockerfile)}',
                        {'id': SERVICES[name][0], 'dockerfile': dockerfile})
        require(data.get('updateDockerfile') is True, 'dockerfile_update_failed')

    def redeploy(self, name):
        data = self.gql('mutation($id:ObjectID!,$env:ObjectID!){redeployService(serviceID:$id,environmentID:$env)}',
                        {'id': SERVICES[name][0], 'env': ENVIRONMENT})
        require(data.get('redeployService') is True, 'redeploy_rejected')

    def probe(self, name):
        _, port, path = SERVICES[name]
        # Only read source files, the existing flag and the private health URL.
        script = """const fs=require('fs'),path=require('path'),c=require('crypto');
const h=c.createHash('sha256');function walk(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);}
for(const p of walk('src').filter(p=>/\\.(js|json)$/.test(p)).sort()){h.update(p.slice(4));h.update(Buffer.from([0]));h.update(fs.readFileSync(p));h.update(Buffer.from([0]));}
fetch('http://127.0.0.1:'+ (process.env.PORT||__PORT__) + __HEALTH__,{signal:AbortSignal.timeout(5000)}).then(r=>console.log(JSON.stringify({release_probe:true,health:r.status,source:h.digest('hex'),flag:process.env.DEVICE_SESSION_LIMIT_ENABLED||'unset'}))).catch(()=>process.exitCode=1);""".replace('__PORT__', str(port)).replace('__HEALTH__', json.dumps(path))
        data = self.gql('mutation($id:ObjectID!,$env:ObjectID!,$command:[String!]!){executeCommand(serviceID:$id,environmentID:$env,command:$command){exitCode output}}',
                        {'id': SERVICES[name][0], 'env': ENVIRONMENT, 'command': ['node', '-e', script]})['executeCommand']
        require(data['exitCode'] == 0, 'runtime_probe_failed')
        for line in data['output'].splitlines():
            try:
                result = json.loads(line)
                if result.get('release_probe'):
                    require(result['flag'] in ('true', 'false', 'unset'), 'unexpected_device_flag')
                    return result
            except ValueError:
                continue
        raise ReleaseError('runtime_probe_missing')


def validate_plan(plan):
    require(plan.get('ready') is True, 'plan_not_ready')
    require(plan.get('repository') == REPO and SHA.fullmatch(plan.get('commit', '')), 'invalid_plan_identity')
    require(set(plan.get('images', {})) == set(SERVICES) == set(plan.get('sources', {})), 'invalid_service_set')
    require(set(plan.get('gates', {})) == set(REQUIRED), 'invalid_gate_set')
    for name in SERVICES:
        image_ref(name, plan['images'][name])
        require(re.fullmatch('[0-9a-f]{64}', plan['sources'][name]), 'invalid_source_hash')


def ready(gh, plan):
    require(gh.gates(plan['commit']) == plan['gates'], 'candidate_or_checks_changed')
    require(gh.approval_configured(), 'production_required_reviewers_not_configured')


def wait_for(zb, name, dockerfile, old_deployment, expected, flag, sleep=time.sleep, clock=time.monotonic):
    deadline = clock() + 240
    while clock() < deadline:
        state = zb.state(name)
        require(state['dockerfile'] == dockerfile, 'configuration_changed_during_rollout')
        if state['deployment'] != old_deployment:
            require(state['deployment_status'] not in ('FAILED', 'CRASHED', 'CANCELED'), 'deployment_failed')
            if state['status'] == 'RUNNING' and state['deployment_status'] == 'RUNNING':
                probe = zb.probe(name)
                if probe['health'] == 200 and probe['source'] == expected and probe['flag'] == flag:
                    return
        sleep(5)
    raise ReleaseError('deployment_verification_timed_out')


def apply(gh, zb, plan, report, save, wait=wait_for):
    validate_plan(plan)
    ready(gh, plan)
    originals = {}
    # Complete all target/snapshot/health checks before the first write.
    for name in SERVICES:
        state, probe = zb.state(name), zb.probe(name)
        require(state['status'] == 'RUNNING' and probe['health'] == 200, 'preflight_unhealthy')
        _, old = base_line(name, state['dockerfile'])
        originals[name] = (state, probe)
        report['services'][name] = {'old_image': old, 'new_image': image_ref(name, plan['images'][name]),
                                    'old_dockerfile_hash': sha(state['dockerfile'].encode()), 'status': 'planned'}
    save()
    touched = []
    try:
        for name in SERVICES:
            ready(gh, plan)
            old, probe = originals[name]
            require(zb.state(name)['dockerfile'] == old['dockerfile'], 'preflight_configuration_drift')
            new = replace_base(name, old['dockerfile'], image_ref(name, plan['images'][name]))
            if new == old['dockerfile']:
                require(probe['source'] == plan['sources'][name], 'already_pinned_source_mismatch')
                report['services'][name]['status'] = 'already_verified'
                save()
                continue
            # Journal intent first, including mutations with uncertain responses.
            touched.append((name, new))
            report['services'][name]['status'] = 'update_intended'
            save()
            zb.update(name, new)
            zb.redeploy(name)
            wait(zb, name, new, old['deployment'], plan['sources'][name], probe['flag'])
            report['services'][name]['status'] = 'verified'
            save()
        ready(gh, plan)
        report['status'] = 'verified'
        save()
    except BaseException as error:
        report['status'] = 'failed'
        report['failure_code'] = str(error) if isinstance(error, ReleaseError) else 'unexpected_failure'
        for name, new in reversed(touched):
            old, probe = originals[name]
            try:
                current = zb.state(name)
                require(current['dockerfile'] in (new, old['dockerfile']), 'rollback_configuration_drift')
                zb.update(name, old['dockerfile'])
                zb.redeploy(name)
                wait(zb, name, old['dockerfile'], current['deployment'], probe['source'], probe['flag'])
                report['services'][name]['status'] = 'rolled_back'
            except Exception as rollback_error:
                report['services'][name]['status'] = 'rollback_requires_operator'
                report['services'][name]['failure_code'] = str(rollback_error) if isinstance(rollback_error, ReleaseError) else 'unexpected_failure'
            save()
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=('plan', 'apply'))
    parser.add_argument('--commit', default='')
    parser.add_argument('--plan', default='release-plan.json')
    parser.add_argument('--report', default='release-report.json')
    args = parser.parse_args()
    require(os.environ.get('GITHUB_REPOSITORY', REPO) == REPO, 'unexpected_repository')
    gh = GitHub(os.environ['GH_TOKEN'])
    if args.mode == 'plan':
        require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == args.commit,
                'checkout_does_not_match_candidate')
        gates = gh.gates(args.commit)
        # Four upstream completions may queue the same candidate. Once a
        # protected deploy succeeded, avoid another approval for that commit.
        # Manual dispatch intentionally allows re-verification/repair.
        duplicate = (bool(gates) and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_run'
                     and gh.already_released(args.commit))
        if duplicate:
            gates = None
        plan = {'ready': bool(gates), 'repository': REPO, 'commit': args.commit}
        if duplicate:
            plan['skip_reason'] = 'already_released'
        if gates:
            plan.update({'gates': gates, 'images': {}, 'sources': {}})
            for name in SERVICES:
                plan['images'][name] = resolve_image(name, args.commit, os.environ['GH_TOKEN'])
                plan['sources'][name] = source_hash(Path('services') / name / 'src')
            validate_plan(plan)
        Path(args.plan).write_text(json.dumps(plan, indent=2) + '\n')
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
                output.write('ready=' + str(plan['ready']).lower() + '\n')
        print('Release plan ready.' if gates else 'Skipped: candidate is stale, unchecked or already released.')
        return
    report = {'status': 'started', 'services': {}, 'migrations_or_flags_modified': False}
    def save():
        Path(args.report).write_text(json.dumps(report, indent=2) + '\n')
    save()
    def interrupted(_signum, _frame):
        raise ReleaseError('release_interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    try:
        plan = json.loads(Path(args.plan).read_text())
        report['commit'] = plan['commit']
        apply(gh, Zeabur(os.environ['ZEABUR_DEPLOY_TOKEN']), plan, report, save)
    except BaseException as error:
        report['status'] = 'failed'
        report['failure_code'] = str(error) if isinstance(error, ReleaseError) else 'unexpected_failure'
        raise
    finally:
        save()


if __name__ == '__main__':
    try:
        main()
    except (ReleaseError, KeyError, ValueError):
        # Never echo API bodies, credentials, Dockerfile contents or command output.
        print('Release stopped. Review the sanitized report and deployment gates.')
        raise SystemExit(1)
