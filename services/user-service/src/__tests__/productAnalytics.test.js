const express = require('express');
const crypto = require('node:crypto');
jest.mock('../models/user', () => ({ findById: jest.fn(async id => ({ id })) }));
const { createProductAnalytics, safePath, safeReferrer } = require('../analytics/productAnalytics');
const userId = 'd8fb9390-2222-4444-8888-dcc260b07e25';
const env = { PRODUCT_ANALYTICS_ENABLED: 'true', UMAMI_URL: 'http://umami:3000',
  UMAMI_WEBSITE_ID: '11111111-2222-4444-8888-999999999999',
  ANALYTICS_WRITE_TOKEN: 'only-for-tests-a-long-credential-12345', ANALYTICS_ADMIN_USER_IDS: userId };

describe('product analytics boundaries', () => {
  let server, url, db, send, analytics;
  beforeEach(async () => {
    db = { query: jest.fn(async () => ({ rows: [{ registered: 2, completed: 1, mature_7d: 0, completed_7d: 0 }] })),
      pool: { connect: jest.fn() } };
    send = jest.fn(async () => ({ ok: true, json: async () => ({ sessionId: 'accepted' }) }));
    const protect = (req, res, next) => {
      if (!req.headers['x-test-user']) return res.sendStatus(401);
      req.user = { id: req.headers['x-test-user'] }; next();
    };
    analytics = createProductAnalytics({ db, protect, env: { ...env }, send });
    const app = express(); app.use(express.json()); app.use('/analytics', analytics.router);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    url = `http://127.0.0.1:${server.address().port}/analytics`;
  });
  afterEach(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const post = (url, data, headers = {}) => fetch(url, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });

  test('pageview strips private paths, queries, title, event names and identities', async () => {
    const response = await post(`${url}/pageview`, { path: '/history/private?token=secret',
      referrer: 'https://search.example/a?q=private#secret', title: 'private', userId,
      name: 'first_conversation_completed' }, { origin: 'https://guajiguaji.top' });
    expect(response.status).toBe(204);
    const body = JSON.parse(send.mock.calls[0][1].body);
    expect(body.payload).toEqual({ website: env.UMAMI_WEBSITE_ID, hostname: 'guajiguaji.top',
      url: '/other', referrer: 'https://search.example', language: '' });
    expect(send.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  test('DNT, GPC and foreign origins cannot collect', async () => {
    for (const headers of [{ DNT: '1' }, { 'Sec-GPC': '1' }, { origin: 'https://evil.example' }]) {
      await post(`${url}/pageview`, { path: '/' }, headers);
    }
    expect(send).not.toHaveBeenCalled();
  });
  test('ordinary users and forged network headers cannot read or write milestones', async () => {
    expect((await fetch(`${url}/report`)).status).toBe(401);
    expect((await fetch(`${url}/report`, { headers: { 'x-test-user': 'ordinary' } })).status).toBe(403);
    expect((await post(`${url}/internal/milestone`, {}, { 'x-internal-service': 'true', 'x-forwarded-for': '172.1.1.1' })).status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });
  test('admin report shows cohort rate, immature rate null, validates windows', async () => {
    const headers = { 'x-test-user': userId };
    const response = await fetch(`${url}/report`, { headers });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ conversion: 0.5, conversion7d: null });
    expect((await fetch(`${url}/report?from=bad`, { headers })).status).toBe(400);
  });
  test('browser cannot claim a paired turn even using the end endpoint', async () => {
    const client = { query: jest.fn(async () => ({ rows: [{ id: userId }] })), release: jest.fn() };
    db.pool.connect.mockResolvedValue(client);
    expect((await post(`${url}/end`, { sessionId: 'session-1', event: 'paired' }, { 'x-test-user': userId })).status).toBe(403);
    const issued = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac('sha256', env.ANALYTICS_WRITE_TOKEN).update(`${userId}:session-1:${issued}`).digest('hex');
    expect((await post(`${url}/end`, { sessionId: 'session-1', endProof: `${issued}.${signature}`, userId: 'victim', event: 'paired' }, { 'x-test-user': userId })).status).toBe(204);
    expect(client.query.mock.calls[2][1]).toEqual([userId, 'session-1', 'ended', expect.any(String)]);
    expect(client.query.mock.calls[3][0]).toContain('paired_at IS NOT NULL');
  });
  test('upstream bot rejection or failure is not reported as accepted', async () => {
    send.mockResolvedValue({ ok: true, json: async () => ({}) });
    expect((await post(`${url}/pageview`, { path: '/' }, { origin: 'https://guajiguaji.top' })).status).toBe(503);
  });
  test('outbox retries without changing delivered state or exposing user identity', async () => {
    const client = { query: jest.fn(async sql => ({ rows: sql.startsWith('SELECT user_id') ?
      [{ user_id: userId, event_name: 'registration_completed', occurred_at: new Date() }] : [] })), release: jest.fn() };
    db.pool.connect.mockResolvedValue(client);
    send.mockRejectedValue(new Error('timeout'));
    await analytics.flush();
    expect(client.query.mock.calls.some(([sql]) => sql.includes("interval '5 minutes'"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('SET delivered_at'))).toBe(false);
    expect(send.mock.calls[0][1].body).not.toContain(userId);
    expect(client.release).toHaveBeenCalled();
  });
  test('sanitizers reject executable URLs and arbitrary route labels', () => {
    expect(safePath('/conversation?scenario=private')).toBe('/conversation');
    expect(safeReferrer('javascript:alert(1)')).toBe('');
  });
});

describe('report uses real access-token authentication', () => {
  test('cookie and Bearer admin access; missing, expired and non-admin denied', async () => {
    const cookieParser = require('cookie-parser');
    const jwt = require('jsonwebtoken');
    // The existing auth module starts an hourly blacklist sweeper on import.
    // This test exercises authentication, not the production background timer.
    const intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => ({ unref() {} }));
    const { protect, generateAccessToken } = require('../middleware/enhancedAuthMiddleware');
    intervalSpy.mockRestore();
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-only-jwt-key-product-analytics';
    const db = { query: jest.fn(async () => ({ rows: [{ registered: 0, completed: 0, mature_7d: 0 }] })) };
    const analytics = createProductAnalytics({ db, protect, env });
    const app = express(); app.use(cookieParser()); app.use('/analytics', analytics.router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/analytics/report`;
    try {
      const token = generateAccessToken(userId);
      expect((await fetch(url, { headers: { Cookie: `accessToken=${token}` } })).status).toBe(200);
      expect((await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
      expect((await fetch(url)).status).toBe(401);
      const ordinary = generateAccessToken('ordinary-user');
      expect((await fetch(url, { headers: { Authorization: `Bearer ${ordinary}` } })).status).toBe(403);
      const expired = jwt.sign({ id: userId, type: 'access' }, process.env.JWT_SECRET,
        { expiresIn: -1, issuer: 'oral-app', audience: 'oral-app-users' });
      expect((await fetch(url, { headers: { Cookie: `accessToken=${expired}` } })).status).toBe(401);
    } finally {
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
});
