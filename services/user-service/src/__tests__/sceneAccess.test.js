const { accessFor, readAccess, authorize } = require('../models/sceneAccess');

const user = { subscription_status: 'free', stripe_subscription_status: 'free' };
const goal = completed => ({ id: 7, scenarios: Array.from({ length: 5 }, (_, i) => ({
  title: `scene-${i}`, tasks: [{ id: i + 1, text: 'task', scoring_generation: 3, status: i < completed ? 'completed' : 'pending' }],
})) });
const snapshot = (account, g) => ({ goal: g, access: accessFor(account, g) });

test('free initial three then progressively unlock only complete persisted scenes', () => {
  for (const [completed, unlocked] of [[0, 3], [2, 3], [3, 4], [4, 5]]) {
    expect(accessFor(user, goal(completed)).unlocked_count).toBe(unlocked);
  }
  const g = goal(3);
  g.scenarios[0].tasks[0].scoring_generation = null;
  expect(accessFor(user, g).unlocked_count).toBe(3);
  g.scenarios[0].tasks = [];
  expect(accessFor(user, g).unlocked_count).toBe(3);
});

test('prepaid expiry and subscription refund recompute access on every check', () => {
  const g = goal(0);
  const account = { ...user, subscription_status: 'active', prepaid_expires_at: '2026-10-08T00:00:00Z' };
  expect(accessFor(account, g, Date.parse('2026-10-07T23:59:59Z')).unlocked_count).toBe(5);
  expect(accessFor(account, g, Date.parse('2026-10-08T00:00:00Z')).unlocked_count).toBe(3);
  expect(accessFor({ ...user, stripe_subscription_status: 'active' }, g).unlocked_count).toBe(5);
  expect(accessFor({ ...user, stripe_subscription_status: 'canceled' }, g).unlocked_count).toBe(3);
});

test('locked scene, ownership, forged modes and membership cannot bypass authority', () => {
  const s = snapshot(user, goal(0));
  expect(authorize(s, { scenario: 'scene-3', subscription_status: 'active' })).toMatchObject({ status: 403, reason: 'scene_locked' });
  for (const mode of ['recall', 'daily_qa', 'tour', 'magic_repetition', 'quick_experience', 'bogus']) {
    expect(authorize(s, { scenario: 'scene-3', mode }).allowed).toBe(false);
  }
  expect(authorize(s, { scenario: 'scene-0', mode: 'recall' }).allowed).toBe(true);
  expect(authorize(s, { mode: 'daily_qa' }).allowed).toBe(true);
  expect(authorize(s, { scenario: 'English interview', mode: 'quick_experience' }).allowed).toBe(true);
  expect(authorize(s, { scenario: 'scene-0', goal_id: 8 }).reason).toBe('goal_not_owned');
  expect(authorize(s, { scenario: 'other-user-scene' }).reason).toBe('scene_not_owned');
  expect(authorize(null, {}).status).toBe(401);
});

test('full database snapshot ignores forged JSON completion beyond 100 tasks', async () => {
  const g = goal(5);
  const db = { query: jest.fn(async () => ({ rows: [{ account: user, goal: g, tasks: [
    ...Array.from({ length: 101 }, (_, i) => ({ id: i + 10, scenario_title: 'other', task_description: 'task', status: 'completed', scoring_generation: 3 })),
    { id: 1, scenario_title: 'scene-0', task_description: 'task', status: 'pending', score: 3, interaction_count: 4, scoring_generation: 3 },
  ] }] })) };
  const s = await readAccess(db, 'owner');
  expect(s.access.unlocked_count).toBe(3);
  expect(s.goal.scenarios[0].tasks[0]).toMatchObject({ score: 3, progress: 33, scoring_generation: 3, interaction_count: 4 });
  expect(s.goal.scenarios[1].tasks[0].scoring_generation).toBeNull();
  expect(db.query.mock.calls[0][0]).toContain('t.user_id = u.id AND t.goal_id = g.id');
  expect(db.query.mock.calls[0][1]).toEqual(['owner']);
});

test('duplicate or substituted JSON IDs cannot hide pending persisted tasks', async () => {
  const g = goal(5);
  const tasks = g.scenarios.flatMap((s, i) => [
    { id: i * 3 + 1, scenario_title: s.title, task_description: 'done', status: 'completed', scoring_generation: 3 },
    { id: i * 3 + 2, scenario_title: s.title, task_description: 'pending', status: 'pending', scoring_generation: 3 },
  ]);
  g.scenarios.forEach((s, i) => { s.tasks = [{ id: i * 3 + 1, text: 'done' }, { id: i * 3 + 1, text: 'pending' }]; });
  const db = { query: async () => ({ rows: [{ account: user, goal: g, tasks }] }) };
  expect((await readAccess(db, 'owner')).access.unlocked_count).toBe(3);
});
