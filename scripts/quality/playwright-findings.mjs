import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const input = process.argv[2] || path.join(root, 'quality/artifacts/playwright-results.json');
const output = process.argv[3] || path.join(root, 'quality/artifacts/latest/ui-findings.json');

function relativeEvidence(value) {
  if (!value) return null;
  return path.relative(root, value).replaceAll(path.sep, '/');
}

function collectSuites(suites, findings) {
  for (const suite of suites || []) {
    collectSuites(suite.suites, findings);
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const failed = (test.results || []).find((result) => result.status === 'failed' || result.status === 'timedOut');
        if (!failed) continue;
        const message = failed.error?.message || 'Playwright test failed';
        const axeRule = message.match(/"id":\s*"([^"]+)"/)?.[1];
        const overflow = /horizontal overflow|clipped controls/i.test(message);
        const missingBrowser = /Executable doesn't exist|playwright install/i.test(message);
        const evidence = (failed.attachments || []).map((item) => relativeEvidence(item.path)).filter(Boolean);
        const targetSlug = spec.title.split(' has no ')[0].replaceAll(/[^A-Za-z0-9_-]/g, '-');
        const escapePrefix = String.fromCharCode(27);
        findings.push({
          rule_id: `UI-${test.projectName || 'unknown'}-${targetSlug}-${axeRule || (overflow ? 'layout' : 'interaction')}`.replaceAll(/[^A-Za-z0-9_-]/g, '-'),
          domain: 'frontend',
          severity: axeRule === 'color-contrast' || missingBrowser ? 'major' : 'critical',
          ...(overflow ? { hard_blocker: 'critical_control_or_overflow' } : {}),
          target: spec.title,
          expected: 'No horizontal overflow, clipped controls, serious accessibility violations, console errors, or failed critical interactions',
          actual: missingBrowser ? `${test.projectName || 'Browser'} runtime is not installed in this environment` : axeRule ? `axe violation: ${axeRule}` : message.replaceAll(new RegExp(`${escapePrefix}\\[[0-9;]*m`, 'g'), '').split('\n').slice(0, 4).join(' '),
          evidence,
          confidence: 1,
          suggested_files: ['client/src/'],
          auto_fix_allowed: !overflow && !missingBrowser,
        });
      }
    }
  }
}

if (!fs.existsSync(input)) {
  console.error(`Playwright JSON not found: ${input}`);
  process.exit(3);
}

const report = JSON.parse(fs.readFileSync(input, 'utf8'));
const findings = [];
collectSuites(report.suites, findings);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(findings, null, 2)}\n`);
console.log(JSON.stringify({ input: path.relative(root, input), findings: findings.length, output: path.relative(root, output) }));
process.exitCode = findings.length ? 2 : 0;
