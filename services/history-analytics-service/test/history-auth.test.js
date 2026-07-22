const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { requireHistoryUser, requireInternalService } = require('../src/middleware/historyAuth');
const Conversation = require('../src/models/Conversation');
const controller = require('../src/controllers/historyController');

const secret = 'history-test-secret';
process.env.JWT_SECRET = secret;

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('history middleware accepts access tokens and rejects realtime tickets', () => {
  const access = jwt.sign({ id: 'user-a', type: 'access' }, secret, { algorithm: 'HS256' });
  const request = { get: () => `Bearer ${access}`, headers: {} };
  let called = false;
  requireHistoryUser(request, response(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(request.authUserId, 'user-a');

  const ticket = jwt.sign({ id: 'user-a', type: 'realtime_ticket' }, secret, { algorithm: 'HS256' });
  const denied = response();
  requireHistoryUser({ get: () => `Bearer ${ticket}`, headers: {} }, denied, () => assert.fail('must not call next'));
  assert.equal(denied.statusCode, 401);
});

test('session history lookup always includes authenticated user ownership', async () => {
  const original = Conversation.findOne;
  let query;
  Conversation.findOne = async (value) => { query = value; return null; };
  try {
    const res = response();
    await controller.getSessionHistory({ params: { sessionId: 'session-a' }, authUserId: 'user-a' }, res);
    assert.deepEqual(query, { sessionId: 'session-a', userId: 'user-a' });
    assert.equal(res.statusCode, 404);
  } finally {
    Conversation.findOne = original;
  }
});

test('history writes require the shared internal service secret', () => {
  process.env.INTERNAL_AUTH_SECRET = 'internal-test-secret';
  let called = false;
  requireInternalService({ get: () => 'internal-test-secret' }, response(), () => { called = true; });
  assert.equal(called, true);
  const denied = response();
  requireInternalService({ get: () => 'wrong-secret' }, denied, () => assert.fail('must not call next'));
  assert.equal(denied.statusCode, 401);
});

test('history append rejects a session owned by another user', async () => {
  const original = Conversation.findOne;
  Conversation.findOne = async () => ({ userId: 'other-user', messages: [], save: async () => {} });
  try {
    const res = response();
    await controller.saveSessionMessages({ params: { sessionId: 'session-a' }, body: { userId: 'trusted-user', messages: [{ role: 'user', content: 'hello' }] } }, res);
    assert.equal(res.statusCode, 403);
  } finally {
    Conversation.findOne = original;
  }
});

test('summary update rejects a session owned by another user', async () => {
  const original = Conversation.findOne;
  let saved = false;
  Conversation.findOne = async () => ({ userId: 'other-user', save: async () => { saved = true; } });
  try {
    const res = response();
    await controller.saveSummary({ body: { sessionId: 'session-a', userId: 'trusted-user', summary: 'must not overwrite' } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(saved, false);
  } finally {
    Conversation.findOne = original;
  }
});
