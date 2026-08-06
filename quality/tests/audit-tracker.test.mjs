import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditTracker } from '../../scripts/quality/audit-tracker.mjs';

const report = '| Rule | Summary |\n|---|---|\n| UI-1 | First |\n| UI-2 | Second |\n';

test('reports a verified count when declared and parsed counts match', () => {
  const result = buildAuditTracker(report, { declared_count: 2, items: {} });
  assert.match(result.markdown, /Source count verified: 2 items/);
  assert.doesNotMatch(result.markdown, /mismatch/);
});

test('reports a mismatch only when counts differ', () => {
  const result = buildAuditTracker(report, { declared_count: 3, items: {} });
  assert.match(result.markdown, /This mismatch requires manual arbitration/);
});
