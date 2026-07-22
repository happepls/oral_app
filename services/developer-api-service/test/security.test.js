const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { hash } = require('../src/auth');

const secret = 'delegated-test-secret';
const realtimeSecret = 'realtime-test-secret';
const clientId = '10000000-0000-4000-8000-000000000001';
const grantId = '20000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000001';

function token(scopes = ['profile:read'], overrides = {}) {
  return jwt.sign({ type: 'delegated', user_id: userId, client_id: clientId, grant_id: grantId, scopes, ...overrides }, secret, { issuer: 'guaji-developer-api', audience: 'guaji-partners', expiresIn: '60m' });
}

function fakeDb({ grantActive = true, scopes = ['profile:read'] } = {}) {
  return {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql, params });
      if (sql.includes('FROM developer_api_keys')) return { rows: params[0] === hash('gj_test_key') ? [{ key_id: 'key-1', client_id: clientId, name: 'Test', client_status: 'active' }] : [] };
      if (sql.includes('FROM developer_user_grants')) return { rows: grantActive ? [{ id: grantId, user_id: userId, scopes }] : [] };
      if (sql.includes('FROM users WHERE id')) return { rows: [{ id: params[0], username: 'quality_user' }] };
      return { rows: [] };
    },
  };
}

async function withServer(db, callback, options = {}) {
  const server = createApp({ db, delegatedSecret: secret, realtimeSecret, ...options }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('all v1 calls require a valid API key and return the standard error envelope', async () => {
  await withServer(fakeDb(), async (base) => {
    const response = await fetch(`${base}/v1/profile`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'api_key_missing');
    assert.match(body.meta.request_id, /^[0-9a-f-]{36}$/);
  });
});

test('profile identity is always derived from delegated token', async () => {
  const db = fakeDb();
  await withServer(db, async (base) => {
    const response = await fetch(`${base}/v1/profile?userId=attacker`, { headers: { 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.id, userId);
    const profileQuery = db.calls.find((call) => call.sql.includes('FROM users WHERE id'));
    assert.deepEqual(profileQuery.params, [userId]);
  });
});

test('profile contract preserves onboarding fields and subscription state', async () => {
  let updateParams;
  const db = {
    async query(sql, params = []) {
      if (sql.includes('FROM developer_api_keys')) return { rows: [{ key_id: 'key-1', client_id: clientId, name: 'Test', client_status: 'active' }] };
      if (sql.includes('FROM developer_user_grants')) return { rows: [{ id: grantId, user_id: userId, scopes: ['profile:read', 'profile:write'] }] };
      if (sql.startsWith('SELECT id, username')) return { rows: [{ id: userId, gender: 1, birth_year: 1995, points: 42, subscription_status: 'active' }] };
      if (sql.startsWith('UPDATE users SET')) {
        updateParams = params;
        return { rows: [{ id: userId, gender: 2, birth_year: 1996, points: 43, subscription_status: 'active' }] };
      }
      return { rows: [] };
    },
  };
  const headers = { 'content-type': 'application/json', 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${token(['profile:read', 'profile:write'])}` };
  await withServer(db, async (base) => {
    const read = await fetch(`${base}/v1/profile`, { headers });
    assert.equal((await read.json()).data.subscription_status, 'active');
    const update = await fetch(`${base}/v1/profile`, { method: 'PATCH', headers, body: JSON.stringify({ gender: 2, birth_year: 1996, points: 43 }) });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).data.points, 43);
  });
  assert.deepEqual(updateParams, [2, 1996, 43, userId]);
});

test('goal creation persists current proficiency', async () => {
  let goalInsert;
  const client = {
    async query(sql, params = []) {
      if (sql.includes('INSERT INTO user_goals')) {
        goalInsert = { sql, params };
        return { rows: [{ id: 7, current_proficiency: params[5] }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const db = {
    async query(sql, params = []) {
      if (sql.includes('FROM developer_api_keys')) return { rows: [{ key_id: 'key-1', client_id: clientId, name: 'Test', client_status: 'active' }] };
      if (sql.includes('FROM developer_user_grants')) return { rows: [{ id: grantId, user_id: userId, scopes: ['goals:write'] }] };
      if (sql.includes('INSERT INTO developer_idempotency_keys')) return { rows: [{ idempotency_key: params[3] }] };
      return { rows: [] };
    },
    async connect() { return client; },
  };
  await withServer(db, async (base) => {
    const response = await fetch(`${base}/v1/goals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${token(['goals:write'])}`, 'Idempotency-Key': 'goal-proficiency' },
      body: JSON.stringify({ target_language: 'Japanese', target_level: 'N5', current_proficiency: 37, scenarios: [] }),
    });
    assert.equal(response.status, 201);
  });
  assert.match(goalInsert.sql, /current_proficiency/);
  assert.equal(goalInsert.params[5], 37);
});

test('first-party cookie uses the same v1 contract without weakening partner auth', async () => {
  const firstPartyUser = '00000000-0000-4000-8000-000000000099';
  const firstPartyGrant = '20000000-0000-4000-8000-000000000099';
  const db = {
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql, params });
      if (sql.includes('INSERT INTO developer_user_grants')) return { rows: [{ id: firstPartyGrant }] };
      if (sql.includes('FROM users WHERE id')) return { rows: [{ id: params[0], username: 'first_party' }] };
      return { rows: [] };
    },
  };
  const accessToken = jwt.sign({ id: firstPartyUser, type: 'access' }, realtimeSecret, { algorithm: 'HS256', issuer: 'oral-app', audience: 'oral-app-users', expiresIn: '1h' });
  await withServer(db, async (base) => {
    const response = await fetch(`${base}/v1/profile?userId=attacker`, { headers: { Cookie: `accessToken=${accessToken}` } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.id, firstPartyUser);
  });
  const profileQuery = db.calls.find((call) => call.sql.includes('FROM users WHERE id'));
  assert.deepEqual(profileQuery.params, [firstPartyUser]);
});

test('authorization approval validates redirect URI and stores only a one-time code hash', async () => {
  const firstPartyUser = '00000000-0000-4000-8000-000000000099';
  const partnerId = '10000000-0000-4000-8000-000000000099';
  const accessToken = jwt.sign({ id: firstPartyUser, type: 'access' }, realtimeSecret, { algorithm: 'HS256', issuer: 'oral-app', audience: 'oral-app-users', expiresIn: '1h' });
  let grantParams;
  const db = {
    async query(sql, params = []) {
      if (sql.includes('INSERT INTO developer_user_grants') && sql.includes('DO UPDATE SET scopes = EXCLUDED.scopes, status')) return { rows: [{ id: '20000000-0000-4000-8000-000000000099' }] };
      if (sql.includes('SELECT id, name, redirect_uris')) return { rows: [{ id: partnerId, name: 'Quality Partner', redirect_uris: ['https://partner.example/callback'] }] };
      if (sql.includes('INSERT INTO developer_idempotency_keys')) return { rows: [{ idempotency_key: params[3] }] };
      if (sql.includes('authorization_code_expires_at')) { grantParams = params; return { rows: [] }; }
      return { rows: [] };
    },
  };
  await withServer(db, async (base) => {
    const headers = { Cookie: `accessToken=${accessToken}` };
    const query = new URLSearchParams({ client_id: partnerId, redirect_uri: 'https://partner.example/callback', scope: 'profile:read goals:read', state: 'csrf-state' });
    const preview = await fetch(`${base}/v1/oauth/authorize?${query}`, { headers });
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).data.client.name, 'Quality Partner');

    const approval = await fetch(`${base}/v1/oauth/authorize`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'Idempotency-Key': 'approve-once' },
      body: JSON.stringify({ client_id: partnerId, redirect_uri: 'https://partner.example/callback', scope: ['profile:read', 'goals:read'], state: 'csrf-state', approved: true }),
    });
    assert.equal(approval.status, 200);
    const redirect = new URL((await approval.json()).data.redirect_url);
    assert.match(redirect.searchParams.get('code'), /^code_/);
    assert.equal(redirect.searchParams.get('state'), 'csrf-state');
    assert.equal(grantParams[0], partnerId);
    assert.equal(grantParams[1], firstPartyUser);
    assert.equal(grantParams[3], hash(redirect.searchParams.get('code')));

    const invalid = await fetch(`${base}/v1/oauth/authorize?client_id=${partnerId}&redirect_uri=${encodeURIComponent('https://evil.example/callback')}&scope=profile:read`, { headers });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'redirect_uri_invalid');
  });
});

test('authorization code exchange succeeds once and rejects replay', async () => {
  let exchanged = false;
  const db = {
    async query(sql, params = []) {
      if (sql.includes('FROM developer_api_keys')) return { rows: [{ key_id: 'key-1', client_id: clientId, name: 'Test', client_status: 'active' }] };
      if (sql.includes('UPDATE developer_user_grants SET authorization_code_hash')) {
        if (exchanged || params[1] !== hash('code_once')) return { rows: [] };
        exchanged = true;
        return { rows: [{ id: grantId, client_id: clientId, user_id: userId, scopes: ['profile:read'] }] };
      }
      return { rows: [] };
    },
  };
  await withServer(db, async (base) => {
    const options = { method: 'POST', headers: { 'content-type': 'application/json', 'X-Guaji-API-Key': 'gj_test_key' }, body: JSON.stringify({ code: 'code_once' }) };
    const first = await fetch(`${base}/v1/oauth/token`, options);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).data.expires_in, 3600);
    const replay = await fetch(`${base}/v1/oauth/token`, options);
    assert.equal(replay.status, 400);
    assert.equal((await replay.json()).error.code, 'authorization_code_invalid');
  });
});

test('revoked grants and missing scopes are rejected', async () => {
  await withServer(fakeDb({ grantActive: false }), async (base) => {
    const response = await fetch(`${base}/v1/profile`, { headers: { 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'grant_revoked');
  });
  await withServer(fakeDb({ scopes: [] }), async (base) => {
    const response = await fetch(`${base}/v1/profile`, { headers: { 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${token([])}` } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'insufficient_scope');
  });
});

test('expired delegated tokens are rejected with the standard envelope', async () => {
  const expired = jwt.sign(
    { type: 'delegated', user_id: userId, client_id: clientId, grant_id: grantId, scopes: ['profile:read'] },
    secret,
    { issuer: 'guaji-developer-api', audience: 'guaji-partners', expiresIn: -1 }
  );
  await withServer(fakeDb(), async (base) => {
    const response = await fetch(`${base}/v1/profile`, { headers: { 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${expired}` } });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'delegated_token_expired');
    assert.match(body.meta.request_id, /^[0-9a-f-]{36}$/);
  });
});

test('rate limits are enforced per developer client', async () => {
  await withServer(fakeDb(), async (base) => {
    const headers = { 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${token()}` };
    const first = await fetch(`${base}/v1/profile`, { headers });
    const second = await fetch(`${base}/v1/profile`, { headers });
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(second.headers.get('x-ratelimit-limit'), '1');
    assert.equal((await second.json()).error.code, 'rate_limit_exceeded');
  }, { rateLimitMax: 1 });
});

test('upstream timeouts and unavailable dependencies use stable error codes', async () => {
  const http = require('node:http');
  const slow = http.createServer(() => {});
  slow.listen(0, '127.0.0.1');
  await new Promise((resolve) => slow.once('listening', resolve));
  const makeDb = () => ({
    async query(sql, params = []) {
      if (sql.includes('FROM developer_api_keys')) return { rows: [{ key_id: 'key-1', client_id: clientId, name: 'Test', client_status: 'active' }] };
      if (sql.includes('FROM developer_user_grants')) return { rows: [{ id: grantId, user_id: userId, scopes: ['ai:generate'] }] };
      if (sql.includes('INSERT INTO developer_idempotency_keys')) return { rows: [{ idempotency_key: params[3] }] };
      return { rows: [] };
    },
  });
  const headers = { 'content-type': 'application/json', 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${token(['ai:generate'])}`, 'Idempotency-Key': 'failure-test' };
  try {
    await withServer(makeDb(), async (base) => {
      const response = await fetch(`${base}/v1/ai/scenarios`, { method: 'POST', headers, body: '{}' });
      assert.equal(response.status, 504);
      assert.equal((await response.json()).error.code, 'upstream_timeout');
    }, { aiUrl: `http://127.0.0.1:${slow.address().port}`, upstreamTimeoutMs: 25 });
    await withServer(makeDb(), async (base) => {
      const response = await fetch(`${base}/v1/ai/scenarios`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'unavailable-test' }, body: '{}' });
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, 'upstream_unavailable');
    }, { aiUrl: 'http://127.0.0.1:1', upstreamTimeoutMs: 100 });
  } finally {
    await new Promise((resolve) => slow.close(resolve));
  }
});

