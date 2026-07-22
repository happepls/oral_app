const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function requireHistoryUser(req, res, next) {
  const authorization = req.get('Authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : readCookie(req.headers.cookie, 'accessToken');
  if (!token || !process.env.JWT_SECRET) return res.status(401).json({ success: false, message: 'Authentication required' });
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!claims.id || !['access', 'internal_history'].includes(claims.type)) throw new Error('invalid token type');
    req.authUserId = String(claims.id);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
  }
}

function requireInternalService(req, res, next) {
  const expected = process.env.INTERNAL_AUTH_SECRET;
  const supplied = req.get('X-Guaji-Internal-Auth');
  if (!expected || !supplied) return res.status(401).json({ success: false, message: 'Internal authentication required' });
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return res.status(401).json({ success: false, message: 'Invalid internal authentication' });
  next();
}

module.exports = { requireHistoryUser, requireInternalService };
