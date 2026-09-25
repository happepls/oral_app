jest.mock('../models/db', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../utils/redisClient', () => ({}));
jest.mock('../middleware/enhancedAuthMiddleware', () => {
  // Exercise actual JWT/owner auth without starting its hourly cleanup daemon.
  const interval = jest.spyOn(global, 'setInterval').mockImplementation(() => 0);
  try { return jest.requireActual('../middleware/enhancedAuthMiddleware'); }
  finally { interval.mockRestore(); }
});

const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const db = require('../models/db');
const { overlayGoalTasks } = require('../models/goalScenarios');
const routes = require('../routes/userRoutes');

const scene = { title: '点餐', tasks: ['选主菜', '说熟度', '询问价格'] };
let server;
let address;
let token;
beforeAll(async () => {
  process.env.JWT_SECRET = 'offline-goal-scenario-route-test';
  token = jwt.sign({ id: 'u1', type: 'access' }, process.env.JWT_SECRET,
    { algorithm: 'HS256', issuer: 'oral-app', audience: 'oral-app-users', expiresIn: '5m' });
  const app = express();
  app.use(express.json());
  app.use(routes);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  address = `http://127.0.0.1:${server.address().port}/api/users/goals/7/scenarios`;
});
afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
beforeEach(() => {
  jest.spyOn(User, 'findById').mockResolvedValue({ id: 'u1', status: 'active' });
});
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });
async function patch(scenarios, auth = true, path = address) {
  return fetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ scenarios }) });
}

test('route requires real authentication middleware', async () => {
  const replace = jest.spyOn(User, 'replaceGoalScenarios');
  expect((await patch([scene], false)).status).toBe(401);
  expect(replace).not.toHaveBeenCalled();
});
test('non-owner is 404 without exposing a goal', async () => {
  jest.spyOn(User, 'replaceGoalScenarios').mockResolvedValue(null);
  const response = await patch([scene]);
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('goal_not_found');
});
test('trim, strip untrusted fields and return authoritative goal', async () => {
  const goal = { id: 7, scenarios: [scene] };
  const replace = jest.spyOn(User, 'replaceGoalScenarios').mockResolvedValue(goal);
  const response = await patch([{ ...scene, title: ' 点餐 ', id: 900, score: 9, status: 'completed' }]);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, goal });
  expect(replace).toHaveBeenCalledWith('u1', 7, [scene]);
});
test.each([
  [], Array.from({ length: 13 }, (_, i) => ({ ...scene, title: String(i) })),
  [scene, { ...scene, title: ' 点餐 ' }], [{ ...scene, tasks: ['一'] }],
  [{ ...scene, title: '长'.repeat(101) }], [{ ...scene, tasks: ['长'.repeat(301), '二', '三'] }],
  [{ ...scene, tasks: [' ', '二', '三'] }], [{ ...scene, tasks: ['一', ' 一 ', '三'] }],
  [{ ...scene, tasks: [{ text: '一' }, '二', '三'] }], [{ ...scene, image_url: 'javascript:alert(1)' }],
  [null], 'not-an-array',
])('reject malformed payload %# before model mutation', async scenarios => {
  const replace = jest.spyOn(User, 'replaceGoalScenarios');
  const response = await patch(scenarios);
  expect(response.status).toBe(400);
  expect((await response.json()).data.errors[0]).toEqual({ field: expect.any(String), message: expect.any(String) });
  expect(replace).not.toHaveBeenCalled();
});
test.each(['goal_not_editable', 'scenario_locked', 'scenarios_busy'])('409 preserves conflict reason %s', async code => {
  jest.spyOn(User, 'replaceGoalScenarios').mockRejectedValue(Object.assign(new Error('保存冲突'), { status: 409, code, lockedScenarios: ['点餐'] }));
  const response = await patch([scene]);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code, locked_scenarios: ['点餐'] });
});
test('projection preserves nonzero generation and completed progress in every response', async () => {
  const goal = { id: 7, scenarios: [scene] };
  const tasks = [{ id: 8, goal_id: 7, scenario_title: '点餐', task_description: '选主菜', score: 5,
    interaction_count: 9, scoring_generation: 3, status: 'completed' }];
  const expected = overlayGoalTasks(goal, tasks);
  db.query.mockResolvedValueOnce({ rows: [goal] }).mockResolvedValueOnce({ rows: tasks });
  expect(await User.getActiveGoal('u1')).toEqual(expected);
  db.query.mockResolvedValueOnce({ rows: [goal] }).mockResolvedValueOnce({ rows: tasks });
  expect(await User.getUserGoals('u1')).toEqual([expected]);
  expect(expected.scenarios[0].tasks[0]).toMatchObject({ id: 8, score: 5, interaction_count: 9, scoring_generation: 3, progress: 100 });
  expect(expected.scenarios[0].tasks[1]).toMatchObject({ id: null, scoring_generation: null });
  expect(overlayGoalTasks(goal, [{ ...tasks[0], scoring_generation: undefined }]).scenarios[0].tasks[0].scoring_generation).toBeNull();
});
test('model rolls back lock contention as a retryable conflict', async () => {
  const query = jest.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ id: 7, status: 'active' }] })
    .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: '55P03' })).mockResolvedValueOnce({});
  const release = jest.fn();
  db.pool.connect.mockResolvedValue({ query, release });
  await expect(User.replaceGoalScenarios('u1', 7, [scene])).rejects.toMatchObject({ status: 409, code: 'scenarios_busy' });
  expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  expect(release).toHaveBeenCalled();
});
test('goal list fails closed when authoritative task lookup fails', async () => {
  db.query.mockResolvedValueOnce({ rows: [{ id: 7, scenarios: [scene] }] })
    .mockRejectedValueOnce(new Error('task store unavailable'));
  await expect(User.getUserGoals('u1')).rejects.toThrow('task store unavailable');

  db.query.mockResolvedValueOnce({ rows: [{ id: 7, scenarios: [scene] }] })
    .mockRejectedValueOnce(new Error('task store unavailable'));
  const response = await fetch(address.replace('/7/scenarios', ''), { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ success: false, message: '获取目标列表时服务器错误' });
});
