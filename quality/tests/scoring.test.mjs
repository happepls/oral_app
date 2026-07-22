import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreFindings, decide } from '../../scripts/quality/score.mjs';

test('affected domain minimum determines the final gate', () => {
  const findings = [{ domain: 'frontend', severity: 'major', confidence: 1, auto_fix_allowed: true }];
  const scores = scoreFindings(findings);
  assert.equal(scores.frontend, 94);
  assert.equal(decide(scores, findings), 'pass');
});

test('hard blockers cap every affected score and exit as hard failure', () => {
  const findings = [{ domain: 'backend', severity: 'critical', hard_blocker: 'authorization_bypass', confidence: 1, auto_fix_allowed: false }];
  const scores = scoreFindings(findings);
  assert.deepEqual(scores, { frontend: 69, backend: 69, integration: 69 });
  assert.equal(decide(scores, findings), 'hard_failure');
});

test('low confidence always requires manual arbitration', () => {
  const findings = [{ domain: 'frontend', severity: 'minor', confidence: 0.79, auto_fix_allowed: true }];
  assert.equal(decide(scoreFindings(findings), findings), 'manual');
});
