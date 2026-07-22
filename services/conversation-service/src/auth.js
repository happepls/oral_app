const jwt = require('jsonwebtoken');

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index >= 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function createRequireUser(secret) {
  if (!secret) throw new Error('JWT_SECRET is required');
  return (req, res, next) => {
    const authorization = req.get('Authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : readCookie(req.headers.cookie, 'accessToken');
    if (!token) return res.status(401).json({ message: 'Authentication required.' });
    try {
      const claims = jwt.verify(token, secret, { algorithms: ['HS256'] });
      if (!['access', 'internal_conversation'].includes(claims.type) || !claims.id) throw new Error('invalid token type');
      req.authUserId = String(claims.id);
      req.authToken = token;
      next();
    } catch {
      res.status(401).json({ message: 'Invalid or expired authentication token.' });
    }
  };
}

module.exports = { createRequireUser };
