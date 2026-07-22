import fs from 'node:fs';

const report = fs.readFileSync('docs/ui-audit-report.md', 'utf8');
const config = JSON.parse(fs.readFileSync('quality/audit-status.json', 'utf8'));
const matches = report.split(/\r?\n/).map((line) => line.match(/^\|\s*([A-Z]+-\d+)\s*\|\s*(.*?)\s*\|/)).filter(Boolean);
const items = matches.map((match) => ({ rule_id: match[1], summary: match[2].replaceAll('**', '').trim(), ...(config.items[match[1]] || { status: 'open', evidence: [] }) }));
const counts = items.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});
const markdown = `# UI audit closure tracker\n\n> Source declares ${config.declared_count} items; parser found ${items.length}. This mismatch requires manual arbitration before final approval.\n\n${Object.entries(counts).map(([key, value]) => `- ${key}: ${value}`).join('\n')}\n\n| Rule | Status | Summary | Evidence |\n|---|---|---|---|\n${items.map((item) => `| ${item.rule_id} | ${item.status} | ${item.summary.replaceAll('|', '\\|')} | ${(item.evidence || []).join('<br>')} |`).join('\n')}\n`;
fs.mkdirSync('quality/artifacts/latest', { recursive: true });
fs.writeFileSync('quality/artifacts/latest/ui-audit-tracker.json', `${JSON.stringify({ declared_count: config.declared_count, parsed_count: items.length, counts, items }, null, 2)}\n`);
fs.writeFileSync('quality/artifacts/latest/ui-audit-tracker.md', markdown);
console.log(JSON.stringify({ declared: config.declared_count, parsed: items.length, counts }));