test('idempotency keys are isolated by grant, user, method, and path', async () => {
  const reservations = new Set();
  const inserts = [];
  const db = {
    async query(sql, params = []) {
      if (sql.includes('FROM developer_api_keys')) return { rows: [{ key_id: 'key-1', client_id: clientId, name: 'Test', client_status: 'active' }] };
      if (sql.includes('FROM developer_user_grants')) return { rows: [{ id: params[0], user_id: params[2], scopes: ['realtime:connect'] }] };
      if (sql.includes('INSERT INTO developer_idempotency_keys')) {
        const reservation = params.slice(0, 6).join(':');
        if (reservations.has(reservation)) return { rows: [] };
        reservations.add(reservation);
        inserts.push(params);
        return { rows: [{ idempotency_key: params[3] }] };
      }
      return { rows: [] };
    },
  };
  const secondUser = '00000000-0000-4000-8000-000000000002';
  const secondGrant = '20000000-0000-4000-8000-000000000002';
  const secondToken = jwt.sign({ type: 'delegated', user_id: secondUser, client_id: clientId, grant_id: secondGrant, scopes: ['realtime:connect'] }, secret, { issuer: 'guaji-developer-api', audience: 'guaji-partners', expiresIn: '60m' });
  await withServer(db, async (base) => {
    const headers = { 'X-Guaji-API-Key': 'gj_test_key', 'Idempotency-Key': 'same-partner-key' };
    const first = await fetch(`${base}/v1/realtime/tickets`, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${token(['realtime:connect'])}` } });
    const second = await fetch(`${base}/v1/realtime/tickets`, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${secondToken}` } });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
  });
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts.map((params) => params.slice(1, 6)), [
    [grantId, userId, 'same-partner-key', 'POST', '/v1/realtime/tickets'],
    [secondGrant, secondUser, 'same-partner-key', 'POST', '/v1/realtime/tickets'],
  ]);
});

