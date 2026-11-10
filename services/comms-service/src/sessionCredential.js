const jwt = require('jsonwebtoken');

function authenticationRequired() {
  return Object.assign(new Error('authentication_required'), { status: 401, code: 'authentication_required' });
}

function accessCookie(header) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== 'accessToken') continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); }
    catch { throw authenticationRequired(); }
  }
  return null;
}

// The caller must first validate the admission ticket, including its expiry.
// Browser cookies then provide the existing, longer-lived authority credential;
// account and device-session identity must agree with the admitted connection.
function sessionCredential(token, claims, cookieHeader, secret) {
  const admission = { token, claims, browserCookie: false };
  if (claims.type !== 'realtime_ticket' || !claims.sid) return admission;
  const cookie = accessCookie(cookieHeader);
  // Preserve existing ticket-only/partner behavior rather than borrowing an
  // unrelated browser identity or minting a longer-lived credential.
  if (!cookie) return admission;
  let browser;
  try {
    browser = jwt.verify(cookie, secret, {
      algorithms: ['HS256'], issuer: 'oral-app', audience: 'oral-app-users',
    });
  } catch { throw authenticationRequired(); }
  if (browser.type !== 'access' || browser.id !== claims.id || browser.sid !== claims.sid) {
    throw authenticationRequired();
  }
  return { token: cookie, claims: browser, browserCookie: true };
}

module.exports = { accessCookie, sessionCredential };
