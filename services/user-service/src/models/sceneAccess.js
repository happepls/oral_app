const { membership } = require('../stripe/membership');
const { overlayGoalTasks } = require('./goalScenarios');

function accessFor(user, goal, now = Date.now(), persistedTasks = null) {
  const member = membership(user, now);
  const isMember = member?.subscription_status === 'active';
  const scenarios = goal?.scenarios || [];
  let unlocked = Math.min(3, scenarios.length);
  const complete = s => {
    const tasks = persistedTasks ? persistedTasks.filter(t => t.scenario_title === s.title) : s.tasks;
    return tasks?.length > 0 && new Set(tasks.map(t => String(t.id))).size === tasks.length
      && tasks.every(t => t.id != null && t.scoring_generation != null && t.status === 'completed');
  };
  while (unlocked < scenarios.length && scenarios.slice(0, unlocked).every(complete)) unlocked++;
  if (isMember) unlocked = scenarios.length;
  return {
    membership: { active: isMember, status: member?.subscription_status || 'free', source: member?.billing_source || null },
    unlocked_count: unlocked,
    scenarios: scenarios.map((s, index) => ({ title: s.title, allowed: index < unlocked, reason: index < unlocked ? null : 'scene_locked' })),
  };
}

// Membership, goal ownership, and every persisted task come from one snapshot.
// Never authorize from the editable scenarios JSON or a paginated task list.
async function readAccess(db, userId) {
  const { rows } = await db.query(`
    SELECT row_to_json(u) AS account, row_to_json(g) AS goal,
      EXISTS(SELECT 1 FROM user_goals WHERE user_id = u.id AND status = 'paused') AS has_other_goals,
      COALESCE((SELECT json_agg(t ORDER BY t.id) FROM user_tasks t
        WHERE t.user_id = u.id AND t.goal_id = g.id), '[]'::json) AS tasks
    FROM users u LEFT JOIN LATERAL (
      SELECT * FROM user_goals WHERE user_id = u.id AND status = 'active'
      ORDER BY created_at DESC, id DESC LIMIT 1
    ) g ON TRUE WHERE u.id = $1`, [userId]);
  const row = rows[0];
  if (!row || ['suspended', 'deleted'].includes(row.account.status)) return null;
  const goal = row.goal ? overlayGoalTasks(row.goal, row.tasks) : null;
  const access = accessFor(row.account, goal, Date.now(), row.tasks);
  if (goal) goal.access = access;
  return { goal, access, has_other_goals: Boolean(row.has_other_goals) };
}

function authorize(snapshot, { scenario, mode, goal_id: goalId, operation = 'practice' } = {}) {
  if (!snapshot) return { allowed: false, status: 401, reason: 'account_unavailable' };
  const deny = reason => ({ allowed: false, status: 403, reason });
  if (!['practice', 'generate', 'pro'].includes(operation)) return deny('operation_invalid');
  if (goalId != null && String(goalId) !== String(snapshot.goal?.id)) return deny('goal_not_owned');
  if (operation === 'pro') return snapshot.access.membership.active
    ? { allowed: true, status: 200 } : deny('pro_required');
  if (operation === 'generate' && !scenario && !mode) return { allowed: true, status: 200 };
  if (![undefined, null, '', 'recall', 'daily_qa', 'quick_experience'].includes(mode)) return deny('mode_invalid');
  if (mode === 'daily_qa' || mode === 'quick_experience') {
    // These modes have fixed server prompts and cannot select a goal scenario.
    if (scenario && !(mode === 'quick_experience' && scenario === 'English interview')) return deny('mode_scenario_invalid');
    if (mode === 'daily_qa' && !snapshot.goal) return deny('active_goal_required');
    return { allowed: true, status: 200 };
  }
  const matches = snapshot.access.scenarios.filter(s => s.title === scenario);
  if (matches.length !== 1) return deny('scene_not_owned');
  return matches[0].allowed ? { allowed: true, status: 200 } : deny(matches[0].reason);
}

module.exports = { accessFor, readAccess, authorize };
