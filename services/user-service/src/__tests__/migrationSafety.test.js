const fs = require('node:fs');
const path = require('node:path');

const serviceRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(serviceRoot, '../..');

describe('production data migration gates', () => {
  test('task scoring generation migration is additive and non-destructive', () => {
    const migration = fs.readFileSync(
      path.join(serviceRoot, 'migrations/20260830_task_scoring_generation.sql'),
      'utf8'
    );
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS scoring_generation/i);
    expect(migration).toMatch(/NOT NULL DEFAULT 0/i);
    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);
  });

  test('scoring idempotency ledger is present in fresh and upgrade schemas', () => {
    for (const filename of ['init.sql', 'update_db.sql']) {
      const schema = fs.readFileSync(path.join(serviceRoot, filename), 'utf8');
      expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS workflow_scoring_evaluations/i);
      expect(schema).toMatch(/idx_workflow_scoring_evaluations_task_generation/i);
    }
  });

  test('structural migrations do not rewrite goal or subscription data', () => {
    const goalMigration = fs.readFileSync(
      path.join(serviceRoot, 'migrations/20260724_recall_goal_status.sql'),
      'utf8'
    );
    const subscriptionMigration = fs.readFileSync(
      path.join(serviceRoot, 'migrations/20260724_repair_orphaned_active_subscriptions.sql'),
      'utf8'
    );

    expect(goalMigration).not.toMatch(/UPDATE\s+user_goals/i);
    expect(subscriptionMigration).not.toMatch(/UPDATE\s+users/i);
    expect(subscriptionMigration).not.toMatch(/INSERT\s+INTO\s+subscription_repair_audit/i);
  });

  test('legacy goal rewrite requires count match and explicit confirmation', () => {
    const gate = fs.readFileSync(
      path.join(repositoryRoot, 'scripts/release/data-migration-gate.sh'),
      'utf8'
    );

    expect(gate).toContain('CONFIRM_ARCHIVE_ABANDONED');
    expect(gate).toContain('Candidate count changed');
    expect(gate).toContain('count-subscription-candidates');
    expect(gate).not.toMatch(/subscription_status\s*=\s*'free'/);
  });
});
