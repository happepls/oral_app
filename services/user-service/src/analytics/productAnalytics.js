const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const { isIP } = require('node:net');

const PATHS = new Set(['/', '/welcome', '/login', '/register', '/quick-experience',
  '/forgot-password', '/reset-password', '/conversation', '/recall', '/discovery',
  '/profile', '/onboarding', '/goal-setting', '/checkin', '/goals', '/subscription',
  '/achievements', '/history']);
const EVENTS = new Set(['started', 'paired', 'ended']);
const SESSION = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Umami deliberately ignores bot user agents. Server events are tagged below
// and must be excluded from browser/device breakdowns in the dashboard.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function safePath(value) {
  const path = typeof value === 'string' ? value.split(/[?#]/)[0] : '';
  return PATHS.has(path) ? path : '/other';
}
function safeReferrer(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : '';
  } catch { return ''; }
}
function matchesToken(header, secret) {
  if (!secret || secret.length < 32 || typeof header !== 'string') return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function validEndProof(proof, userId, sessionId, secret) {
  if (typeof proof !== 'string' || !secret || secret.length < 32) return false;
  const [issued, signature] = proof.split('.');
  if (!/^\d{10}$/.test(issued) || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  const age = Date.now() / 1000 - Number(issued);
  if (age < -60 || age > 90 * 86400) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${userId}:${sessionId}:${issued}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function createProductAnalytics({ db, protect, env = process.env, send = fetch }) {
  const router = express.Router();
  const enabled = () => env.PRODUCT_ANALYTICS_ENABLED === 'true';
  const configured = () => enabled() && UUID.test(env.UMAMI_WEBSITE_ID || '') && !!env.UMAMI_URL;
  const admins = new Set((env.ANALYTICS_ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
  let busy = false;
  let timer;
  const visitorIp = req => env.ANALYTICS_TRUST_PROXY === 'true' && isIP(req.get('cf-connecting-ip') || '')
    ? req.get('cf-connecting-ip') : req.ip;

  async function milestone(userId, sessionId, event, timestamp) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query('SELECT id FROM users WHERE id=$1 FOR KEY SHARE', [userId]);
      if (user.rows.length) {
        // Serialize end/pair races with the session row lock created by UPSERT.
        await client.query(`INSERT INTO product_analytics_sessions(user_id, session_id, paired_at, ended_at)
          VALUES ($1, $2, CASE WHEN $3='paired' THEN $4::timestamptz END, CASE WHEN $3='ended' THEN $4::timestamptz END)
          ON CONFLICT (user_id, session_id) DO UPDATE SET
            paired_at=LEAST(product_analytics_sessions.paired_at, EXCLUDED.paired_at),
            ended_at=GREATEST(product_analytics_sessions.ended_at, EXCLUDED.ended_at), updated_at=now()`,
        [userId, sessionId, event, timestamp]);
        if (event !== 'ended') await client.query(`INSERT INTO product_analytics_events(user_id, event_name, occurred_at)
          VALUES ($1, 'first_conversation_started', $2)
          ON CONFLICT (user_id, event_name) DO UPDATE SET occurred_at=LEAST(product_analytics_events.occurred_at, EXCLUDED.occurred_at)`, [userId, timestamp]);
        await client.query(`INSERT INTO product_analytics_events(user_id, event_name, occurred_at)
          SELECT user_id, 'first_conversation_completed', GREATEST(paired_at, ended_at)
          FROM product_analytics_sessions WHERE user_id=$1 AND session_id=$2 AND paired_at IS NOT NULL AND ended_at >= paired_at
          ON CONFLICT (user_id, event_name) DO UPDATE SET occurred_at=LEAST(product_analytics_events.occurred_at, EXCLUDED.occurred_at)`, [userId, sessionId]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async function collect(payload, headers = {}) {
    const base = new URL(env.UMAMI_URL);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw new Error('analytics config');
    const response = await send(new URL('/api/send', base).href, {
      method: 'POST', timeout: 3000, redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA, ...headers },
      body: JSON.stringify({ type: 'event', payload: {
        website: env.UMAMI_WEBSITE_ID, hostname: 'guajiguaji.top', ...payload,
      } }),
    });
    if (!response.ok) throw new Error('analytics upstream');
    // /api/send can return a success status without storing an event (bot filter).
    const result = await response.json();
    if (!result?.sessionId) throw new Error('analytics event not accepted');
  }

  router.get('/config', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ enabled: configured() });
  });
  router.post('/pageview', rateLimit({ windowMs: 60000, max: 120, keyGenerator: visitorIp }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!configured() || req.get('DNT') === '1' || req.get('Sec-GPC') === '1') return res.sendStatus(204);
    if (!['https://guajiguaji.top', 'https://www.guajiguaji.top', env.ANALYTICS_DEV_ORIGIN].filter(Boolean).includes(req.get('origin'))) return res.sendStatus(403);
    try {
      // No cookies, Authorization, arbitrary properties, title or query strings are forwarded.
      await collect({ url: safePath(req.body.path), referrer: safeReferrer(req.body.referrer),
        language: /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(req.body.language || '') ? req.body.language : '' },
      { 'User-Agent': (req.get('user-agent') || UA).slice(0, 500),
        'X-Forwarded-For': visitorIp(req) });
      return res.sendStatus(204);
    } catch { return res.sendStatus(503); }
  });

  // Dedicated service credential: no network-skip or browser-supplied user identity.
  router.post('/internal/milestone', async (req, res) => {
    if (!matchesToken(req.get('authorization'), env.ANALYTICS_WRITE_TOKEN)) return res.sendStatus(401);
    if (!enabled()) return res.sendStatus(503); // producer retains its durable queue
    const { userId, sessionId, event, occurredAt } = req.body;
    const timestamp = new Date(occurredAt);
    if (!UUID.test(userId || '') || !SESSION.test(sessionId || '') || !EVENTS.has(event) || !Number.isFinite(timestamp.getTime()) || timestamp > new Date(Date.now() + 60000)) return res.sendStatus(400);
    try {
      // Unknown/deleted users are acknowledged so old deliveries cannot resurrect them.
      await milestone(userId, sessionId, event, timestamp.toISOString());
      return res.sendStatus(204);
    } catch { return res.sendStatus(503); }
  });

  router.post('/internal/proof', async (req, res) => {
    if (!matchesToken(req.get('authorization'), env.ANALYTICS_WRITE_TOKEN)) return res.sendStatus(401);
    const { userId, sessionId } = req.body;
    if (!enabled() || !UUID.test(userId || '') || !SESSION.test(sessionId || '')) return res.sendStatus(400);
    try {
      const result = await db.query(`SELECT 1 FROM product_analytics_sessions
        WHERE user_id=$1 AND session_id=$2 AND paired_at IS NOT NULL`, [userId, sessionId]);
      return res.json({ paired: result.rows.length > 0 });
    } catch { return res.sendStatus(503); }
  });

  router.post('/end', protect, rateLimit({ windowMs: 60000, max: 30, keyGenerator: req => String(req.user.id) }), async (req, res) => {
    if (!enabled()) return res.sendStatus(204);
    if (!SESSION.test(req.body.sessionId || '')) return res.sendStatus(400);
    if (!validEndProof(req.body.endProof, req.user.id, req.body.sessionId, env.ANALYTICS_WRITE_TOKEN)) return res.sendStatus(403);
    try {
      await milestone(req.user.id, req.body.sessionId, 'ended', new Date().toISOString());
      return res.sendStatus(204);
    } catch { return res.sendStatus(503); }
  });

  router.get('/report', protect, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!admins.has(String(req.user.id))) return res.sendStatus(403);
    const end = req.query.to ? new Date(req.query.to) : new Date();
    const start = req.query.from ? new Date(req.query.from) : new Date(end.getTime() - 30 * 86400000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || end - start > 90 * 86400000) return res.status(400).json({ error: 'Expected from < to, maximum 90 days' });
    try {
      const result = await db.query(`WITH cohort AS (
        SELECT r.occurred_at AS registered_at, s.occurred_at AS started_at, c.occurred_at AS completed_at
        FROM product_analytics_events r
        LEFT JOIN product_analytics_events s ON s.user_id=r.user_id AND s.event_name='first_conversation_started'
        LEFT JOIN product_analytics_events c ON c.user_id=r.user_id AND c.event_name='first_conversation_completed'
        WHERE r.event_name='registration_completed' AND r.occurred_at >= $1 AND r.occurred_at < $2
      ) SELECT COUNT(*)::int AS registered,
        COUNT(*) FILTER (WHERE started_at IS NOT NULL)::int AS started,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed,
        COUNT(*) FILTER (WHERE registered_at <= now()-interval '7 days')::int AS mature_7d,
        COUNT(*) FILTER (WHERE registered_at <= now()-interval '7 days' AND completed_at <= registered_at+interval '7 days')::int AS completed_7d,
        COUNT(*) FILTER (WHERE registered_at > now()-interval '7 days')::int AS observing
        FROM cohort`, [start.toISOString(), end.toISOString()]);
      const delivery = await db.query(`SELECT COUNT(*)::int AS pending,
        COUNT(*) FILTER (WHERE attempts > 0)::int AS retrying,
        MIN(occurred_at) AS oldest_pending FROM product_analytics_events WHERE delivered_at IS NULL`);
      const counts = result.rows[0];
      return res.json({ from: start.toISOString(), to: end.toISOString(), asOf: new Date().toISOString(),
        ...counts, conversion: counts.registered ? counts.completed / counts.registered : null,
        conversion7d: counts.mature_7d ? counts.completed_7d / counts.mature_7d : null,
        delivery: delivery.rows[0], umami: env.UMAMI_DASHBOARD_URL || null });
    } catch { return res.sendStatus(503); }
  });

  async function flush() {
    if (busy || !configured()) return;
    busy = true;
    let client;
    try {
      client = await db.pool.connect();
      await client.query('BEGIN');
      await client.query("DELETE FROM product_analytics_sessions WHERE updated_at < now()-interval '90 days'");
      const { rows } = await client.query(`SELECT user_id, event_name, occurred_at FROM product_analytics_events
        WHERE delivered_at IS NULL AND next_attempt_at <= now()
        ORDER BY occurred_at LIMIT 10 FOR UPDATE SKIP LOCKED`);
      for (const row of rows) {
        try {
          // Aggregate event only; no business ID or conversation content leaves our database.
          await collect({ url: '/conversion', name: row.event_name,
            timestamp: Math.floor(new Date(row.occurred_at).getTime() / 1000), data: { source: 'server' } });
          await client.query(`UPDATE product_analytics_events SET delivered_at=now(), attempts=attempts+1
            WHERE user_id=$1 AND event_name=$2`, [row.user_id, row.event_name]);
        } catch {
          await client.query(`UPDATE product_analytics_events SET attempts=attempts+1,
            next_attempt_at=now()+interval '5 minutes' WHERE user_id=$1 AND event_name=$2`, [row.user_id, row.event_name]);
        }
      }
      await client.query('COMMIT');
    } catch {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.warn('[product-analytics] delivery unavailable');
    } finally { if (client) client.release(); busy = false; }
  }
  return { router, flush, collect, milestone,
    start() { if (!timer && configured()) { timer = setInterval(flush, 15000); timer.unref(); } },
    stop() { clearInterval(timer); timer = null; },
  };
}
module.exports = { createProductAnalytics, safePath, safeReferrer, matchesToken, validEndProof };
