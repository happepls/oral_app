const express = require('express');
const { EventEmitter } = require('node:events');
const { createDailyMonitor, aggregateRows, readMemoryUtilization, PATH } = require('../monitoring/dailyAggregates');

const DAY = 86400;
const end = Date.UTC(2026, 8, 7) / 1000;
const now = end + 900;
const token = 'unit-test-only-monitor-key-32-characters';
function rows() {
  return Array.from({ length: 2880 }, (_, index) => ({
    minute_epoch: String(end - 2 * DAY + index * 60),
    sample_count: '10', five_xx_count: index >= 1440 ? '1' : '0', memory_utilization: 0.5
  })).concat([{ minute_epoch: String(now), sample_count: '0', five_xx_count: '0', memory_utilization: 0.6 }]);
}
function database(data = rows(), backup = now - 3600) {
  return { query: jest.fn(async sql => ({ rows: sql.includes('FROM monitor_backup_success') ? [{ epoch: String(backup) }] : data })) };
}

describe('daily aggregate source windows', () => {
  test('returns previous complete UTC day and independent previous day', () => {
    const result = aggregateRows(rows(), now - 3600, now);
    expect(result.window_start_epoch).toBe(end - DAY);
    expect(result.window_end_epoch).toBe(end);
    expect(result.sample_count).toBe(14400);
    expect(result.five_xx_rate).toBe(0.1);
    expect(result.previous_five_xx_rate).toBe(0);
    expect(result.resource_utilization).toBe(0.5); // excludes today's 0.6
    expect(result.backup_age_hours).toBe(1);
    expect(Object.values(result).every(value => typeof value === 'number' || typeof value === 'boolean')).toBe(true);
  });

  test.each(['empty', 'low-coverage', 'no-requests', 'stale', 'no-memory', 'missing-backup', 'future-backup'])('%s cannot return a healthy aggregate', kind => {
    let data = rows();
    let backup = now - 3600;
    if (kind === 'empty') data = [];
    if (kind === 'low-coverage') data.splice(1440, 100);
    if (kind === 'no-requests') data = data.map(row => ({ ...row, sample_count: '0', five_xx_count: '0' }));
    if (kind === 'stale') data.pop();
    if (kind === 'no-memory') data = data.map(row => ({ ...row, memory_utilization: null }));
    if (kind === 'missing-backup') backup = NaN;
    if (kind === 'future-backup') backup = now + 10;
    expect(aggregateRows(data, backup, now)).toBeNull();
  });

  test('missing baseline is explicit, never fabricates a second window', () => {
    const result = aggregateRows(rows().slice(1440), now - 3600, now);
    expect(result.previous_window_available).toBe(false);
    expect(result.previous_observed_minutes).toBe(0);
  });

  test('cgroup v2 and v1 limits; unlimited or unavailable means no sample', () => {
    expect(readMemoryUtilization(file => file.endsWith('current') ? '25' : '100')).toBe(0.25);
    expect(readMemoryUtilization(file => {
      if (!file.includes('/memory/')) throw new Error('no v2');
      return file.endsWith('usage_in_bytes') ? '75' : '100';
    })).toBe(0.75);
    expect(readMemoryUtilization(() => 'max')).toBeNull();
    expect(readMemoryUtilization(() => { throw new Error('unavailable'); })).toBeNull();
    expect(readMemoryUtilization(file => file.endsWith('current') ? '128' : 'max', 64)).toBe(2);
  });
});

describe('daily read-only HTTP endpoint', () => {
  let server;
  let url;
  async function mount(options = {}) {
    const db = options.db || database();
    const monitor = createDailyMonitor({ db, token, clock: () => now, timeoutMs: 20, ...options });
    const app = express();
    app.use(monitor.middleware);
    app.get(PATH, monitor.handler);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    url = `http://127.0.0.1:${server.address().port}${PATH}`;
    return db;
  }
  afterEach(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

  test('valid dedicated Bearer reads only and caches; cookies/user JWT cannot authorize', async () => {
    const db = await mount();
    for (const headers of [{}, { Cookie: `accessToken=${token}` }, { Authorization: 'Bearer ordinary-user-jwt' }]) {
      expect((await fetch(url, { headers })).status).toBe(401);
    }
    expect(db.query).not.toHaveBeenCalled();
    for (let n = 0; n < 2; n++) {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await response.json()).sample_count).toBe(14400);
    }
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
    expect((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
  });

  test.each(['disabled', 'empty', 'failure', 'timeout'])('%s returns 503 without dependency details', async kind => {
    let db = database([]);
    if (kind === 'failure') db = { query: jest.fn().mockRejectedValue(new Error('private database credentials')) };
    if (kind === 'timeout') db = { query: jest.fn(() => new Promise(() => {})) };
    await mount({ db, ...(kind === 'disabled' ? { token: undefined } : {}) });
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ available: false });
  });
});

test('request counters cross midnight and ignore monitoring/health traffic', async () => {
  const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  let time = end - 5;
  const monitor = createDailyMonitor({ db, token, clock: () => time, memory: () => 0.25 });
  for (const [path, status] of [['/api/users/login', 200], ['/api/stripe/webhook', 500], [PATH, 200], ['/api/health', 200], [`${PATH.toUpperCase()}/`, 503]]) {
    const response = new EventEmitter();
    response.statusCode = status;
    monitor.middleware({ path }, response, () => {});
    response.emit('finish');
  }
  time = end + 5;
  await monitor.flush();
  const writes = db.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT'));
  expect(writes.map(([, args]) => args)).toEqual([[end - 60, 2, 1, null], [end, 0, 0, 0.25]]);
});
