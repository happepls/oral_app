import fs from 'node:fs';
import path from 'node:path';

export const SEVERITY_DEDUCTION = { info: 0, minor: 2, major: 6, critical: 15 };
export const DOMAIN_WEIGHTS = {
  frontend: { functional: 30, responsive: 25, visual: 15, accessibility: 15, build_test: 10, console_performance: 5 },
  backend: { contract: 30, functional_integration: 25, auth_security: 20, reliability: 15, test_static: 10 },
  integration: { client_contract: 40, e2e: 40, failure_compatibility: 20 },
};

function inferredCategory(finding) {
  if (finding.category) return finding.category;
  const id = finding.rule_id || '';
  if (finding.domain === 'frontend') {
    if (/CLIENT-(LINT|TEST|BUILD)/.test(id)) return 'build_test';
    if (/UI|OVERFLOW|RESPONSIVE/.test(id)) return 'responsive';
    if (/AXE|ACCESS/.test(id)) return 'accessibility';
    if (/AUDIT|^[A-Z]+-\d+/.test(id)) return 'visual';
    return 'functional';
  }
  if (finding.domain === 'backend') {
    if (/CONTRACT/.test(id)) return 'contract';
    if (/AUTH|HISTORY|CONVERSATION|REALTIME/.test(id)) return 'auth_security';
    if (/TIMEOUT|RELIABILITY/.test(id)) return 'reliability';
    if (/LINT|STATIC/.test(id)) return 'test_static';
    return 'functional_integration';
  }
  if (/SCORE|FAILURE|COMPAT/.test(id)) return 'failure_compatibility';
  if (/E2E|UI/.test(id)) return 'e2e';
  return 'client_contract';
}

export function scoreCategories(findings) {
  const categoryScores = Object.fromEntries(Object.entries(DOMAIN_WEIGHTS).map(([domain, weights]) => [domain, { ...weights }]));
  for (const finding of findings) {
    const categories = categoryScores[finding.domain];
    if (!categories) continue;
    const category = inferredCategory(finding);
    if (!(category in categories)) continue;
    categories[category] = Math.max(0, categories[category] - (SEVERITY_DEDUCTION[finding.severity] ?? 6));
  }
  return categoryScores;
}

export function scoreFindings(findings, domains = ['frontend', 'backend', 'integration']) {
  const categoryScores = scoreCategories(findings);
  const scores = Object.fromEntries(domains.map((domain) => [domain, Object.values(categoryScores[domain] || {}).reduce((sum, value) => sum + value, 0)]));
  const hasHardFailure = findings.some((finding) => finding.hard_blocker);
  if (hasHardFailure) {
    for (const domain of Object.keys(scores)) scores[domain] = Math.min(scores[domain], 69);
  }
  return scores;
}

export function decide(scores, findings) {
  if (findings.some((finding) => finding.hard_blocker)) return 'hard_failure';
  if (findings.some((finding) => finding.confidence < 0.8 || finding.auto_fix_allowed === false)) return 'manual';
  return Math.min(...Object.values(scores)) >= 90 ? 'pass' : 'auto_fix';
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function renderMarkdown(report) {
  const clean = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const categoryRows = Object.entries(report.category_scores).flatMap(([domain, categories]) => Object.entries(categories).map(([category, score]) => `| ${domain} | ${category} | ${score} |`)).join('\n');
  const rows = report.findings.map((f) => `| ${clean(f.rule_id)} | ${clean(f.domain)} | ${clean(inferredCategory(f))} | ${clean(f.severity)} | ${clean(f.target)} | ${clean(f.expected)} | ${clean(f.actual)} | ${clean((f.evidence || []).join(', '))} | ${f.confidence} | ${clean((f.suggested_files || []).join(', '))} | ${f.auto_fix_allowed ? 'yes' : 'no'} |`).join('\n');
  return `# Guaji quality report\n\n- Run: \`${report.run_id}\`\n- Decision: **${report.decision}**\n- Final score: **${report.final_score}**\n- Scores: ${Object.entries(report.scores).map(([k, v]) => `${k}=${v}`).join(', ')}\n\n## Category scores\n\n| Domain | Category | Score |\n|---|---|---:|\n${categoryRows}\n\n## Findings\n\n| Rule | Domain | Category | Severity | Target | Expected | Actual | Evidence | Confidence | Suggested files | Auto-fix |\n|---|---|---|---|---|---|---|---|---:|---|---|\n${rows || '| — | — | — | — | — | — | No findings | — | — | — | — |'}\n`;
}

export function renderHtml(report) {
  const categoryRows = Object.entries(report.category_scores).flatMap(([domain, categories]) => Object.entries(categories).map(([category, score]) => `<tr><td>${escapeHtml(domain)}</td><td>${escapeHtml(category)}</td><td>${score}</td></tr>`)).join('');
  const rows = report.findings.map((f) => `<tr><td>${escapeHtml(f.rule_id)}</td><td>${escapeHtml(f.domain)}</td><td>${escapeHtml(inferredCategory(f))}</td><td>${escapeHtml(f.severity)}</td><td>${escapeHtml(f.target || '')}</td><td>${escapeHtml(f.expected)}</td><td>${escapeHtml(f.actual)}</td><td>${escapeHtml((f.evidence || []).join(', '))}</td><td>${f.confidence}</td><td>${escapeHtml((f.suggested_files || []).join(', '))}</td><td>${f.auto_fix_allowed ? 'yes' : 'no'}</td></tr>`).join('');
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><title>Guaji quality report</title><style>body{font:15px system-ui;max-width:1400px;margin:40px auto;padding:0 20px;color:#172033}table{border-collapse:collapse;width:100%;margin-bottom:28px}th,td{border:1px solid #d8deea;padding:8px;text-align:left;vertical-align:top}.score{font-size:2rem}</style><h1>Guaji quality report</h1><p class="score">${report.final_score} · ${escapeHtml(report.decision)}</p><p>${Object.entries(report.scores).map(([k,v]) => `${k}: ${v}`).join(' · ')}</p><h2>Category scores</h2><table><thead><tr><th>Domain</th><th>Category</th><th>Score</th></tr></thead><tbody>${categoryRows}</tbody></table><h2>Findings</h2><table><thead><tr><th>Rule</th><th>Domain</th><th>Category</th><th>Severity</th><th>Target</th><th>Expected</th><th>Actual</th><th>Evidence</th><th>Confidence</th><th>Suggested files</th><th>Auto-fix</th></tr></thead><tbody>${rows || '<tr><td colspan="11">No findings</td></tr>'}</tbody></table></html>`;
}

function main() {
  const root = process.cwd();
  const input = process.argv[2] || path.join(root, 'quality/artifacts/latest/findings.json');
  const outputDir = process.argv[3] || path.join(root, 'quality/artifacts/latest');
  const findings = fs.existsSync(input) ? JSON.parse(fs.readFileSync(input, 'utf8')) : [];
  const scores = scoreFindings(findings);
  const decision = decide(scores, findings);
  const report = { run_id: process.env.QUALITY_RUN_ID || new Date().toISOString().replaceAll(/[:.]/g, '-'), generated_at: new Date().toISOString(), round: Number(process.env.QUALITY_ROUND || 0), category_scores: scoreCategories(findings), scores, final_score: Math.min(...Object.values(scores)), decision, findings };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'report.md'), renderMarkdown(report));
  fs.writeFileSync(path.join(outputDir, 'report.html'), renderHtml(report));
  console.log(JSON.stringify({ decision, final_score: report.final_score, output: outputDir }));
  process.exitCode = { pass: 0, auto_fix: 2, manual: 3, hard_failure: 4 }[decision];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
