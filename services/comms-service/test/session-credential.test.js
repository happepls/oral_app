const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { accessCookie, sessionCredential } = require('../src/sessionCredential');

const secret = 'session-credential-test-secret';
const claims = { id: 'user-a', sid: 'session-a', type: 'realtime_ticket' };
const sign = (fields = {}, options = {}) => jwt.sign({ id: 'user-a', sid: 'session-a', type: 'access', ...fields }, secret,
  { issuer: 'oral-app', audience: 'oral-app-users', expiresIn: '1h', ...options });

test('bound browser credential retains original identity, issuance time and expiry', () => {
  const token = sign({ iat: Math.floor(Date.now() / 1000) - 30 });
  const expected = jwt.verify(token, secret);
  const selected = sessionCredential('admission-ticket', claims, `other=a=b; accessToken=${encodeURIComponent(token)}`, secret);
  assert.equal(selected.token, token);
  assert.deepEqual(selected.claims, expected);
  assert.equal(selected.browserCookie, true);
  assert.throws(() => jwt.verify(selected.token, secret, { clockTimestamp: expected.exp + 1 }), { name: 'TokenExpiredError' });
});

test('another account, device session, token purpose or invalid cookie cannot replace admission identity', () => {
  for (const token of [sign({ id: 'user-b' }), sign({ sid: 'session-b' }), sign({ type: 'refresh' }),
    sign({}, { issuer: 'other-issuer' }), sign({}, { audience: 'other-audience' }),
    sign({}, { expiresIn: -1 }), 'invalid-token', '%broken-escape']) {
    assert.throws(() => sessionCredential('admission-ticket', claims, `accessToken=${token}`, secret),
      { status: 401, code: 'authentication_required' });
  }
});

test('partners, legacy access and ticket-only callers keep their original credential', () => {
  for (const identity of [{ id: 'partner-user', type: 'realtime_ticket', grant_id: 'grant' },
    { id: 'legacy-user', sid: 'legacy-session', type: 'access' }, claims]) {
    const cookie = identity === claims ? '' : `accessToken=${sign({ id: 'different-user' })}`;
    assert.deepEqual(sessionCredential('original-credential', identity, cookie, secret),
      { token: 'original-credential', claims: identity, browserCookie: false });
  }
  assert.equal(accessCookie('other=a=b'), null);
});
