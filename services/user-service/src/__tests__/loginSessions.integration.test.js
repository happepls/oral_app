jest.mock('../models/db', () => ({ pool: { connect: jest.fn() }, query: jest.fn() }));
jest.mock('../utils/redisClient', () => ({ status: 'wait' }));
const { Pool } = require('pg');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../models/db');
const sessions = require('../models/loginSessions');
const suite = process.env.SESSION_TEST_DATABASE_URL ? describe : describe.skip;
suite('durable device sessions with real PostgreSQL locks', () => {
  let admin, pool, user;
  const schema = 'sessions_test_' + randomUUID().replaceAll('-', '');
  const issue = device => sessions.issue({ cookies: { loginDevice: device.repeat(64) } }, { cookie: jest.fn() }, user);
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.SESSION_TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: process.env.SESSION_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    db.pool.connect.mockImplementation(() => pool.connect());
    db.query.mockImplementation((...args) => pool.query(...args));
    await pool.query('CREATE TABLE users(id uuid PRIMARY KEY, subscription_status text)');
    await pool.query(fs.readFileSync(path.join(__dirname, '../../migrations/20261109_device_sessions.sql'), 'utf8'));
    process.env.DEVICE_SESSION_LIMIT_ENABLED = 'true';
  });
  beforeEach(async () => {
    user = randomUUID();
    await pool.query("INSERT INTO users VALUES($1,'active')", [user]);
  });
  afterAll(async () => {
    delete process.env.DEVICE_SESSION_LIMIT_ENABLED;
    await pool?.end();
    await admin?.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin?.end();
  });
  test('third browser evicts oldest; revocation survives a fresh database read', async () => {
    const a = await issue('a'), b = await issue('b'), c = await issue('c');
    await expect(sessions.validate({ id: user, sid: a })).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    await sessions.validate({ id: user, sid: b });
    await sessions.validate({ id: user, sid: c });
    await sessions.revoke({ id: user, sid: c });
    await expect(sessions.validate({ id: user, sid: c })).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
  test('same browser uses one slot and retains its original order', async () => {
    const a = await issue('a');
    const b = await issue('b');
    const a2 = await issue('a');
    expect(a2).toBe(a);
    await sessions.validate({ id: user, sid: a });
    await issue('c');
    for (const sid of [a, a2]) await expect(sessions.validate({ id: user, sid })).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    await sessions.validate({ id: user, sid: b });
  });
  test('concurrent login cannot exceed two active sessions', async () => {
    await Promise.all(['a','b','c','d','e','f'].map(issue));
    const result = await pool.query('SELECT count(*)::int AS count FROM login_sessions WHERE user_id=$1 AND revoked_at IS NULL', [user]);
    expect(result.rows[0].count).toBe(2);
  });
  test('free accounts stay unlimited; upgrade trims and rejects legacy JWTs', async () => {
    await pool.query("UPDATE users SET subscription_status='free' WHERE id=$1", [user]);
    const ids = [];
    for (const d of ['a','b','c']) ids.push(await issue(d));
    for (const sid of ids) await sessions.validate({ id: user, sid });
    await sessions.validate({ id: user });
    await pool.query("UPDATE users SET subscription_status='active' WHERE id=$1", [user]);
    await expect(sessions.validate({ id: user })).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    await expect(sessions.validate({ id: user, sid: ids[0] })).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
  test('expired and foreign sessions cannot authorize or consume capacity', async () => {
    const a = await issue('a');
    await pool.query("UPDATE login_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [a]);
    await expect(sessions.validate({ id: user, sid: a })).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    await expect(sessions.validate({ id: user, sid: randomUUID() })).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    await issue('b'); await issue('c');
  });
  test('real HTTP verify and token migration reject an evicted JWT, logout revokes the winner', async () => {
    process.env.JWT_SECRET = 'session-integration-only-secret';
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const cookieParser = require('cookie-parser');
    const controller = require('../controllers/userController');
    const User = require('../models/user');
    const password = await require('bcryptjs').hash('test-password', 4);
    const lookup = jest.spyOn(User, 'findByEmail').mockResolvedValue({ id: user, subscription_status: 'active', password });
    const byId = jest.spyOn(User, 'findById').mockResolvedValue({ id: user, subscription_status: 'active' });
    const interval = jest.spyOn(global, 'setInterval').mockImplementation(() => 0);
    const auth = require('../middleware/enhancedAuthMiddleware');
    interval.mockRestore();
    process.env.JWT_REFRESH_SECRET = 'session-refresh-integration-only-secret';
    const app = express();
    app.use(express.json(), cookieParser());
    app.post('/verify', controller.verifyToken);
    app.post('/migrate', controller.tokenMigrate);
    app.post('/logout', controller.logout);
    app.post('/login', controller.login);
    app.get('/protected', auth.protect, (_req, res) => res.json({ ok: true }));
    app.post('/refresh', auth.refresh);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
      const login = async device => {
        const response = await fetch(url + '/login', { method: 'POST', headers: { 'content-type': 'application/json', Cookie: 'loginDevice=' + device.repeat(64) }, body: JSON.stringify({ email: 'fixture@example.test', password: 'test-password' }) });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(jwt.verify(body.data.token, process.env.JWT_SECRET).sid).toBeTruthy();
        return body.data.token;
      };
      const old = await login('a');
      await login('b');
      const current = await login('c');
      const get = value => fetch(url + '/protected', { headers: { Cookie: 'accessToken=' + value } });
      expect((await get(old)).status).toBe(401);
      expect((await get(current)).status).toBe(200);
      for (const endpoint of ['/verify', '/migrate']) {
        const denied = await fetch(url + endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + old } });
        expect(denied.status).toBe(401);
        expect((await denied.json()).code).toBe('SESSION_REVOKED');
      }
      const request = endpoint => fetch(url + endpoint, { method: 'POST', headers: { Cookie: 'accessToken=' + current } });
      expect((await request('/verify')).status).toBe(200);
      db.pool.connect.mockRejectedValueOnce(new Error('simulated connection outage'));
      expect((await request('/verify')).status).toBe(503);
      const refresh = () => fetch(url + '/refresh', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: auth.generateRefreshToken(user, jwt.decode(current).sid) }) });
      expect((await refresh()).status).toBe(200);
      expect((await request('/logout')).status).toBe(200);
      expect((await request('/verify')).status).toBe(401);
      expect((await refresh()).status).toBe(401);
    } finally { lookup.mockRestore(); byId.mockRestore(); await new Promise(resolve => server.close(resolve)); }
  });
});
