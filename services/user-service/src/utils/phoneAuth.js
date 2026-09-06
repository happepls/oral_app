const crypto = require('crypto');
const redis = require('./redisClient');

// Input is canonical E.164. Do not silently strip arbitrary characters or
// truncate a pasted number into a different account identifier.
function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const phone = value.trim();
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return null;
  if (phone.startsWith('+86') && !/^\+861[3-9]\d{9}$/.test(phone)) return null;
  return phone;
}

function phoneKey(phone) {
  return crypto.createHash('sha256').update(phone).digest('hex');
}

// One atomic reservation across all service replicas. Retain failed-send
// reservations too: an upstream timeout can still result in SMS delivery.
const LIMIT_SCRIPT = `
local cooldown = redis.call('TTL', KEYS[2])
if cooldown > 0 then return cooldown end
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then
  return math.max(1, redis.call('TTL', KEYS[1]))
end
local next = redis.call('INCR', KEYS[1])
if next == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
end
return 0
`;

async function reservePhoneAttempt(phone, operation) {
  const sending = operation === 'send';
  const prefix = `phone_auth:{${phoneKey(phone)}}:${operation}`;
  const retryAfter = Number(await redis.eval(
    LIMIT_SCRIPT, 2, `${prefix}:count`, `${prefix}:cooldown`,
    5, sending ? 3600 : 600, sending ? 60 : 0
  ));
  if (!Number.isFinite(retryAfter) || retryAfter < 0) throw new Error('Invalid SMS limit result');
  return retryAfter;
}

module.exports = { normalizePhone, phoneKey, reservePhoneAttempt };
