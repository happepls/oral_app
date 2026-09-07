// Opt in with MONITOR_TEST_DATABASE_URL. Every row lives in a disposable schema;
// no business tables or existing monitoring data are read, changed or deleted.
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createDailyMonitor, PATH } = require('../monitoring/dailyAggregates');

const integration = process.env.MONITOR_TEST_DATABASE_URL ? describe : describe.skip;
integration('daily monitor with real PostgreSQL', () => {
  const schema = `monitor_test_${randomUUID().replaceAll('-', '')}`;
  const connectionString = process.env.MONITOR_TEST_DATABASE_URL;
  const token = 'isolated-test-monitor-token-32-characters';
  const now = Math.floor(Date.now() / 60000) * 60;
  const end = Math.floor(now / 86400) * 86400;
  const migration = fs.readFileSync(path.join(__dirname, '../../migrations/20260907_daily_monitoring.sql'), 'utf8');
  let admin;
  let db;

  beforeAll(async () => {
    admin = new Pool({ connectionString, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    db = new Pool({ connectionString, max: 4, options: `-c search_path=${schema}` });
    await db.query(migration);
    await db.query(migration); // forward migration is idempotent
  });
  afterAll(async () => {
    if (db) await db.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await db.query('DELETE FROM monitor_user_minutes');
    await db.query('DELETE FROM monitor_backup_success');
  });

  test('concurrent service instances add counts, deduplicate minute coverage and take peak', async () => {
    const { EventEmitter } = require('node:events');
    const instances = [0.2, 0.9].map(usage => createDailyMonitor({ db, token, clock: () => now, memory: () => usage }));
    for (const monitor of instances) {
      for (let index = 0; index < 50; index++) {
        const response = new EventEmitter();
        response.statusCode = index < 4 ? 500 : 200;
        monitor.middleware({ path: '/api/users/login' }, response, () => {});
        response.emit('finish');
      }
    }
    await Promise.all(instances.map(monitor => monitor.flush()));
    const result = await db.query('SELECT * FROM monitor_user_minutes');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ sample_count: '100', five_xx_count: '8', memory_utilization: 0.9 });
  });

  test('complete persisted days and backup success produce a read-only HTTP aggregate', async () => {
    await db.query(`INSERT INTO monitor_user_minutes SELECT minute, 10, 0, 0.4
      FROM generate_series($1::bigint, $2::bigint, 60) minute`, [end - 2 * 86400, end - 60]);
    await db.query('INSERT INTO monitor_backup_success VALUES (TRUE, to_timestamp($1))', [now - 3600]);
    const monitor = createDailyMonitor({ db, token, clock: () => now, memory: () => 0.7 });
    await monitor.flush();
    const app = express();
    app.get(PATH, monitor.handler);
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${PATH}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ sample_count: 14400, observed_minutes: 1440,
        previous_window_available: true, five_xx_rate: 0, resource_utilization: 0.4, backup_age_hours: 1 });
      expect((await db.query('SELECT SUM(sample_count)::bigint AS count FROM monitor_user_minutes')).rows[0].count).toBe('28800');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('database rejects invalid counts; monitor cleanup retains recent data', async () => {
    await expect(db.query('INSERT INTO monitor_user_minutes VALUES ($1,1,2,0.5)', [now])).rejects.toMatchObject({ code: '23514' });
    await db.query('INSERT INTO monitor_user_minutes VALUES ($1,1,0,0.5)', [now - 5 * 86400]);
    const monitor = createDailyMonitor({ db, token, clock: () => now, memory: () => 1.2 });
    await monitor.flush();
    const result = await db.query('SELECT * FROM monitor_user_minutes');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].memory_utilization).toBe(1.2);
  });
});
