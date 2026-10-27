import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { determineScope, scopeForPaths } from '../../scripts/ci/pr-scope.mjs';

test('backend and documentation PRs skip only the unrelated auxiliary suites', () => {
  for (const path of ['services/ai-omni-service/app/main.py', 'services/user-service/src/app.js', 'docs/ai-sdlc.md']) {
    assert.deepEqual(scopeForPaths([path]), { seo: false, integration: false });
  }
});

test('frontend, dependency, gateway and routing changes retain production SEO checks', () => {
  for (const path of ['client/src/App.js', 'client/package-lock.json', 'client/public/index.html', 'client/nginx.prod.conf', 'api-gateway/nginx.conf', 'docker-compose.override.yml', 'package-lock.json', 'scripts/verify-geo-build.mjs']) {
    assert.equal(scopeForPaths([path]).seo, true, path);
  }
});

test('integration harness changes retain its executable validation', () => {
  for (const path of ['integration_tests/test_runner.py', 'integration_tests/requirements.txt', 'scripts/run-integration-tests.sh', 'scripts/ci-test-suite.sh']) {
    assert.equal(scopeForPaths([path]).integration, true, path);
  }
});

test('CI policy changes, pushes and manual runs exercise all auxiliary suites', () => {
  for (const path of ['.github/workflows/ci.yml', '.github/actions/setup-verification/action.yml', 'scripts/ci/pr-scope.mjs', 'quality/tests/ci-scope.test.mjs']) {
    assert.deepEqual(scopeForPaths([path]), { seo: true, integration: true });
  }
  for (const event of ['push', 'workflow_dispatch', 'schedule']) {
    assert.deepEqual(determineScope({ GITHUB_EVENT_NAME: event }), { seo: true, integration: true });
  }
});

test('incomplete PR metadata fails closed', () => {
  assert.throws(() => determineScope({ GITHUB_EVENT_NAME: 'pull_request' }), /refusing to skip/);
});

test('real git diff retains deleted frontend paths and rejects unavailable commits', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'oral-ci-scope-'));
  const script = fileURLToPath(new URL('../../scripts/ci/pr-scope.mjs', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init');
    git('config', 'user.email', 'ci-test@example.invalid');
    git('config', 'user.name', 'CI scope test');
    mkdirSync(join(cwd, 'client'));
    writeFileSync(join(cwd, 'client/page.html'), '<main>fixture</main>');
    git('add', '.');
    git('commit', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    mkdirSync(join(cwd, 'docs'));
    renameSync(join(cwd, 'client/page.html'), join(cwd, 'docs/page.html'));
    git('add', '-A');
    git('commit', '-m', 'move page out of frontend');
    const env = { ...process.env, GITHUB_EVENT_NAME: 'pull_request', BASE_SHA: base, HEAD_SHA: 'HEAD', GITHUB_OUTPUT: '' };
    assert.match(execFileSync(process.execPath, [script], { cwd, env, encoding: 'utf8' }), /seo=true/);
    const failed = spawnSync(process.execPath, [script], { cwd, env: { ...env, BASE_SHA: 'missing-commit' }, encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    assert.doesNotMatch(failed.stdout, /seo=false/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('required job names and unconditional core coverage remain intact', () => {
  const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  assert.ok(workflow.jobs.test);
  assert.ok(workflow.jobs['ui-audit']);
  const steps = workflow.jobs.test.steps;
  for (const name of ['Run linting', 'Run unit tests', 'Build client', 'Run Python service tests']) {
    const step = steps.find(step => step.name === name);
    assert.ok(step, name);
    assert.equal(step.if, undefined, name);
    assert.equal(step['continue-on-error'], undefined, name);
  }
  const ui = workflow.jobs['ui-audit'].steps.find(step => step.name?.startsWith('Run deterministic'));
  assert.match(ui.run, /--project=chromium-desktop --project=webkit-mobile/);
  assert.match(ui.run, /FULL_UI_MATRIX/);
});

test('preinstalled UI browser image matches the locked Playwright version', () => {
  const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  const lock = JSON.parse(readFileSync('client/package-lock.json', 'utf8'));
  const version = lock.packages['node_modules/@playwright/test'].version;
  assert.equal(workflow.jobs['ui-audit'].container.image, `mcr.microsoft.com/playwright:v${version}-noble`);
  const readProjects = env => JSON.parse(execFileSync(process.execPath, ['-e',
    "console.log(JSON.stringify(require('./client/playwright.config').projects))"], { env, encoding: 'utf8' }));
  const regular = readProjects({ ...process.env, PLAYWRIGHT_BUNDLED_BROWSERS: '' });
  const bundled = readProjects({ ...process.env, PLAYWRIGHT_BUNDLED_BROWSERS: 'true' });
  assert.deepEqual(bundled.map(p => p.name), regular.map(p => p.name));
  assert.ok(regular.filter(p => p.use.browserName === 'chromium').every(p => p.use.channel === 'chrome'));
  assert.ok(bundled.filter(p => p.use.browserName === 'chromium').every(p => p.use.channel === 'chromium'));
  assert.deepEqual(bundled.find(p => p.name === 'webkit-mobile'), regular.find(p => p.name === 'webkit-mobile'));
});
