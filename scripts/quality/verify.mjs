import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const artifacts = path.join(root, 'quality/artifacts/latest');
const python = process.env.QUALITY_PYTHON || (fs.existsSync(path.join(root, '.venv/bin/python')) ? path.join(root, '.venv/bin/python') : 'python3');
fs.mkdirSync(artifacts, { recursive: true });
const findings = [];
const CLOSED_AUDIT_STATUSES = new Set(['fixed', 'verified-existing', 'not-reproducible']);

function run(ruleId, domain, command, args, options = {}) {
  const env = { ...process.env };
  if (options.ci === false) delete env.CI;
  else env.CI = 'true';
  const result = spawnSync(command, args, { cwd: options.cwd || root, encoding: 'utf8', env });
  fs.writeFileSync(path.join(artifacts, `${ruleId}.log`), `${result.stdout || ''}${result.stderr || ''}`);
  if (result.status !== 0) findings.push({ rule_id: ruleId, domain, severity: options.severity || 'critical', hard_blocker: options.hardBlocker || 'test_failure', target: options.target || command, expected: 'Command exits successfully', actual: `Exited with ${result.status}`, evidence: [`quality/artifacts/latest/${ruleId}.log`], confidence: 1, suggested_files: options.files || [], auto_fix_allowed: options.autoFix ?? true });
}

if (process.env.QUALITY_INCLUDE_UI === '1') {
  run('QA-UI-RUN', 'frontend', 'npm', ['run', 'test:e2e'], { cwd: path.join(root, 'client'), ci: false, files: ['client/e2e/', 'client/src/'] });
  run('QA-UI-REPORT', 'frontend', 'npm', ['run', 'verify:ui:report'], { severity: 'major', files: ['scripts/quality/playwright-findings.mjs', 'client/e2e/'] });
}

const audit = fs.readFileSync(path.join(root, 'docs/ui-audit-report.md'), 'utf8');
const ids = [...audit.matchAll(/^\|\s*([A-Z]+-\d+)\s*\|/gm)].map((match) => match[1]);
const declared = Number(audit.match(/\*\*合计\*\*\s*\|\s*\*\*(\d+)项/)?.[1]);
if (declared !== ids.length) findings.push({ rule_id: 'QA-AUDIT-COUNT', domain: 'frontend', severity: 'major', target: 'docs/ui-audit-report.md', expected: `Declared count ${declared} matches unique issue rows`, actual: `Found ${ids.length} issue rows`, evidence: ['docs/ui-audit-report.md'], confidence: 1, suggested_files: ['docs/ui-audit-report.md', 'quality/audit-status.json'], auto_fix_allowed: false });
const auditStatus = JSON.parse(fs.readFileSync(path.join(root, 'quality/audit-status.json'), 'utf8'));
for (const line of audit.split(/\r?\n/)) {
  const match = line.match(/^\|\s*([A-Z]+-\d+)\s*\|\s*(.*?)\s*\|/);
  if (!match || CLOSED_AUDIT_STATUSES.has(auditStatus.items[match[1]]?.status)) continue;
  findings.push({
    rule_id: match[1],
    domain: 'frontend',
    severity: 'minor',
    target: 'UI audit closure tracker',
    expected: 'Rule is closed as fixed, verified-existing, or not-reproducible with evidence',
    actual: match[2].replaceAll('**', '').trim(),
    evidence: ['quality/artifacts/latest/ui-audit-tracker.md'],
    confidence: 1,
    suggested_files: ['client/src/'],
    auto_fix_allowed: false,
  });
}

