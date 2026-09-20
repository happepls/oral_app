// Isolated local acceptance of the pinned Umami protocol. Creates/removes only
// its own container and disposable DB; never reads a production DATABASE_URL.
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { Pool } = require('pg');
const { createProductAnalytics } = require('../analytics/productAnalytics');

async function main() {
  const password = execFileSync('docker', ['exec', 'oral_app-postgres-1', 'printenv', 'POSTGRES_PASSWORD'], { encoding: 'utf8' }).trim();
  const networks = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .NetworkSettings.Networks}}', 'oral_app-postgres-1'], { encoding: 'utf8' }));
  const network = Object.keys(networks)[0];
  const database = `umami_smoke_${process.pid}`;
  const container = `umami-smoke-${process.pid}`;
  const admin = new Pool({ host: '127.0.0.1', port: 5432, user: 'user', password, database: 'postgres' });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${database}`); created = true;
    execFileSync('docker', ['run', '--rm', '-d', '--name', container, '--network', network,
      '-p', '127.0.0.1:3034:3000', '-e', 'DATABASE_URL', '-e', 'APP_SECRET',
      '-e', 'TWO_FACTOR_ENCRYPTION_KEY', '-e', 'DISABLE_TELEMETRY=1',
      'ghcr.io/umami-software/umami:3.4.0'], {
      env: { ...process.env,
        DATABASE_URL: `postgresql://user:${encodeURIComponent(password)}@oral_app-postgres-1:5432/${database}`,
        APP_SECRET: randomBytes(32).toString('hex'), TWO_FACTOR_ENCRYPTION_KEY: randomBytes(32).toString('hex') },
      stdio: ['ignore', 'ignore', 'pipe'], timeout: 300000,
    });
    const base = 'http://127.0.0.1:3034';
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { ready = (await fetch(`${base}/api/heartbeat`)).ok; } catch { /* starting */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error('Umami readiness timeout');
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'umami' }) });
    if (!login.ok) throw new Error('Umami local login failed');
    const { token } = await login.json();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const website = await fetch(`${base}/api/websites`, { method: 'POST', headers,
      body: JSON.stringify({ name: 'Isolated local acceptance', domain: 'guajiguaji.top' }) });
    if (!website.ok) throw new Error('Umami test website creation failed');
    const { id } = await website.json();
    const analytics = createProductAnalytics({ db: {}, protect: (_, __, next) => next(),
      env: { UMAMI_URL: base, UMAMI_WEBSITE_ID: id, PRODUCT_ANALYTICS_ENABLED: 'true' } });
    await analytics.collect({ url: '/' });
    for (const name of ['registration_completed', 'first_conversation_started', 'first_conversation_completed']) {
      await analytics.collect({ url: '/conversion', name, timestamp: Math.floor(Date.now() / 1000), data: { source: 'server' } });
    }
    const eventsResponse = await fetch(`${base}/api/websites/${id}/events?startAt=${Date.now() - 3600000}&endAt=${Date.now() + 3600000}`, { headers });
    if (!eventsResponse.ok || !JSON.stringify(await eventsResponse.json()).includes('first_conversation_completed')) {
      throw new Error('Umami authenticated event report failed');
    }
    const check = new Pool({ host: '127.0.0.1', port: 5432, user: 'user', password, database });
    try {
      const { rows } = await check.query('SELECT event_name, count(*)::int AS n FROM website_event GROUP BY event_name ORDER BY event_name');
      if (rows.length !== 4 || rows.some(row => row.n !== 1)) throw new Error('Umami persisted events mismatch');
      await check.query("UPDATE website_event SET created_at=now()-interval '91 days' WHERE event_name='registration_completed'");
      execFileSync(process.execPath, [path.join(__dirname, 'prune-product-analytics.js'), '--apply'], {
        env: { ...process.env, UMAMI_DATABASE_URL: `postgresql://user:${encodeURIComponent(password)}@127.0.0.1:5432/${database}`, UMAMI_WEBSITE_ID: id },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      const retained = await check.query('SELECT count(*)::int AS n FROM website_event');
      if (retained.rows[0].n !== 3) throw new Error('Umami 90-day retention failed');
      console.log(JSON.stringify({ status: 'pass', umami: '3.4.0', adminReport: true, retention: true, events: rows }));
    } finally { await check.end(); }
  } finally {
    try { execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' }); } catch { /* may not have started */ }
    if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
    await admin.end();
  }
}
main().catch(error => { console.error(`Local Umami smoke failed: ${error.message.split('\n')[0]}`); process.exitCode = 1; });
