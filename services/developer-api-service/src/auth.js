const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const FIRST_PARTY_CLIENT_ID = '00000000-0000-4000-8000-000000000010';
const ALL_FIRST_PARTY_SCOPES = ['profile:read', 'profile:write', 'goals:read', 'goals:write', 'conversations:read', 'conversations:write', 'ai:generate', 'realtime:connect'];

function error(status, code, message, details) {
  const value = new Error(message);
  Object.assign(value, { status, code, details });
  return value;
}

function createAuth({ db, delegatedSecret, realtimeSecret }) {
  function cookie(req, name) {
    const pairs = String(req.headers.cookie || '').split(';');
    for (const pair of pairs) {
      const [key, ...value] = pair.trim().split('=');
      if (key === name) return decodeURIComponent(value.join('='));
    }
    return null;
  }

  async function apiKey(req, _res, next) {
    try {
      const raw = req.get('X-Guaji-API-Key');
      if (!raw) throw error(401, 'api_key_missing', 'X-Guaji-API-Key is required');
      const { rows } = await db.query(
        `SELECT k.id AS key_id, k.client_id, c.name, c.status AS client_status
         FROM developer_api_keys k JOIN developer_clients c ON c.id = k.client_id
         WHERE k.key_hash = $1 AND k.status = 'active'
           AND (k.expires_at IS NULL OR k.expires_at > NOW())`,
        [hash(raw)]
      );
      const client = rows[0];
      if (!client || client.client_status !== 'active') throw error(401, 'api_key_invalid', 'API key is invalid or expired');
      req.developerClient = client;
      db.query('UPDATE developer_api_keys SET last_used_at = NOW() WHERE id = $1', [client.key_id]).catch(() => {});
      next();
    } catch (err) { next(err); }
  }

  async function delegated(req, _res, next) {
    try {
      const raw = req.get('Authorization');
      if (!raw?.startsWith('Bearer ')) throw error(401, 'delegated_token_missing', 'Delegated bearer token is required');
      const claims = jwt.verify(raw.slice(7), delegatedSecret, { algorithms: ['HS256'], issuer: 'guaji-developer-api', audience: 'guaji-partners' });
      if (claims.type !== 'delegated' || claims.client_id !== req.developerClient.client_id) throw error(401, 'delegated_token_invalid', 'Delegated token does not match this client');
      const { rows } = await db.query(
        `SELECT id, user_id, scopes FROM developer_user_grants
         WHERE id = $1 AND client_id = $2 AND user_id = $3 AND status = 'active'
           AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
        [claims.grant_id, claims.client_id, claims.user_id]
      );
      if (!rows[0]) throw error(401, 'grant_revoked', 'User grant is expired or revoked');
      req.delegated = { ...claims, scopes: rows[0].scopes || [] };
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') return next(error(401, 'delegated_token_expired', 'Delegated token has expired'));
      if (err.name === 'JsonWebTokenError') return next(error(401, 'delegated_token_invalid', 'Delegated token is invalid'));
      next(err);
    }
  }

  async function client(req, res, next) {
    // Token exchange is partner-only even when a signed-in Guaji cookie exists.
    if (req.path === '/oauth/token' || req.get('X-Guaji-API-Key')) return apiKey(req, res, next);
    try {
      const raw = cookie(req, 'accessToken');
      if (!raw) throw error(401, 'api_key_missing', 'X-Guaji-API-Key is required for partner calls');
      const claims = jwt.verify(raw, realtimeSecret, { algorithms: ['HS256'], issuer: 'oral-app', audience: 'oral-app-users' });
      if (claims.type !== 'access' || !claims.id) throw error(401, 'first_party_token_invalid', 'First-party session is invalid');
      const { rows } = await db.query(
        `INSERT INTO developer_user_grants (client_id,user_id,scopes,status)
         VALUES ($1,$2,$3,'active') ON CONFLICT (client_id,user_id)
         DO UPDATE SET scopes = EXCLUDED.scopes, status = 'active', revoked_at = NULL
         RETURNING id`,
        [FIRST_PARTY_CLIENT_ID, claims.id, ALL_FIRST_PARTY_SCOPES]
      );
      req.developerClient = { client_id: FIRST_PARTY_CLIENT_ID, name: 'Guaji First Party', first_party: true };
      req.delegated = { type: 'first_party', user_id: claims.id, client_id: FIRST_PARTY_CLIENT_ID, grant_id: rows[0].id, scopes: ALL_FIRST_PARTY_SCOPES };
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') return next(error(401, 'first_party_token_expired', 'First-party session has expired'));
      if (err.name === 'JsonWebTokenError') return next(error(401, 'first_party_token_invalid', 'First-party session is invalid'));
      next(err);
    }
  }

  function user(req, res, next) {
    if (req.developerClient?.first_party) return next();
    return delegated(req, res, next);
  }

  const requireScopes = (...required) => (req, _res, next) => {
    const granted = new Set(req.delegated?.scopes || []);
    const missing = required.filter((scope) => !granted.has(scope));
    if (missing.length) return next(error(403, 'insufficient_scope', 'The grant does not include required scopes', { missing }));
    next();
  };

  function issueDelegated(grant) {
    return jwt.sign({ type: 'delegated', user_id: grant.user_id, client_id: grant.client_id, grant_id: grant.id, scopes: grant.scopes }, delegatedSecret, { algorithm: 'HS256', issuer: 'guaji-developer-api', audience: 'guaji-partners', expiresIn: '60m' });
  }

  function issueRealtimeTicket(delegatedClaims) {
    return jwt.sign({ id: delegatedClaims.user_id, type: 'realtime_ticket', client_id: delegatedClaims.client_id, grant_id: delegatedClaims.grant_id }, realtimeSecret, { algorithm: 'HS256', expiresIn: '60s' });
  }

  function issueHistoryToken(delegatedClaims) {
    return jwt.sign({ id: delegatedClaims.user_id, type: 'internal_history' }, realtimeSecret, { algorithm: 'HS256', expiresIn: '30s' });
  }

  function issueConversationToken(delegatedClaims) {
    return jwt.sign({ id: delegatedClaims.user_id, type: 'internal_conversation' }, realtimeSecret, { algorithm: 'HS256', expiresIn: '30s' });
  }

  return { apiKey, delegated, client, user, requireScopes, issueDelegated, issueRealtimeTicket, issueHistoryToken, issueConversationToken };
}

module.exports = { createAuth, hash, error, FIRST_PARTY_CLIENT_ID, ALL_FIRST_PARTY_SCOPES };