test('TTS idempotency caches and replays the binary response', async () => {
  const http = require('node:http');
  let aiCalls = 0;
  const ai = http.createServer((_req, res) => {
    aiCalls += 1;
    res.writeHead(200, { 'content-type': 'audio/wav' });
    res.end(Buffer.from('RIFF-test-audio'));
  });
  ai.listen(0, '127.0.0.1');
  await new Promise((resolve) => ai.once('listening', resolve));
  let reserved = false;
  let cached;
  const db = {
    async query(sql, params = []) {
      if (sql.includes('FROM developer_api_keys')) return { rows: [{ key_id: 'key-1', client_id: clientId, name: 'Test', client_status: 'active' }] };
      if (sql.includes('FROM developer_user_grants')) return { rows: [{ id: grantId, user_id: userId, scopes: ['ai:generate'] }] };
      if (sql.includes('INSERT INTO developer_idempotency_keys')) {
        if (reserved) return { rows: [] };
        reserved = true;
        return { rows: [{ idempotency_key: params[3] }] };
      }
      if (sql.includes('SET status_code = $1, response_body_binary')) {
        cached = { request_hash: hash(JSON.stringify({ method: 'POST', path: '/v1/ai/tts', body: { text: 'hello' } })), status_code: params[0], response_body_binary: params[1], response_content_type: params[2] };
        return { rows: [] };
      }
      if (sql.includes('SELECT request_hash, status_code')) return { rows: cached ? [cached] : [] };
      return { rows: [] };
    },
  };
  try {
    await withServer(db, async (base) => {
      const headers = { 'content-type': 'application/json', 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${token(['ai:generate'])}`, 'Idempotency-Key': 'tts-once' };
      const first = await fetch(`${base}/v1/ai/tts`, { method: 'POST', headers, body: JSON.stringify({ text: 'hello' }) });
      const second = await fetch(`${base}/v1/ai/tts`, { method: 'POST', headers, body: JSON.stringify({ text: 'hello' }) });
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.deepEqual(Buffer.from(await first.arrayBuffer()), Buffer.from(await second.arrayBuffer()));
    }, { aiUrl: `http://127.0.0.1:${ai.address().port}` });
    assert.equal(aiCalls, 1);
  } finally {
    await new Promise((resolve) => ai.close(resolve));
  }
});

test('conversation creation uses a scoped internal token and never forwards userId', async () => {
  const http = require('node:http');
  let forwarded;
  const conversation = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      forwarded = { authorization: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { sessionId: 'session-1' } }));
    });
  });
  conversation.listen(0, '127.0.0.1');
  await new Promise((resolve) => conversation.once('listening', resolve));
  const db = {
    async query(sql, params = []) {
      if (sql.includes('FROM developer_api_keys')) return { rows: [{ key_id: 'key-1', client_id: clientId, name: 'Test', client_status: 'active' }] };
      if (sql.includes('FROM developer_user_grants')) return { rows: [{ id: grantId, user_id: userId, scopes: ['conversations:write'] }] };
      if (sql.includes('INSERT INTO developer_idempotency_keys')) return { rows: [{ idempotency_key: params[3] }] };
      return { rows: [] };
    },
  };
  try {
    await withServer(db, async (base) => {
      const response = await fetch(`${base}/v1/conversations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${token(['conversations:write'])}`, 'Idempotency-Key': 'new-session' },
        body: JSON.stringify({ goal_id: 42, force_new: true, userId: 'attacker' }),
      });
      assert.equal(response.status, 201);
    }, { conversationUrl: `http://127.0.0.1:${conversation.address().port}` });
    const claims = jwt.verify(forwarded.authorization.slice(7), realtimeSecret, { algorithms: ['HS256'] });
    assert.equal(claims.type, 'internal_conversation');
    assert.equal(claims.id, userId);
    assert.deepEqual(forwarded.body, { goalId: 42, forceNew: true });
  } finally {
    await new Promise((resolve) => conversation.close(resolve));
  }
});

