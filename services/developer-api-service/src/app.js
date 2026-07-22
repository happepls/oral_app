const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');
const { createAuth, hash, error } = require('./auth');
const OAUTH_SCOPES = new Set(['profile:read', 'profile:write', 'goals:read', 'goals:write', 'conversations:read', 'conversations:write', 'ai:generate', 'realtime:connect']);

const PROFILE_FIELDS = new Set(['nickname', 'avatar_url', 'native_language', 'target_language', 'interests', 'daily_practice_goal', 'gender', 'birth_year', 'points']);
const encodeCursor = (row) => Buffer.from(JSON.stringify([row.created_at, row.id])).toString('base64url');
const decodeCursor = (value) => {
  if (!value) return null;
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { throw error(400, 'cursor_invalid', 'Cursor is invalid'); }
};

function createApp(options) {
  const { db, delegatedSecret, realtimeSecret, conversationUrl = 'http://conversation-service:8083', historyUrl = 'http://history-analytics-service:3004', aiUrl = 'http://ai-omni-service:8082', rateLimitMax = 120, upstreamTimeoutMs = 10000 } = options;
  const aiTimeoutMs = options.aiTimeoutMs ?? (options.upstreamTimeoutMs === undefined ? 35000 : upstreamTimeoutMs);
  const app = express();
  const auth = createAuth({ db, delegatedSecret, realtimeSecret });
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => { const supplied = req.get('X-Request-ID'); req.requestId = supplied && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(supplied) ? supplied : crypto.randomUUID(); res.set('X-Request-ID', req.requestId); next(); });

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'developer-api-service' }));
  app.use('/v1', (req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => db.query(
      `INSERT INTO developer_audit_events (client_id, grant_id, user_id, request_id, method, path, status_code, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        req.developerClient?.client_id || null,
        req.delegated?.grant_id || null,
        req.delegated?.user_id || null,
        req.requestId,
        req.method,
        req.path,
        res.statusCode,
        Date.now() - startedAt,
      ]
    ).catch(() => {}));
    next();
  });
  app.use('/v1', auth.client);
  const buckets = new Map();
  app.use('/v1', (req, res, next) => {
    const now = Date.now();
    const key = `${req.developerClient.client_id}:${req.delegated?.user_id || 'partner'}`;
    const bucket = buckets.get(key) || { resetAt: now + 60_000, count: 0 };
    if (now >= bucket.resetAt) Object.assign(bucket, { resetAt: now + 60_000, count: 0 });
    bucket.count += 1;
    buckets.set(key, bucket);
    res.set('X-RateLimit-Limit', String(rateLimitMax));
    res.set('X-RateLimit-Remaining', String(Math.max(0, rateLimitMax - bucket.count)));
    if (bucket.count > rateLimitMax) return next(error(429, 'rate_limit_exceeded', 'Rate limit exceeded'));
    next();
  });

  app.post('/v1/oauth/token', async (req, res, next) => {
    try {
      if (!req.body?.code) throw error(400, 'authorization_code_missing', 'Authorization code is required');
      const { rows } = await db.query(
        `UPDATE developer_user_grants SET authorization_code_hash = NULL, authorization_code_expires_at = NULL, code_exchanged_at = NOW()
         WHERE client_id = $1 AND authorization_code_hash = $2 AND code_exchanged_at IS NULL
           AND authorization_code_expires_at > NOW()
           AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW()) RETURNING *`,
        [req.developerClient.client_id, hash(req.body.code)]
      );
      if (!rows[0]) throw error(400, 'authorization_code_invalid', 'Authorization code is invalid or already used');
      // The audit listener reads this at response completion, so token exchanges
      // retain grant/user attribution without logging the one-time code or token.
      req.delegated = rows[0];
      res.json({ data: { access_token: auth.issueDelegated(rows[0]), token_type: 'Bearer', expires_in: 3600, scopes: rows[0].scopes }, meta: { request_id: req.requestId } });
    } catch (err) { next(err); }
  });

  app.use('/v1', auth.user);

  async function authorizationRequest(req) {
    if (!req.developerClient.first_party) throw error(403, 'first_party_required', 'Authorization approval requires a Guaji first-party session');
    const clientId = req.method === 'GET' ? req.query.client_id : req.body?.client_id;
    const redirectUri = req.method === 'GET' ? req.query.redirect_uri : req.body?.redirect_uri;
    const rawScopes = req.method === 'GET' ? req.query.scope : req.body?.scope;
    const scopes = Array.isArray(rawScopes) ? rawScopes : String(rawScopes || '').split(/[ ,]+/).filter(Boolean);
    if (!clientId || !redirectUri || scopes.length === 0 || scopes.some((scope) => !OAUTH_SCOPES.has(scope))) throw error(400, 'authorization_request_invalid', 'client_id, registered redirect_uri, and valid scopes are required');
    const { rows } = await db.query('SELECT id, name, redirect_uris FROM developer_clients WHERE id = $1 AND status = \'active\'', [clientId]);
    const client = rows[0];
    if (!client || !client.redirect_uris?.includes(redirectUri)) throw error(400, 'redirect_uri_invalid', 'redirect_uri is not registered for this client');
    return { client, redirectUri, scopes: [...new Set(scopes)] };
  }

  app.get('/v1/oauth/authorize', async (req, res, next) => {
    try {
      const request = await authorizationRequest(req);
      res.json({ data: { client: { id: request.client.id, name: request.client.name }, redirect_uri: request.redirectUri, scopes: request.scopes, state: req.query.state || '' }, meta: { request_id: req.requestId } });
    } catch (err) { next(err); }
  });

  app.post('/v1/oauth/authorize', requireIdempotency, async (req, res, next) => {
    try {
      const request = await authorizationRequest(req);
      const redirect = new URL(request.redirectUri);
      if (req.body?.approved === false) {
        redirect.searchParams.set('error', 'access_denied');
      } else {
        const code = `code_${crypto.randomBytes(32).toString('base64url')}`;
        await db.query(
          `INSERT INTO developer_user_grants (client_id,user_id,scopes,authorization_code_hash,authorization_code_expires_at,code_exchanged_at,status,expires_at,revoked_at)
           VALUES ($1,$2,$3,$4,NOW() + INTERVAL '10 minutes',NULL,'active',NULL,NULL)
           ON CONFLICT (client_id,user_id) DO UPDATE SET scopes = EXCLUDED.scopes, authorization_code_hash = EXCLUDED.authorization_code_hash,
             authorization_code_expires_at = EXCLUDED.authorization_code_expires_at, code_exchanged_at = NULL, status = 'active', revoked_at = NULL`,
          [request.client.id, req.delegated.user_id, request.scopes, hash(code)]
        );
        redirect.searchParams.set('code', code);
      }
      if (req.body?.state) redirect.searchParams.set('state', String(req.body.state));
      res.json({ data: { redirect_url: redirect.toString() }, meta: { request_id: req.requestId } });
    } catch (err) { next(err); }
  });
  app.get('/v1/profile', auth.requireScopes('profile:read'), async (req, res, next) => {
    try {
      const { rows } = await db.query('SELECT id, username, email, nickname, avatar_url, native_language, target_language, interests, daily_practice_goal, gender, birth_year, points, subscription_status, created_at, updated_at FROM users WHERE id = $1', [req.delegated.user_id]);
      if (!rows[0]) throw error(404, 'profile_not_found', 'Profile not found');
      res.json({ data: rows[0], meta: { request_id: req.requestId } });
    } catch (err) { next(err); }
  });

  app.patch('/v1/profile', auth.requireScopes('profile:write'), async (req, res, next) => {
    try {
      const entries = Object.entries(req.body || {}).filter(([key]) => PROFILE_FIELDS.has(key));
      if (!entries.length || entries.length !== Object.keys(req.body || {}).length) throw error(400, 'profile_fields_invalid', 'Only documented profile fields may be updated');
      const setters = entries.map(([key], i) => `${key} = $${i + 1}`);
      const values = entries.map(([, value]) => value);
      const { rows } = await db.query(`UPDATE users SET ${setters.join(', ')}, updated_at = NOW() WHERE id = $${values.length + 1} RETURNING id, username, email, nickname, avatar_url, native_language, target_language, interests, daily_practice_goal, gender, birth_year, points, subscription_status, updated_at`, [...values, req.delegated.user_id]);
      res.json({ data: rows[0], meta: { request_id: req.requestId } });
    } catch (err) { next(err); }
  });

  app.get('/v1/goals', auth.requireScopes('goals:read'), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const cursor = decodeCursor(req.query.cursor);
      const values = [req.delegated.user_id, limit + 1];
      let condition = '';
      if (cursor) { values.push(cursor[0], cursor[1]); condition = 'AND (created_at, id) < ($3::timestamptz, $4::int)'; }
      const { rows } = await db.query(`SELECT id, type, description, target_language, target_level, current_proficiency, completion_time_days, interests, scenarios, status, created_at, updated_at FROM user_goals WHERE user_id = $1 ${condition} ORDER BY created_at DESC, id DESC LIMIT $2`, values);
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);
      res.json({ data, meta: { request_id: req.requestId, next_cursor: hasMore ? encodeCursor(data.at(-1)) : null } });
    } catch (err) { next(err); }
  });

  app.post('/v1/goals', auth.requireScopes('goals:write'), requireIdempotency, async (req, res, next) => {
    const client = await db.connect();
    try {
      const { type = 'custom', description = '', target_language, target_level, current_proficiency = 0, completion_time_days, interests = '', scenarios = [] } = req.body || {};
      if (!target_language || !target_level || !Array.isArray(scenarios)) throw error(400, 'goal_invalid', 'target_language, target_level, and scenarios are required');
      await client.query('BEGIN');
      const goal = (await client.query(
        `INSERT INTO user_goals (user_id,type,description,target_language,target_level,current_proficiency,completion_time_days,interests,scenarios,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active') RETURNING *`,
        [req.delegated.user_id, type, description, target_language, target_level, current_proficiency, completion_time_days || null, interests, JSON.stringify(scenarios)]
      )).rows[0];
      for (const scenario of scenarios) {
        for (const task of Array.isArray(scenario.tasks) ? scenario.tasks : []) {
          const text = typeof task === 'string' ? task : task.text;
          if (text) await client.query('INSERT INTO user_tasks (user_id,goal_id,scenario_title,task_description) VALUES ($1,$2,$3,$4)', [req.delegated.user_id, goal.id, scenario.title, text]);
        }
      }
      await client.query('COMMIT');
      res.status(201).json({ data: goal, meta: { request_id: req.requestId } });
    } catch (err) { await client.query('ROLLBACK').catch(() => {}); next(err); }
    finally { client.release(); }
  });

  app.get('/v1/tasks', auth.requireScopes('goals:read'), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const cursor = decodeCursor(req.query.cursor);
      const values = [req.delegated.user_id, limit + 1];
      let condition = '';
      if (cursor) { values.push(cursor[0], cursor[1]); condition = 'AND (created_at, id) < ($3::timestamptz, $4::int)'; }
      const { rows } = await db.query(`SELECT id, goal_id, scenario_title, task_description, status, score, interaction_count, feedback, completed_at, created_at, updated_at FROM user_tasks WHERE user_id = $1 ${condition} ORDER BY created_at DESC, id DESC LIMIT $2`, values);
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);
      res.json({ data, meta: { request_id: req.requestId, next_cursor: hasMore ? encodeCursor(data.at(-1)) : null } });
    } catch (err) { next(err); }
  });

  app.post('/v1/conversations', auth.requireScopes('conversations:write'), requireIdempotency, async (req, res, next) => {
    try {
      const upstream = await requestJson(`${conversationUrl}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.issueConversationToken(req.delegated)}` },
        body: { goalId: req.body?.goal_id, forceNew: req.body?.force_new },
      });
      res.status(201).json({ data: upstream.data, meta: { request_id: req.requestId } });
    } catch (err) { next(err); }
  });

  app.get('/v1/conversations', auth.requireScopes('conversations:read'), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const cursor = decodeCursor(req.query.cursor);
      const historyToken = auth.issueHistoryToken(req.delegated);
      let items = [];
      let page = 1;
      let totalPages = 1;
      do {
        const upstream = await requestJson(`${historyUrl}/api/history/user/${encodeURIComponent(req.delegated.user_id)}?limit=100&page=${page}`, { headers: { Authorization: `Bearer ${historyToken}` } });
        items.push(...(Array.isArray(upstream.data) ? upstream.data : []));
        totalPages = Math.max(1, Number(upstream.totalPages) || 1);
        const eligible = cursor
          ? items.filter((item) => new Date(item.startTime).toISOString() < cursor[0] || (new Date(item.startTime).toISOString() === cursor[0] && item.sessionId < cursor[1]))
          : items;
        if (eligible.length > limit) break;
        page += 1;
      } while (page <= totalPages);
      if (cursor) items = items.filter((item) => new Date(item.startTime).toISOString() < cursor[0] || (new Date(item.startTime).toISOString() === cursor[0] && item.sessionId < cursor[1]));
      items.sort((a, b) => new Date(b.startTime) - new Date(a.startTime) || String(b.sessionId).localeCompare(String(a.sessionId)));
      const hasMore = items.length > limit;
      const data = items.slice(0, limit);
      const last = data.at(-1);
      res.json({ data, meta: { request_id: req.requestId, next_cursor: hasMore && last ? Buffer.from(JSON.stringify([new Date(last.startTime).toISOString(), last.sessionId])).toString('base64url') : null } });
    } catch (err) { next(err); }
  });

  app.get('/v1/conversations/:sessionId', auth.requireScopes('conversations:read'), async (req, res, next) => {
    try {
      const upstream = await requestJson(`${historyUrl}/api/history/session/${encodeURIComponent(req.params.sessionId)}`, { headers: { Authorization: `Bearer ${auth.issueHistoryToken(req.delegated)}` } });
      const record = upstream.data || upstream;
      if (String(record.userId || record.user_id) !== String(req.delegated.user_id)) throw error(404, 'conversation_not_found', 'Conversation not found');
      res.json({ data: record, meta: { request_id: req.requestId } });
    } catch (err) { next(err); }
  });

  app.post('/v1/ai/scenarios', auth.requireScopes('ai:generate'), requireIdempotency, proxyJson(`${aiUrl}/generate-scenarios`, aiTimeoutMs));
  app.post('/v1/ai/tts', auth.requireScopes('ai:generate'), requireIdempotency, async (req, res, next) => {
    try {
      const upstream = await fetchWithTimeout(`${aiUrl}/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.body) });
      if (!upstream.ok) throw await upstreamError(upstream);
      const contentType = upstream.headers.get('content-type') || 'audio/wav';
      const audio = await upstream.buffer();
      await db.query(
        `UPDATE developer_idempotency_keys SET status_code = $1, response_body_binary = $2, response_content_type = $3
         WHERE client_id = $4 AND grant_id = $5 AND user_id = $6 AND method = $7 AND path = $8 AND idempotency_key = $9`,
        [upstream.status, audio, contentType, req.developerClient.client_id, req.delegated.grant_id, req.delegated.user_id, req.method, req.path, req.idempotencyKey]
      );
      res.status(upstream.status).type(contentType).send(audio);
    } catch (err) { next(err); }
  });

  app.post('/v1/realtime/tickets', auth.requireScopes('realtime:connect'), requireIdempotency, (req, res) => {
    res.status(201).json({ data: { ticket: auth.issueRealtimeTicket(req.delegated), expires_in: 60, websocket_url: '/api/v1/realtime' }, meta: { request_id: req.requestId } });
  });

  async function requireIdempotency(req, res, next) {
    try {
      const key = req.get('Idempotency-Key');
      if (!key || key.length > 255) throw error(400, 'idempotency_key_required', 'A valid Idempotency-Key is required');
      const requestHash = hash(JSON.stringify({ method: req.method, path: req.path, body: req.body || {} }));
      const inserted = await db.query(
        `INSERT INTO developer_idempotency_keys (client_id, grant_id, user_id, idempotency_key, method, path, request_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [req.developerClient.client_id, req.delegated.grant_id, req.delegated.user_id, key, req.method, req.path, requestHash]
      );
      if (!inserted.rows[0]) {
        const existing = (await db.query(
          `SELECT request_hash, status_code, response_body, response_body_binary, response_content_type FROM developer_idempotency_keys
           WHERE client_id = $1 AND grant_id = $2 AND user_id = $3 AND method = $4 AND path = $5 AND idempotency_key = $6 AND expires_at > NOW()`,
          [req.developerClient.client_id, req.delegated.grant_id, req.delegated.user_id, req.method, req.path, key]
        )).rows[0];
        if (!existing) throw error(409, 'idempotency_key_expired', 'Idempotency key is no longer reusable');
        if (existing.request_hash !== requestHash) throw error(409, 'idempotency_key_conflict', 'Idempotency key was used with a different request');
        if (existing.status_code && existing.response_body_binary) return res.status(existing.status_code).type(existing.response_content_type || 'application/octet-stream').send(existing.response_body_binary);
        if (existing.status_code && existing.response_body) return res.status(existing.status_code).json(existing.response_body);
        throw error(409, 'idempotency_request_in_progress', 'A request with this key is still in progress');
      }
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode < 500) db.query(
          `UPDATE developer_idempotency_keys SET status_code = $1, response_body = $2
           WHERE client_id = $3 AND grant_id = $4 AND user_id = $5 AND method = $6 AND path = $7 AND idempotency_key = $8`,
          [res.statusCode, body, req.developerClient.client_id, req.delegated.grant_id, req.delegated.user_id, req.method, req.path, key]
        ).catch(() => {});
        return originalJson(body);
      };
      res.on('finish', () => {
        if (res.statusCode < 500) return;
        db.query(
          `DELETE FROM developer_idempotency_keys WHERE client_id = $1 AND grant_id = $2 AND user_id = $3 AND method = $4 AND path = $5 AND idempotency_key = $6`,
          [req.developerClient.client_id, req.delegated.grant_id, req.delegated.user_id, req.method, req.path, key]
        ).catch(() => {});
      });
      req.idempotencyKey = key;
      next();
    } catch (err) { next(err); }
  }

  function proxyJson(url, timeoutMs) {
    return async (req, res, next) => {
      try {
        const upstream = await requestJson(url, { method: 'POST', body: req.body, timeoutMs });
        res.json({ data: upstream?.data ?? upstream, meta: { request_id: req.requestId } });
      }
      catch (err) { next(err); }
    };
  }

  async function requestJson(url, options = {}) {
    const response = await fetchWithTimeout(url, { method: options.method || 'GET', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, body: options.body ? JSON.stringify(options.body) : undefined }, options.timeoutMs);
    if (!response.ok) throw await upstreamError(response);
    return response.json();
  }

  async function fetchWithTimeout(url, options, timeoutMs = upstreamTimeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    catch (err) { if (err.name === 'AbortError') throw error(504, 'upstream_timeout', 'Upstream service timed out'); throw error(502, 'upstream_unavailable', 'Upstream service is unavailable'); }
    finally { clearTimeout(timer); }
  }

  async function upstreamError(response) {
    let details;
    try { details = await response.json(); } catch { details = undefined; }
    return error(response.status >= 500 ? 502 : response.status, 'upstream_error', 'Upstream request failed', details);
  }

  app.use((req, _res, next) => next(error(404, 'not_found', 'Endpoint not found')));
  app.use((err, req, res, _next) => {
    const status = Number(err.status) || 500;
    if (status >= 500) console.error(`[developer-api] ${req.requestId} ${err.code || 'internal_error'}: ${err.message}`);
    res.status(status).json({ error: { code: err.code || 'internal_error', message: status >= 500 && !err.code ? 'Internal server error' : err.message, ...(err.details ? { details: err.details } : {}) }, meta: { request_id: req.requestId } });
  });
  return app;
}

module.exports = { createApp, encodeCursor, decodeCursor };
