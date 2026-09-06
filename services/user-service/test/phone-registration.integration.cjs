// Run only against disposable loopback Redis/Postgres containers, never .env.
// Actual Redis Lua, Postgres constraints and HTTP cookies; supplier calls mocked.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '16389';
delete process.env.REDIS_PASSWORD;
process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:15439/postgres';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
for (const key of ['ACCESS_KEY_ID', 'ACCESS_KEY_SECRET', 'SIGN_NAME', 'TEMPLATE_CODE']) {
  process.env[`ALIYUN_SMS_${key}`] = crypto.randomBytes(16).toString('hex');
}
const redis = require('../src/utils/redisClient');
const db = require('../src/models/db');
const User = require('../src/models/user');
const controller = require('../src/controllers/userController');
const { reservePhoneAttempt, phoneKey } = require('../src/utils/phoneAuth');
const aliyun = require('../src/utils/aliyunSms');
const express = require('express');
const cookieParser = require('cookie-parser');
// Unref the middleware housekeeping interval so it cannot keep this test alive.
const originalInterval = global.setInterval;
global.setInterval = (...args) => originalInterval(...args).unref();
const { protect } = require('../src/middleware/enhancedAuthMiddleware');
global.setInterval = originalInterval;

const originalFetch = global.fetch;
const codes = new Map();
global.fetch = async (url, options) => {
  if (String(url).startsWith('https://dysmsapi.aliyuncs.com/')) {
    const params = new URL(url).searchParams;
    codes.set(`+86${params.get('PhoneNumbers')}`, JSON.parse(params.get('TemplateParam')).code);
    return { ok: true, json: async () => ({ Code: 'OK' }) };
  }
  if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, options);
  throw new Error('External network denied by integration test');
};

async function main() {
  await db.query('CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username VARCHAR(50) UNIQUE NOT NULL, phone VARCHAR(32) UNIQUE, email TEXT, native_language TEXT)');
  await db.query('CREATE TABLE user_identities (user_id UUID, provider TEXT, provider_uid TEXT)');
  const app = express(); app.use(express.json()); app.use(cookieParser());
  app.post('/api/users/phone/send-code', controller.sendPhoneCode);
  app.post('/api/users/phone/login', controller.phoneLogin);
  app.get('/api/users/profile', protect, (req, res) => res.json({ id: req.user.id }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const phone = '+8613800138000';
  const post = (path, body) => fetch(`${base}/api/users/phone/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('send-code', { phone })).status, 200);
    const code = codes.get(phone); assert.match(code, /^\d{6}$/);
    assert.equal((await post('send-code', { phone })).status, 429);
    assert.equal((await post('login', { phone, code: code === '000000' ? '000001' : '000000' })).status, 401);
    const session = await post('login', { phone, code }); assert.equal(session.status, 200);
    const payload = await session.json(); assert.ok(payload.data.user.id);
    const cookie = session.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/i);
    const profile = await fetch(`${base}/api/users/profile`, { headers: { Cookie: cookie.split(';')[0] } });
    assert.equal(profile.status, 200); assert.equal((await profile.json()).id, payload.data.user.id);
    assert.equal((await fetch(`${base}/api/users/profile`, { headers: { Authorization: `Bearer ${payload.data.token}` } })).status, 200);
    assert.equal((await fetch(`${base}/api/users/profile`)).status, 401);
    assert.equal((await post('login', { phone, code })).status, 401);
    console.log('PASS HTTP send → verify → create account → cookie/Bearer profile → reject replay');

    const racePhone = '+8613900139000';
    const sendResults = await Promise.all(Array.from({ length: 12 }, () => reservePhoneAttempt(racePhone, 'send')));
    assert.equal(sendResults.filter(result => result === 0).length, 1);
    const attempts = await Promise.all(Array.from({ length: 12 }, () => reservePhoneAttempt(racePhone, 'verify')));
    assert.equal(attempts.filter(result => result === 0).length, 5);
    console.log('PASS concurrent Redis send cooldown and five verification attempts');

    await aliyun.sendCode(racePhone);
    const consumeResults = await Promise.all(Array.from({ length: 12 }, () => aliyun.checkCode(racePhone, codes.get(racePhone))));
    assert.equal(consumeResults.filter(result => result.ok).length, 1);
    const accounts = await Promise.all(Array.from({ length: 12 }, () => User.findOrCreateByPhone(racePhone)));
    assert.equal(new Set(accounts.map(account => account.id)).size, 1);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users WHERE phone=$1', [racePhone])).rows[0].count, 1);
    console.log('PASS one-time Lua consume and concurrent unique Postgres account creation');

    const limitPhone = '+8613700137000';
    const cooldownKey = `phone_auth:{${phoneKey(limitPhone)}}:send:cooldown`;
    for (let i = 0; i < 5; i++) {
      assert.equal(await reservePhoneAttempt(limitPhone, 'send'), 0);
      await redis.del(cooldownKey); // Advance only this isolated test's cooldown.
    }
    assert.ok(await reservePhoneAttempt(limitPhone, 'send') > 0);
    console.log('PASS five sends per hour even across resend cooldowns');

    await aliyun.sendCode(limitPhone);
    const key = `sms_code:v2:${phoneKey(limitPhone)}`;
    await redis.pexpire(key, 1);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await aliyun.checkCode(limitPhone, codes.get(limitPhone))).ok, false);
    // A second valid login for the original number must resolve the same user.
    await redis.del(`phone_auth:{${phoneKey(phone)}}:send:cooldown`);
    assert.equal((await post('send-code', { phone })).status, 200);
    const again = await post('login', { phone, code: codes.get(phone) });
    assert.equal(again.status, 200);
    assert.equal((await again.json()).data.user.id, payload.data.user.id);
    console.log('PASS expired code rejection and existing-account login');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  global.fetch = originalFetch;
  await db.pool.end(); redis.disconnect();
});
