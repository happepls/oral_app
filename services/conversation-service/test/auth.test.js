const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createRequireUser } = require('../src/auth');

const secret = 'conversation-test-secret';
const middleware = createRequireUser(secret);
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('conversation auth derives identity from access token, not request body', () => {
  const token = jwt.sign({ id: 'trusted-user', type: 'access' }, secret, { algorithm: 'HS256' });
  const req = { body: { userId: 'attacker' }, headers: {}, get: () => `Bearer ${token}` };
  let called = false;
  middleware(req, response(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.authUserId, 'trusted-user');
});

test('conversation auth rejects realtime and missing tokens', () => {
  const ticket = jwt.sign({ id: 'trusted-user', type: 'realtime_ticket' }, secret, { algorithm: 'HS256' });
  for (const authorization of [null, `Bearer ${ticket}`]) {
    const res = response();
    middleware({ headers: {}, get: () => authorization }, res, () => assert.fail('must not call next'));
    assert.equal(res.statusCode, 401);
  }
});

test('conversation auth accepts a short-lived internal conversation token', () => {
  const token = jwt.sign({ id: 'delegated-user', type: 'internal_conversation' }, secret, { algorithm: 'HS256', expiresIn: '30s' });
  const req = { headers: {}, get: () => `Bearer ${token}` };
  middleware(req, response(), () => {});
  assert.equal(req.authUserId, 'delegated-user');
});
