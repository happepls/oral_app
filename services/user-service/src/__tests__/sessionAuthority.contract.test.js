const express = require('express');
const { validateContentType } = require('../middleware/securityMiddleware');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../../developer-api-service/src/app');
const sessionSecret = 'session-authority-contract-test';
const userId = '00000000-0000-4000-8000-000000000001';

// Exercise the real production ingress middleware, rather than mocking fetch
// as successful before the request contract has been checked.
describe('browser-session authority HTTP contract', () => {
  let server;
  let url;
  let authorityCalls;
  const previousFlag = process.env.DEVICE_SESSION_LIMIT_ENABLED;
  const previousUrl = process.env.USER_SERVICE_URL;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(validateContentType);
    app.post('/api/users/verify', (req, res) => {
      authorityCalls += 1;
      if (req.headers.authorization === 'Bearer healthy-session') return res.json({ success: true });
      if (req.headers.authorization === 'Bearer revoked-session') return res.status(401).json({ code: 'SESSION_REVOKED' });
      try {
        const claims = jwt.verify(String(req.headers.authorization).slice(7), sessionSecret);
        if (claims.id === userId && claims.sid === 'active-session') return res.json({ success: true });
        return res.status(401).json({ code: 'SESSION_REVOKED' });
      } catch (_) { /* Synthetic outage request below. */ }
      return res.status(503).json({ code: 'authorization_unavailable' });
    });
    app.get(`/api/users/internal/users/${userId}/access`, (req, res) => {
      expect(req.headers['x-guaji-user-id']).toBe(userId);
      expect(req.headers['x-guaji-internal-auth']).toBe('test-internal-authority');
      const access = { membership: { active: true }, unlocked_count: 1, scenarios: [{ title: 'Cafe', allowed: true }] };
      res.json({ data: { access, goal: { id: 35, access, scenarios: [{ title: 'Cafe', tasks: [
        { id: 'completed-task', status: 'completed', score: 9, interaction_count: 4, scoring_generation: 3 },
      ] }] } } });
    });
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${server.address().port}`;
    process.env.USER_SERVICE_URL = url;
    process.env.DEVICE_SESSION_LIMIT_ENABLED = 'true';
  });

  beforeEach(() => { authorityCalls = 0; });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (previousFlag === undefined) delete process.env.DEVICE_SESSION_LIMIT_ENABLED;
    else process.env.DEVICE_SESSION_LIMIT_ENABLED = previousFlag;
    if (previousUrl === undefined) delete process.env.USER_SERVICE_URL;
    else process.env.USER_SERVICE_URL = previousUrl;
  });

  test('counterexample: a bodyless POST without JSON content type is rejected before authority', async () => {
    const response = await fetch(`${url}/api/users/verify`, {
      method: 'POST', headers: { Authorization: 'Bearer healthy-session' },
    });
    expect(response.status).toBe(415);
    expect((await response.json()).message).toBe('Content-Type must be application/json');
    expect(authorityCalls).toBe(0);
  });

  test('real first-party cookie reaches the Discovery v1 snapshot through session authority', async () => {
    const db = { query: jest.fn(async () => ({ rows: [{ id: 'test-grant' }] })) };
    const app = createApp({ db, delegatedSecret: 'test-delegated', realtimeSecret: sessionSecret,
      internalAuthSecret: 'test-internal-authority', userServiceUrl: url });
    let gateway;
    await new Promise(resolve => { gateway = app.listen(0, '127.0.0.1', resolve); });
    try {
      const cookie = sid => `accessToken=${jwt.sign({ id: userId, type: 'access', sid }, sessionSecret,
        { issuer: 'oral-app', audience: 'oral-app-users', expiresIn: '1h' })}`;
      const endpoint = `http://127.0.0.1:${gateway.address().port}/v1/goals/active`;
      const response = await fetch(endpoint, { headers: { Cookie: cookie('active-session') } });
      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data.access.membership.active).toBe(true);
      expect(data.goal.scenarios).toHaveLength(1);
      expect(data.goal.scenarios[0].tasks[0]).toMatchObject({ scoring_generation: 3, score: 9, status: 'completed' });
      const denied = await fetch(endpoint, { headers: { Cookie: cookie('revoked-session') } });
      expect(denied.status).toBe(401);
      expect((await denied.json()).error.code).toBe('SESSION_REVOKED');
      expect(authorityCalls).toBe(2);
    } finally {
      gateway.closeAllConnections();
      await new Promise(resolve => gateway.close(resolve));
    }
  });

  for (const service of ['comms-service', 'history-analytics-service', 'conversation-service', 'developer-api-service']) {
    const { checkLoginSession } = require(`../../../${service}/src/loginSession`);

    test(`${service}: healthy SID and legacy requests pass real ingress`, async () => {
      await expect(checkLoginSession('healthy-session', { id: 'user', sid: 'session' })).resolves.toBeUndefined();
      await expect(checkLoginSession('healthy-session', { id: 'user' })).resolves.toBeUndefined();
      expect(authorityCalls).toBe(2);
    });

    test(`${service}: revoked sessions still fail closed with semantic 401`, async () => {
      await expect(checkLoginSession('revoked-session', { id: 'user', sid: 'revoked' }))
        .rejects.toMatchObject({ status: 401, code: 'SESSION_REVOKED' });
      expect(authorityCalls).toBe(1);
    });

    test(`${service}: authority outages still fail closed`, async () => {
      await expect(checkLoginSession('unavailable', { id: 'user', sid: 'session' }))
        .rejects.toMatchObject({ status: 503, code: 'authorization_unavailable' });
      expect(authorityCalls).toBe(1);
    });
  }
});
