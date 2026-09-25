// Opt in with GOAL_SCENARIOS_TEST_DATABASE_URL. Real SQL/HTTP/locks, but every
// row and table belongs to a disposable schema; existing user data is untouched.
jest.mock('../models/db', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../utils/redisClient', () => ({}));
jest.mock('../middleware/enhancedAuthMiddleware', () => {
  const interval = jest.spyOn(global, 'setInterval').mockImplementation(() => 0);
  try { return jest.requireActual('../middleware/enhancedAuthMiddleware'); }
  finally { interval.mockRestore(); }
});
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const User = require('../models/user');
const routes = require('../routes/userRoutes');

const integration = process.env.GOAL_SCENARIOS_TEST_DATABASE_URL ? describe : describe.skip;
integration('goal scenario replacement with PostgreSQL and real PATCH requests', () => {
  const schema = `goal_scenarios_test_${randomUUID().replaceAll('-', '')}`;
  const userId = randomUUID();
  const otherUser = randomUUID();
  const one = { title: '点餐', tasks: ['选主菜', '说熟度', '询问价格'], image_url: 'https://example.com/current.jpg', custom: 'keep' };
  const two = { title: '问路', tasks: ['问方向', '问距离', '表示感谢'] };
  let admin; let pool; let goalId; let server; let address; let token;
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.GOAL_SCENARIOS_TEST_DATABASE_URL, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: process.env.GOAL_SCENARIOS_TEST_DATABASE_URL, max: 5, options: `-c search_path=${schema}` });
    await pool.query('CREATE TABLE users (id UUID PRIMARY KEY)');
    const sql = fs.readFileSync(path.join(__dirname, '../../init.sql'), 'utf8');
    await pool.query(sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS user_goals ('), sql.indexOf('-- Final 3-4 turn scoring-window')));
    await pool.query('INSERT INTO users VALUES ($1), ($2)', [userId, otherUser]);
    db.query.mockImplementation((...args) => pool.query(...args));
    db.pool.connect.mockImplementation(() => pool.connect());
    jest.spyOn(User, 'findById').mockImplementation(id => Promise.resolve({ id, status: 'active' }));
    process.env.JWT_SECRET = 'offline-isolated-pg-goal-test';
    token = jwt.sign({ id: userId, type: 'access' }, process.env.JWT_SECRET,
      { algorithm: 'HS256', issuer: 'oral-app', audience: 'oral-app-users', expiresIn: '5m' });
    const app = express(); app.use(express.json()); app.use(routes);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    address = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    jest.restoreAllMocks();
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });
  beforeEach(async () => {
    await pool.query('DELETE FROM user_goals');
    goalId = (await pool.query("INSERT INTO user_goals (user_id,target_language,target_level,scenarios) VALUES ($1,'English','Intermediate',$2) RETURNING id",
      [userId, JSON.stringify([one, two])])).rows[0].id;
    for (const scene of [one, two]) for (const task of scene.tasks) {
      await pool.query('INSERT INTO user_tasks (user_id,goal_id,scenario_title,task_description,score,interaction_count,scoring_generation) VALUES ($1,$2,$3,$4,4,6,3)',
        [userId, goalId, scene.title, task]);
    }
  });
  async function patch(scenarios, jwtToken = token) {
    const response = await fetch(`${address}/api/users/goals/${goalId}/scenarios`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}` }, body: JSON.stringify({ scenarios }),
    });
    return { status: response.status, body: await response.json() };
  }
  async function snapshot() {
    return { goal: (await pool.query('SELECT * FROM user_goals WHERE id=$1', [goalId])).rows[0],
      tasks: (await pool.query('SELECT * FROM user_tasks WHERE goal_id=$1 ORDER BY id', [goalId])).rows };
  }
  test('changed identities reset, unchanged task IDs/score/generation and metadata survive; active response matches', async () => {
    const before = await snapshot();
    const updatedTwo = { title: two.title, tasks: ['问步行方向', ...two.tasks.slice(1)] };
    const result = await patch([{ title: one.title, tasks: one.tasks, image_url: 'https://example.com/stale.jpg' }, updatedTwo]);
    expect(result.status).toBe(200);
    const after = await snapshot();
    expect(after.goal.scenarios[0]).toEqual(one);
    expect(after.tasks.filter(task => task.task_description !== '问步行方向'))
      .toEqual(before.tasks.filter(task => task.task_description !== '问方向'));
    const fresh = after.tasks.find(task => task.task_description === '问步行方向');
    expect(fresh).toMatchObject({ status: 'pending', score: 0, interaction_count: 0, scoring_generation: 0 });
    expect(JSON.parse(JSON.stringify(await User.getActiveGoal(userId)))).toEqual(result.body.goal);
    const removedId = before.tasks.find(task => task.task_description === '问方向').id;
    const late = await pool.query('UPDATE user_tasks SET score=9 WHERE id=$1 AND user_id=$2 AND scoring_generation=$3', [removedId, userId, 3]);
    expect(late.rowCount).toBe(0);
    expect((await snapshot()).tasks.find(task => task.id === fresh.id).score).toBe(0);
  });
  test('rename and deletion reconcile JSONB/tasks and preserve all other pending progress', async () => {
    const before = await snapshot();
    expect((await patch([one, { ...two, title: '车站问路' }])).status).toBe(200);
    expect((await snapshot()).tasks.filter(task => task.scenario_title === one.title)).toEqual(before.tasks.slice(0, 3));
    expect((await snapshot()).tasks.filter(task => task.scenario_title === '车站问路')).toEqual(expect.arrayContaining([expect.objectContaining({ score: 0 })]));
    expect((await patch([one])).status).toBe(200);
    expect((await snapshot()).tasks).toEqual(before.tasks.slice(0, 3));
  });
  test.each(['title', 'task', 'delete'])('completed scenario cannot change by %s; transaction changes nothing', async change => {
    await pool.query("UPDATE user_tasks SET status='completed' WHERE goal_id=$1 AND task_description=$2", [goalId, one.tasks[0]]);
    const before = await snapshot();
    const changed = change === 'delete' ? [two] : [{ ...one, ...(change === 'title' ? { title: '新餐厅' } : { tasks: ['新任务', ...one.tasks.slice(1)] }) }, two];
    expect(await patch(changed)).toMatchObject({ status: 409, body: { code: 'scenario_locked', locked_scenarios: [one.title] } });
    expect(await snapshot()).toEqual(before);
  });
  test.each(['completed', 'archived'])('%s goal rejects mutation', async status => {
    await pool.query('UPDATE user_goals SET status=$1 WHERE id=$2', [status, goalId]);
    const before = await snapshot();
    expect(await patch([one])).toMatchObject({ status: 409, body: { code: 'goal_not_editable' } });
    expect(await snapshot()).toEqual(before);
  });
  test('owner filter rejects another authenticated user', async () => {
    const before = await snapshot();
    const other = jwt.sign({ id: otherUser, type: 'access' }, process.env.JWT_SECRET,
      { algorithm: 'HS256', issuer: 'oral-app', audience: 'oral-app-users', expiresIn: '5m' });
    expect((await patch([one], other)).status).toBe(404);
    expect(await snapshot()).toEqual(before);
  });
  test('invalid arrays, titles and tasks leave real database untouched', async () => {
    const before = await snapshot();
    const invalid = [[], Array.from({ length: 13 }, (_, index) => ({ ...two, title: String(index) })),
      [two, two], [{ ...one, title: '字'.repeat(101) }], [{ ...one, tasks: ['一', '二'] }],
      [{ ...one, tasks: ['字'.repeat(301), '二', '三'] }]];
    for (const scenes of invalid) {
      expect((await patch(scenes)).status).toBe(400);
      expect(await snapshot()).toEqual(before);
    }
  });
  test('paused goal accepts manual addition with three new pending rows', async () => {
    await pool.query("UPDATE user_goals SET status='paused' WHERE id=$1", [goalId]);
    const added = { title: '入住', tasks: ['登记姓名', '确认房型', '领取房卡'] };
    expect(await patch([one, two, added])).toMatchObject({ status: 200, body: { goal: { status: 'paused' } } });
    expect((await snapshot()).tasks.filter(task => task.scenario_title === added.title)).toEqual([
      expect.objectContaining({ task_description: '登记姓名', status: 'pending', score: 0 }),
      expect.objectContaining({ task_description: '确认房型', status: 'pending', score: 0 }),
      expect.objectContaining({ task_description: '领取房卡', status: 'pending', score: 0 }),
    ]);
  });
  test.each(['active', 'paused'])('completed-task percentage follows pending additions/deletions while %s status is preserved', async status => {
    await pool.query("UPDATE user_tasks SET status='completed', score=9 WHERE goal_id=$1 AND scenario_title=$2", [goalId, one.title]);
    await pool.query('UPDATE user_goals SET current_proficiency=50, status=$1 WHERE id=$2', [status, goalId]);
    const completedBefore = (await snapshot()).tasks.filter(task => task.status === 'completed');
    const added = { title: '入住', tasks: ['登记姓名', '确认房型', '领取房卡'] };
    expect(await patch([one, two, added])).toMatchObject({ status: 200, body: { goal: { current_proficiency: 33, status } } });
    expect((await snapshot()).goal.current_proficiency).toBe(33);
    expect(await patch([one, two])).toMatchObject({ status: 200, body: { goal: { current_proficiency: 50, status } } });
    expect(await patch([one])).toMatchObject({ status: 200, body: { goal: { current_proficiency: 100, status } } });
    const after = await snapshot();
    expect(after.goal).toMatchObject({ current_proficiency: 100, status });
    expect(after.tasks).toEqual(completedBefore);
  });
  test('two simultaneous PATCH requests serialize to a consistent complete snapshot without orphan tasks', async () => {
    const versions = [[one, { ...two, title: '公园问路' }], [one, { ...two, title: '机场问路' }]];
    const results = await Promise.all(versions.map(value => patch(value)));
    expect(results.map(result => result.status)).toEqual([200, 200]);
    const after = await snapshot();
    const expected = after.goal.scenarios.flatMap(scene => scene.tasks.map(text => [scene.title, text]));
    expect(after.tasks.map(task => [task.scenario_title, task.task_description]).sort()).toEqual(expected.sort());
    expect(after.tasks).toHaveLength(6);
  });
  test('in-flight completion yields busy immediately, then committed completion locks the scenario', async () => {
    const scoring = await pool.connect();
    try {
      await scoring.query('BEGIN');
      await scoring.query("UPDATE user_tasks SET status='completed' WHERE goal_id=$1 AND task_description=$2", [goalId, one.tasks[0]]);
      const result = await patch([two]);
      expect(result).toMatchObject({ status: 409, body: { code: 'scenarios_busy' } });
      // Scoring can still acquire goal lock after editor rolled back, proving no deadlock.
      await scoring.query('UPDATE user_goals SET updated_at=NOW() WHERE id=$1', [goalId]);
      await scoring.query('COMMIT');
      const before = await snapshot();
      expect(await patch([two])).toMatchObject({ status: 409, body: { code: 'scenario_locked' } });
      expect(await snapshot()).toEqual(before);
    } finally { await scoring.query('ROLLBACK'); scoring.release(); }
  });
});
