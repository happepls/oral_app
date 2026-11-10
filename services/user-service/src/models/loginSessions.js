const crypto = require('crypto');
const db = require('./db');
const { membership } = require('../stripe/membership');
const enabled = () => process.env.DEVICE_SESSION_LIMIT_ENABLED === 'true';
const revoked = () => Object.assign(new Error('SESSION_REVOKED'), { status: 401, code: 'SESSION_REVOKED' });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

// Lock the account for both creation and enforcement, including membership upgrades.
async function enforce(client, user) {
  if (membership(user)?.subscription_status !== 'active') return [];
  const result = await client.query(`UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id IN (
    SELECT id FROM login_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()
    ORDER BY created_at DESC, id DESC OFFSET 2) RETURNING id`, [user.id]);
  return result.rows.map(row => row.id);
}
async function transaction(userId, action) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!rows[0]) throw revoked();
    const result = await action(client, rows[0]);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
async function issue(req, res, userId) {
  if (!enabled()) return undefined;
  const cookie = req.cookies?.loginDevice;
  const device = /^[a-f0-9]{64}$/.test(cookie || '') ? cookie : crypto.randomBytes(32).toString('hex');
  let id = crypto.randomUUID();
  const revokedIds = await transaction(userId, async (client, user) => {
    // Preserve first-login order when this browser authenticates again.
    const previous = await client.query(`SELECT id FROM login_sessions
      WHERE user_id=$1 AND device_hash=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()
      ORDER BY created_at LIMIT 1`, [userId, hash(device)]);
    if (previous.rows[0]) {
      // Cookie sharing means other tabs already use this session. Keep their
      // open sockets valid rather than treating reauthentication as eviction.
      id = previous.rows[0].id;
      await client.query("UPDATE login_sessions SET expires_at=clock_timestamp()+interval '7 days' WHERE id=$1", [id]);
    } else {
      await client.query(`INSERT INTO login_sessions(id,user_id,device_hash,expires_at)
        VALUES($1,$2,$3,clock_timestamp()+interval '7 days')`, [id, userId, hash(device)]);
    }
    return enforce(client, user);
  });
  // Best-effort wakeup only; PostgreSQL validation remains authoritative.
  const redis = require('../utils/redisClient');
  if (revokedIds.length && redis.status === 'ready') {
    await require('../utils/notificationPublisher').publishNotification(userId, 'session_revoked', { sessionIds: revokedIds });
  }
  res.cookie('loginDevice', device, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api', maxAge: 365 * 86400000 });
  return id;
}
async function validate(claims) {
  if (!enabled()) return;
  // Partner API grants have their own lifecycle; they are not browser devices.
  if (claims.delegated_grant_id && claims.delegated_client_id) {
    const { rows } = await db.query(`SELECT 1 FROM developer_user_grants WHERE id=$1 AND user_id=$2 AND client_id=$3
      AND status='active' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,
    [claims.delegated_grant_id, claims.id, claims.delegated_client_id]);
    if (!rows.length) throw revoked();
    return;
  }
  const valid = await transaction(claims.id, async (client, user) => {
    if (['suspended', 'deleted'].includes(user.status)) return false;
    if (user.password_changed_at && claims.iat < new Date(user.password_changed_at).getTime() / 1000) return false;
    await enforce(client, user);
    if (!claims.sid) return membership(user)?.subscription_status !== 'active';
    const { rows } = await client.query(`SELECT 1 FROM login_sessions WHERE id=$1 AND user_id=$2
      AND revoked_at IS NULL AND expires_at>clock_timestamp()`, [claims.sid, claims.id]);
    return rows.length > 0;
  });
  if (!valid) throw revoked();
}
async function revoke(claims) {
  if (claims.sid) await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1 AND user_id=$2', [claims.sid, claims.id]);
}
module.exports = { issue, validate, revoke, enabled };
