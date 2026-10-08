'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { installMigrationWriteGate } = require('../src/migrationWriteGate');
const { requireInternalService } = require('../src/middleware/historyAuth');

async function server(t, env = {}) {
  const app = express();
  app.use(express.json());
  const gate = installMigrationWriteGate(app, { requireInternalService, env });
  let pending;
  let started;
  const admission = new Promise(resolve => { started = resolve; });
  app.post('/api/history/pending', (req, res) => { pending = res; started(); });
  app.post('/api/history/write', (req, res) => res.json({ saved: true }));
  app.get('/api/history/read', (req, res) => res.json({ messages: [] }));
  app.options('/api/history/read', (req, res) => res.sendStatus(204));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  t.after(() => { listener.closeAllConnections(); return new Promise(resolve => listener.close(resolve)); });
  const url = `http://127.0.0.1:${listener.address().port}`;
  return { url, gate, admission, finish: () => pending.json({ saved: true }), pending: () => pending };
}
const operatorHeaders = { 'X-Guaji-Internal-Auth': 'test-migration-secret', 'Content-Type': 'application/json' };
function setPause(url, paused, headers = operatorHeaders) {
  return fetch(`${url}/internal/migration/write-gate`, { method: 'POST', headers, body: JSON.stringify({ paused }) });
}
function operatorState(url) { return fetch(`${url}/internal/migration/write-gate`, { headers: operatorHeaders }).then(r => r.json()); }

test('gate admits existing write, blocks new writes, and drains once on finish plus close', async t => {
  const original = process.env.INTERNAL_AUTH_SECRET;
  process.env.INTERNAL_AUTH_SECRET = 'test-migration-secret';
  t.after(() => { if (original === undefined) delete process.env.INTERNAL_AUTH_SECRET; else process.env.INTERNAL_AUTH_SECRET = original; });
  const s = await server(t);
  const existing = fetch(`${s.url}/api/history/pending`, { method: 'POST' });
  await s.admission;
  assert.deepEqual(await operatorState(s.url), { paused: false, active_writes: 1, uncertain_writes: 0, drained: false });
  const pauseResponse = await setPause(s.url, true);
  assert.equal(pauseResponse.status, 200);
  assert.deepEqual(await pauseResponse.json(), { paused: true, active_writes: 1, uncertain_writes: 0, drained: false });
  const rejected = await fetch(`${s.url}/api/history/write`, { method: 'POST' });
  assert.equal(rejected.status, 503);
  assert.equal(rejected.headers.get('Retry-After'), '30');
  assert.equal((await rejected.json()).code, 'HISTORY_WRITES_PAUSED');
  assert.equal((await fetch(`${s.url}/api/history/read`)).status, 200);
  assert.equal((await fetch(`${s.url}/api/history/read`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${s.url}/api/history/read`, { method: 'OPTIONS' })).status, 204);
  const response = s.pending();
  s.finish();
  assert.equal((await existing).status, 200);
  response.emit('close'); // finish and socket close cannot double-decrement.
  assert.deepEqual(await operatorState(s.url), { paused: true, active_writes: 0, uncertain_writes: 0, drained: true });
  await setPause(s.url, false);
  assert.equal((await fetch(`${s.url}/api/history/write`, { method: 'POST' })).status, 200);
  assert.equal(s.gate.getState().active_writes, 0);
});

test('missing or bad internal secret cannot inspect or mutate pause; boolean required', async t => {
  const original = process.env.INTERNAL_AUTH_SECRET;
  process.env.INTERNAL_AUTH_SECRET = 'test-migration-secret';
  t.after(() => { if (original === undefined) delete process.env.INTERNAL_AUTH_SECRET; else process.env.INTERNAL_AUTH_SECRET = original; });
  const s = await server(t, { MONGO_WRITES_PAUSED: 'true' });
  assert.equal((await fetch(`${s.url}/internal/migration/write-gate`)).status, 401);
  assert.equal((await setPause(s.url, false, { ...operatorHeaders, 'X-Guaji-Internal-Auth': 'bad' })).status, 401);
  assert.equal((await setPause(s.url, 'false')).status, 400);
  assert.deepEqual(await operatorState(s.url), { paused: true, active_writes: 0, uncertain_writes: 0, drained: true });
  assert.equal((await fetch(`${s.url}/api/history/write`, { method: 'POST' })).status, 503);
});

test('aborted admitted HTTP write cannot prove database drain', async t => {
  const s = await server(t);
  const req = http.request(`${s.url}/api/history/pending`, { method: 'POST' });
  req.on('error', () => {});
  req.end();
  await s.admission;
  assert.equal(s.gate.getState().active_writes, 1);
  const closed = new Promise(resolve => s.pending().once('close', resolve));
  req.destroy();
  await closed;
  assert.deepEqual(s.gate.getState(), { paused: false, active_writes: 0, uncertain_writes: 1, drained: false });
});

test('installer refuses missing authentication middleware', () => {
  assert.throws(() => installMigrationWriteGate(express()), /authentication middleware is required/);
});
