const test = require('node:test');
const assert = require('node:assert/strict');

for (const service of ['comms-service', 'history-analytics-service', 'conversation-service', 'developer-api-service']) {
  test(`${service} checks session authority and fails closed`, async () => {
    const { checkLoginSession } = require(`../../${service}/src/loginSession`);
    const originalFetch = global.fetch;
    const originalFlag = process.env.DEVICE_SESSION_LIMIT_ENABLED;
    process.env.DEVICE_SESSION_LIMIT_ENABLED = 'true';
    try {
      let supplied;
      global.fetch = async (_url, options) => { supplied = options.headers.Authorization; return { ok: true }; };
      await checkLoginSession('test-browser-token', { id: 'user', sid: 'session' });
      assert.equal(supplied, 'Bearer test-browser-token');
      global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ code: 'SESSION_REVOKED' }) });
      await assert.rejects(checkLoginSession('token', { id: 'user', sid: 'revoked' }), { status: 401, code: 'SESSION_REVOKED' });
      // Legacy tokens must also consult authority after activation.
      await assert.rejects(checkLoginSession('legacy', { id: 'user' }), { status: 401 });
      global.fetch = async () => { throw new Error('connection refused'); };
      await assert.rejects(checkLoginSession('token', { id: 'user', sid: 'session' }), { status: 503, code: 'authorization_unavailable' });
    } finally {
      global.fetch = originalFetch;
      if (originalFlag === undefined) delete process.env.DEVICE_SESSION_LIMIT_ENABLED;
      else process.env.DEVICE_SESSION_LIMIT_ENABLED = originalFlag;
    }
  });
}
