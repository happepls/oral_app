const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');

const clientId = '10000000-0000-4000-8000-000000000001';
const grantId = '20000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000001';
const secret = 'scenario-test-signing';
const internalSecret = 'scenario-test-internal';
const result = { scenario: { title: '药店', tasks: ['说明症状', '询问用药', '确认价格'] } };

function headers(scopes = ['ai:generate']) {
  const access = jwt.sign({ type: 'delegated', client_id: clientId, grant_id: grantId, user_id: userId, scopes }, secret,
    { issuer: 'guaji-developer-api', audience: 'guaji-partners', expiresIn: '60m' });
  return { 'content-type': 'application/json', 'X-Guaji-API-Key': 'test-api-key', Authorization: `Bearer ${access}`, 'Idempotency-Key': 'single-test' };
}

function db(scopes = ['ai:generate', 'profile:read']) {
  const reservations = new Map();
  return { async query(sql, params = []) {
    if (sql.includes('FROM developer_api_keys')) return { rows: [{ key_id: 'key', client_id: clientId, client_status: 'active' }] };
    if (sql.includes('FROM developer_user_grants')) return { rows: [{ id: grantId, user_id: userId, scopes }] };
    if (sql.includes('INSERT INTO developer_idempotency_keys')) {
      if (reservations.has(params[3])) return { rows: [] };
      reservations.set(params[3], { request_hash: params[6] });
      return { rows: [{ idempotency_key: params[3] }] };
    }
    if (sql.includes('SELECT request_hash')) return { rows: [reservations.get(params[5])] };
    if (sql.includes('UPDATE developer_idempotency_keys')) Object.assign(reservations.get(params[7]), { status_code: params[0], response_body: params[1] });
    if (sql.includes('DELETE FROM developer_idempotency_keys')) reservations.delete(params[5]);
    return { rows: [] };
  } };
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(callback, options = {}, upstreamHandler) {
  const calls = [];
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      calls.push({ path: req.url, headers: req.headers, body: JSON.parse(body) });
      if (upstreamHandler) return upstreamHandler(req, res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
  });
  const aiUrl = await listen(upstream);
  const server = http.createServer(createApp({ db: db(options.grantScopes), delegatedSecret: secret, realtimeSecret: secret,
    internalAuthSecret: internalSecret, aiUrl, ...options }));
  const base = await listen(server);
  try { await callback(`${base}/v1/ai/scenario`, calls); }
  finally { await Promise.all([server, upstream].map((item) => new Promise((resolve) => item.close(resolve)))); }
}

test('single scenario forwards authorized data/internal header and replays idempotent response', async () => {
  await fixture(async (url, calls) => {
    const payload = { native_language: 'Chinese', target_level: 'A1', exclude_titles: ['点餐'] };
    const options = { method: 'POST', headers: { ...headers(), 'X-Guaji-Internal-Auth': 'untrusted' }, body: JSON.stringify(payload) };
    const first = await fetch(url, options);
    const replay = await fetch(url, options);
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.deepEqual((await first.json()).data, result);
    assert.deepEqual((await replay.json()).data, result);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, '/generate-scenario');
    assert.equal(calls[0].headers['x-guaji-internal-auth'], internalSecret);
    assert.deepEqual(calls[0].body, payload);
  });
});

test('single scenario requires authentication, scope and idempotency', async () => {
  await fixture(async (url, calls) => {
    assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    const missingKey = headers();
    delete missingKey['Idempotency-Key'];
    assert.equal((await fetch(url, { method: 'POST', headers: missingKey, body: '{}' })).status, 400);
    assert.equal(calls.length, 0);
  });
  await fixture(async (url, calls) => {
    assert.equal((await fetch(url, { method: 'POST', headers: headers(['profile:read']), body: '{}' })).status, 403);
    assert.equal(calls.length, 0);
  }, { grantScopes: ['profile:read'] });
});

test('single scenario shares rate limiting and fails closed without internal secret', async () => {
  await fixture(async (url, calls) => {
    assert.equal((await fetch(url, { method: 'POST', headers: headers(), body: '{}' })).status, 200);
    assert.equal((await fetch(url, { method: 'POST', headers: headers(), body: '{}' })).status, 429);
    assert.equal(calls.length, 1);
  }, { rateLimitMax: 1 });
  await fixture(async (url, calls) => {
    assert.equal((await fetch(url, { method: 'POST', headers: headers(), body: '{}' })).status, 503);
    assert.equal(calls.length, 0);
  }, { internalAuthSecret: undefined });
});

test('single scenario model failure is retryable and does not cache a failed result', async () => {
  await fixture(async (url, calls) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(url, { method: 'POST', headers: headers(), body: '{}' });
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, 'upstream_error');
    }
    assert.equal(calls.length, 2);
  }, {}, (_req, res) => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"detail":"场景生成失败，请重试"}'); });
});
