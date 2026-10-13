// Opt-in real PostgreSQL/HTTP contract checks. All tables use an isolated schema.
jest.mock('../models/db', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../utils/redisClient', () => ({}));
jest.mock('../middleware/enhancedAuthMiddleware', () => {
  const timer = jest.spyOn(global, 'setInterval').mockImplementation(() => 0);
  try { return jest.requireActual('../middleware/enhancedAuthMiddleware'); }
  finally { timer.mockRestore(); }
});
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const User = require('../models/user');
const { protect, internalAuthWithNetworkSkip } = require('../middleware/enhancedAuthMiddleware');
const scenes = require('../controllers/sceneAccessController');
const users = require('../controllers/userController');

const integration = process.env.SCENE_ACCESS_TEST_DATABASE_URL ? describe : describe.skip;
integration('authoritative scene access with real PostgreSQL and HTTP', () => {
  const schema = `scene_access_test_${randomUUID().replaceAll('-', '')}`;
  const owner = randomUUID(), other = randomUUID();
  const oldJwt = process.env.JWT_SECRET, oldInternal = process.env.INTERNAL_AUTH_SECRET;
  let admin, pool, server, address, token, goalId;
  const scenarioList = (count = 3) => Array.from({ length: 4 }, (_, i) => ({ title: `scene-${i}`, tasks: Array.from({ length: count }, (_, j) => `task-${j}`) }));
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.SCENE_ACCESS_TEST_DATABASE_URL, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: process.env.SCENE_ACCESS_TEST_DATABASE_URL, max: 5, options: `-c search_path=${schema}` });
    await pool.query(`CREATE TABLE users (id UUID PRIMARY KEY, status TEXT DEFAULT 'active', subscription_status TEXT DEFAULT 'free', stripe_subscription_status TEXT DEFAULT 'free', prepaid_expires_at TIMESTAMPTZ);
      CREATE TABLE user_identities (provider TEXT, provider_uid TEXT, user_id UUID REFERENCES users(id));`);
    const sql = fs.readFileSync(path.join(__dirname, '../../init.sql'), 'utf8');
    await pool.query(sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS user_goals ('), sql.indexOf('-- Final 3-4 turn scoring-window')));
    await pool.query('INSERT INTO users (id) VALUES ($1),($2)', [owner, other]);
    db.query.mockImplementation((...args) => pool.query(...args));
    db.pool.connect.mockImplementation(() => pool.connect());
    process.env.JWT_SECRET = 'isolated-scene-access-integration';
    process.env.INTERNAL_AUTH_SECRET = 'isolated-scene-access-internal';
    token = jwt.sign({ id: owner, type: 'access' }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'oral-app', audience: 'oral-app-users', expiresIn: '5m' });
    const app = express(); app.use(express.json()); app.use(cookieParser());
    app.post('/api/users/access/check', protect, scenes.check);
    app.post('/api/users/internal/users/:id/access/check', internalAuthWithNetworkSkip, scenes.check);
    app.get('/api/users/internal/users/:id/access', internalAuthWithNetworkSkip, scenes.snapshot);
    app.get('/api/users/goals/active', protect, users.getActiveGoal);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    address = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
    if (oldJwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldJwt;
    if (oldInternal === undefined) delete process.env.INTERNAL_AUTH_SECRET; else process.env.INTERNAL_AUTH_SECRET = oldInternal;
    jest.restoreAllMocks();
  });
  async function seed(user = owner, list = scenarioList(), status = 'active') {
    const id = (await pool.query("INSERT INTO user_goals (user_id,target_language,target_level,scenarios,status) VALUES ($1,'English','Intermediate',$2,$3) RETURNING id", [user, JSON.stringify(list), status])).rows[0].id;
    for (const scene of list) for (const text of scene.tasks) await pool.query('INSERT INTO user_tasks (user_id,goal_id,scenario_title,task_description,scoring_generation) VALUES ($1,$2,$3,$4,3)', [user, id, scene.title, text]);
    return id;
  }
  beforeEach(async () => {
    db.query.mockImplementation((...args) => pool.query(...args));
    await pool.query('DELETE FROM user_goals');
    await pool.query("UPDATE users SET stripe_subscription_status='free', subscription_status='free', prepaid_expires_at=NULL");
    goalId = await seed();
  });
  async function request(route, body, headers = { Authorization: `Bearer ${token}` }) {
    const response = await fetch(`${address}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  const check = (body, headers) => request('/api/users/access/check', body, headers);
  async function completeInitial() {
    const tasks = (await pool.query("SELECT id FROM user_tasks WHERE goal_id=$1 AND scenario_title != 'scene-3' ORDER BY id", [goalId])).rows;
    for (const task of tasks) {
      await pool.query('UPDATE user_tasks SET score=9,interaction_count=12 WHERE id=$1', [task.id]);
      const result = await User.confirmCompleteTaskById(owner, task.id, null, 3);
      expect(result.error).toBeUndefined();
      expect(result.completed_task.status).toBe('completed');
    }
  }
  test('Bearer and Cookie authenticate; initial fourth scene rejects forged membership and modes', async () => {
    expect((await check({ scenario: 'scene-0' })).status).toBe(200);
    expect((await check({ scenario: 'scene-0' }, { Cookie: `accessToken=${token}` })).status).toBe(200);
    expect(await check({ scenario: 'scene-3', subscription_status: 'active' })).toMatchObject({ status: 403, body: { reason: 'scene_locked' } });
    for (const mode of ['recall', 'daily_qa', 'tour', 'magic_repetition', 'quick_experience']) expect((await check({ scenario: 'scene-3', mode })).status).toBe(403);
    expect((await check({ scenario: 'scene-0' }, {})).status).toBe(401);
  });
  test('persisted generation-three completion progressively unlocks scene four', async () => {
    await completeInitial();
    expect(await check({ scenario: 'scene-3' })).toMatchObject({ status: 200, body: { access: { unlocked_count: 4 } } });
    const restored = await request('/api/users/goals/active');
    expect(restored.cache).toBe('no-store');
    expect(restored.body.data.goal.scenarios[0].tasks[0]).toMatchObject({ status: 'completed', score: 9, scoring_generation: 3, interaction_count: 12 });
  });
  test('full snapshot restores more than one hundred tasks with IDs and nonzero generations', async () => {
    await pool.query('DELETE FROM user_goals');
    goalId = await seed(owner, scenarioList(30));
    const restored = await request('/api/users/goals/active');
    const tasks = restored.body.data.goal.scenarios.flatMap(s => s.tasks);
    expect(tasks).toHaveLength(120);
    expect(new Set(tasks.map(t => t.id)).size).toBe(120);
    expect(tasks.every(t => t.scoring_generation === 3)).toBe(true);
    expect((await check({ scenario: 'scene-3' })).status).toBe(403);
  });
  test('forged JSON completion and duplicate IDs cannot unlock pending persisted tasks', async () => {
    const rows = (await pool.query('SELECT * FROM user_tasks WHERE goal_id=$1 ORDER BY id', [goalId])).rows;
    const forged = scenarioList().map(scene => ({ ...scene, tasks: scene.tasks.map(text => ({ text, id: rows.find(t => t.scenario_title === scene.title).id, status: 'completed', score: 99, scoring_generation: 3 })) }));
    await pool.query('UPDATE user_goals SET scenarios=$1 WHERE id=$2', [JSON.stringify(forged), goalId]);
    expect((await check({ scenario: 'scene-3' })).status).toBe(403);
    for (const scene of forged.slice(0, 3)) {
      await pool.query('UPDATE user_tasks SET score=9,interaction_count=12 WHERE id=$1', [scene.tasks[0].id]);
      await User.confirmCompleteTaskById(owner, scene.tasks[0].id, null, 3);
    }
    expect(await check({ scenario: 'scene-3' })).toMatchObject({ status: 403, body: { access: { unlocked_count: 3 } } });
  });
  test('cross-goal IDs and another user scenario titles fail authorization', async () => {
    const paused = await seed(owner, scenarioList(), 'paused');
    await seed(other, [{ title: 'private-other-scene', tasks: ['other-task'] }]);
    expect((await check({ scenario: 'scene-0', goal_id: paused })).status).toBe(403);
    expect((await check({ scenario: 'private-other-scene' })).status).toBe(403);
  });
  test('prepaid expiry, payment, and refund affect the next request immediately', async () => {
    await pool.query("UPDATE users SET prepaid_expires_at=NOW()+INTERVAL '1 hour' WHERE id=$1", [owner]);
    expect((await check({ scenario: 'scene-3' })).status).toBe(200);
    await pool.query("UPDATE users SET prepaid_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [owner]);
    expect((await check({ scenario: 'scene-3' })).status).toBe(403);
    await pool.query("UPDATE users SET stripe_subscription_status='active' WHERE id=$1", [owner]);
    expect((await check({ scenario: 'scene-3' })).status).toBe(200);
    await pool.query("UPDATE users SET stripe_subscription_status='canceled' WHERE id=$1", [owner]);
    expect((await check({ scenario: 'scene-3' })).status).toBe(403);
  });
  test('internal endpoint requires the service secret even from loopback', async () => {
    const route = `/api/users/internal/users/${owner}/access/check`;
    expect((await request(route, { scenario: 'scene-0' }, {})).status).toBe(403);
    expect((await request(route, { scenario: 'scene-0' }, { 'X-Guaji-Internal-Auth': process.env.INTERNAL_AUTH_SECRET })).status).toBe(200);
  });
  test('database failure fails closed with 503 for authenticated and internal callers', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    db.query.mockRejectedValue(new Error('isolated database unavailable'));
    try {
      expect((await check({ scenario: 'scene-0' })).status).toBe(503);
      expect((await request(`/api/users/internal/users/${owner}/access/check`, { scenario: 'scene-0' }, { 'X-Guaji-Internal-Auth': process.env.INTERNAL_AUTH_SECRET })).status).toBe(503);
    } finally { log.mockRestore(); }
  });
});