test('conversation cursor pagination continues beyond the first 100 upstream rows', async () => {
  const http = require('node:http');
  const allItems = Array.from({ length: 101 }, (_, index) => ({
    sessionId: `session-${String(index).padStart(3, '0')}`,
    userId,
    startTime: new Date(Date.UTC(2026, 0, 1) - index * 1000).toISOString(),
  }));
  const requestedPages = [];
  const history = http.createServer((req, res) => {
    const page = Number(new URL(req.url, 'http://localhost').searchParams.get('page'));
    requestedPages.push(page);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: allItems.slice((page - 1) * 100, page * 100), totalPages: 2, currentPage: page }));
  });
  history.listen(0, '127.0.0.1');
  await new Promise((resolve) => history.once('listening', resolve));
  const db = {
    async query(sql) {
      if (sql.includes('FROM developer_api_keys')) return { rows: [{ key_id: 'key-1', client_id: clientId, name: 'Test', client_status: 'active' }] };
      if (sql.includes('FROM developer_user_grants')) return { rows: [{ id: grantId, user_id: userId, scopes: ['conversations:read'] }] };
      return { rows: [] };
    },
  };
  try {
    await withServer(db, async (base) => {
      const headers = { 'X-Guaji-API-Key': 'gj_test_key', Authorization: `Bearer ${token(['conversations:read'])}` };
      const first = await fetch(`${base}/v1/conversations?limit=100`, { headers });
      const firstBody = await first.json();
      assert.equal(firstBody.data.length, 100);
      assert.ok(firstBody.meta.next_cursor);

      const second = await fetch(`${base}/v1/conversations?limit=100&cursor=${encodeURIComponent(firstBody.meta.next_cursor)}`, { headers });
      const secondBody = await second.json();
      assert.deepEqual(secondBody.data.map((item) => item.sessionId), ['session-100']);
    }, { historyUrl: `http://127.0.0.1:${history.address().port}` });
    assert.ok(requestedPages.filter((page) => page === 2).length >= 2);
  } finally {
    await new Promise((resolve) => history.close(resolve));
  }
});
