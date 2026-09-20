// Disposable local integration test. Never connects to DATABASE_URL or production.
// Usage: node src/scripts/test-product-analytics-db.js (local Compose postgres required).
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');
const { createProductAnalytics } = require('../analytics/productAnalytics');

async function main() {
  const password = execFileSync('docker', ['exec', 'oral_app-postgres-1', 'printenv', 'POSTGRES_PASSWORD'], { encoding: 'utf8' }).trim();
  const config = { host: '127.0.0.1', port: 5432, user: 'user', password };
  const admin = new Pool({ ...config, database: 'postgres' });
  const name = `analytics_test_${process.pid}`;
  let pool;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    pool = new Pool({ ...config, database: name });
    const db = { pool, query: (...args) => pool.query(...args) };
    await pool.query('CREATE TABLE users(id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const migration = readFileSync(path.join(__dirname, '../../migrations/20260920_product_analytics.sql'), 'utf8');
    const old = '11111111-2222-4444-8888-111111111111';
    const fresh = '11111111-2222-4444-8888-222222222222';
    await pool.query('INSERT INTO users(id) VALUES($1)', [old]);
    await pool.query(migration);
    await pool.query(migration); // repeatable additive deployment
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_analytics_events')).rows[0].n, 0);
    await pool.query('INSERT INTO users(id) VALUES($1)', [fresh]);
    assert.equal((await pool.query('SELECT event_name FROM product_analytics_events')).rows[0].event_name, 'registration_completed');
    const tx = await pool.connect();
    await tx.query('BEGIN');
    await tx.query("INSERT INTO users(id) VALUES('11111111-2222-4444-8888-333333333333')");
    await tx.query('ROLLBACK'); tx.release();
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_analytics_events')).rows[0].n, 1);
    const analytics = createProductAnalytics({ db, protect: (_, __, next) => next(), env: {} });
    const at = new Date().toISOString();
    await analytics.milestone(fresh, 'session-1', 'ended', at);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM product_analytics_events WHERE event_name='first_conversation_completed'")).rows[0].n, 0);
    await analytics.milestone(fresh, 'empty-session', 'ended', '2026-01-01T00:00:00Z');
    await analytics.milestone(fresh, 'empty-session', 'paired', at);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM product_analytics_events WHERE event_name='first_conversation_completed'")).rows[0].n, 0);
    await analytics.milestone(old, 'session-1', 'paired', at); // different user cannot satisfy end proof
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM product_analytics_events WHERE event_name='first_conversation_completed'")).rows[0].n, 0);
    await Promise.all(Array.from({ length: 6 }, () => analytics.milestone(fresh, 'session-1', 'paired', at)));
    await analytics.milestone(fresh, 'session-1', 'ended', at);
    const events = (await pool.query('SELECT event_name FROM product_analytics_events WHERE user_id=$1', [fresh])).rows;
    assert.deepEqual(events.map(r => r.event_name).sort(), ['first_conversation_completed', 'first_conversation_started', 'registration_completed']);
    await pool.query('DELETE FROM users WHERE id=$1', [fresh]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_analytics_events WHERE user_id=$1', [fresh])).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_analytics_sessions WHERE user_id=$1', [fresh])).rows[0].n, 0);
    await analytics.milestone(fresh, 'session-1', 'paired', at); // late delivery cannot resurrect account
    const mature = '11111111-2222-4444-8888-444444444444';
    await pool.query("INSERT INTO users(id,created_at) VALUES($1,now()-interval '10 days'),($2,now())", [mature, fresh]);
    const convertedAt = new Date(Date.now() - 8 * 86400000).toISOString();
    await analytics.milestone(mature, 'mature', 'paired', convertedAt);
    await analytics.milestone(mature, 'mature', 'ended', convertedAt);
    const report = createProductAnalytics({ db, env: { ANALYTICS_ADMIN_USER_IDS: mature },
      protect: (req, res, next) => { req.user = { id: mature }; next(); } });
    const app = express(); app.use(report.router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      // Explicit future boundary avoids subsecond host/container clock skew.
      const to = encodeURIComponent(new Date(Date.now() + 86400000).toISOString());
      const response = await fetch(`http://127.0.0.1:${server.address().port}/report?to=${to}`);
      const summary = await response.json();
      assert.equal(summary.registered, 2);
      assert.equal(summary.completed, 1);
      assert.equal(summary.observing, 1);
      assert.equal(summary.conversion, 0.5);
      assert.equal(summary.conversion7d, 1);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    console.log('PASS: migration repeatability, no backfill, registration rollback, end/pair race, user isolation, concurrent dedup, deletion');
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.end();
  }
}
main().catch(error => { console.error('Product analytics database integration failed:', error.message); process.exitCode = 1; });