run('QA-CONTRACT', 'backend', 'node', ['--test', 'quality/tests/contracts.test.mjs'], { files: ['contracts/'] });
run('QA-SECRET-STAGED', 'integration', 'gitleaks', ['git', '--staged', '--verbose', '--config', '.gitleaks.toml'], { autoFix: false, files: ['.gitleaks.toml'] });
const trackedSensitiveFiles = ['.security-keys.json'].filter((file) => {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', file], { cwd: root, stdio: 'ignore' });
  return result.status === 0;
});
if (trackedSensitiveFiles.length) findings.push({
  rule_id: 'QA-SECRET-TRACKED',
  domain: 'integration',
  severity: 'critical',
  hard_blocker: 'secret_leakage',
  target: trackedSensitiveFiles.join(', '),
  expected: 'Generated runtime credentials are ignored and never tracked by Git',
  actual: 'A generated credential file remains tracked in the repository and its exposed values require rotation',
  evidence: ['.gitleaks.toml', '.gitignore'],
  confidence: 1,
  suggested_files: ['.gitignore', '.security-keys.json'],
  auto_fix_allowed: false,
});
run('QA-ROOT-LINT', 'integration', 'npm', ['run', 'lint'], { severity: 'major', files: ['eslint.config.mjs', 'services/', 'scripts/quality/'] });
run('QA-DEVELOPER-API', 'backend', 'npm', ['test'], { cwd: path.join(root, 'services/developer-api-service'), files: ['services/developer-api-service/'] });
run('QA-USER-SERVICE', 'backend', 'npm', ['test', '--', '--runInBand'], { cwd: path.join(root, 'services/user-service'), files: ['services/user-service/'] });
run('QA-MEDIA-SERVICE', 'backend', 'npm', ['test', '--', '--runInBand'], { cwd: path.join(root, 'services/media-processing-service'), files: ['services/media-processing-service/'] });
run('QA-HISTORY-AUTH', 'backend', 'npm', ['test'], { cwd: path.join(root, 'services/history-analytics-service'), files: ['services/history-analytics-service/'] });
run('QA-CONVERSATION-AUTH', 'backend', 'npm', ['test'], { cwd: path.join(root, 'services/conversation-service'), files: ['services/conversation-service/'] });
run('QA-REALTIME', 'backend', 'npm', ['test'], { cwd: path.join(root, 'services/comms-service'), files: ['services/comms-service/'] });
run('QA-WORKFLOW', 'backend', python, ['-m', 'pytest', 'tests'], { cwd: path.join(root, 'services/workflow-service'), files: ['services/workflow-service/'] });
run('QA-AI-OMNI', 'backend', python, ['-m', 'pytest', 'tests'], { cwd: path.join(root, 'services/ai-omni-service'), files: ['services/ai-omni-service/'] });
run('QA-SCENARIO-MOCK', 'integration', python, ['test_scenario_batch_and_daily_qa.py', '--scenario', 'all', '--mock'], { files: ['test_scenario_batch_and_daily_qa.py', 'services/ai-omni-service/', 'services/workflow-service/'] });
run('QA-SCORE', 'integration', 'node', ['--test', 'quality/tests/scoring.test.mjs'], { files: ['scripts/quality/'] });
run('QA-AUDIT-TRACKER', 'frontend', 'node', ['scripts/quality/audit-tracker.mjs'], { severity: 'major', hardBlocker: undefined, files: ['quality/audit-status.json'] });
run('QA-CLIENT-LINT', 'frontend', 'npm', ['run', 'lint'], { cwd: path.join(root, 'client'), severity: 'major', files: ['client/src/'] });
run('QA-CLIENT-TEST', 'frontend', 'npm', ['test', '--', '--watchAll=false', '--runInBand'], { cwd: path.join(root, 'client'), files: ['client/src/'] });
run('QA-CLIENT-BUILD', 'frontend', 'npm', ['run', 'build'], { cwd: path.join(root, 'client'), ci: false, files: ['client/src/'] });
if (process.env.QUALITY_INCLUDE_UI === '1') {
  const uiFindingsPath = path.join(artifacts, 'ui-findings.json');
  if (fs.existsSync(uiFindingsPath)) findings.push(...JSON.parse(fs.readFileSync(uiFindingsPath, 'utf8')));
  else findings.push({ rule_id: 'QA-UI-EVIDENCE', domain: 'frontend', severity: 'major', target: uiFindingsPath, expected: 'The unified verifier generated a current Playwright findings file', actual: 'Playwright report conversion did not produce ui-findings.json', evidence: [], confidence: 1, suggested_files: ['client/e2e/', 'client/src/'], auto_fix_allowed: false });
}
fs.writeFileSync(path.join(artifacts, 'findings.json'), `${JSON.stringify(findings, null, 2)}\n`);
const scorer = spawnSync('node', ['scripts/quality/score.mjs'], { cwd: root, stdio: 'inherit' });
process.exitCode = scorer.status ?? 4;
