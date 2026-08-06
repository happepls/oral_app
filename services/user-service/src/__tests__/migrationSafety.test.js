const fs = require('node:fs');
const path = require('node:path');

const serviceRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(serviceRoot, '../..');

describe('production data migration gates', () => {
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
