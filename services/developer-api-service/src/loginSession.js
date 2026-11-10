// Delegate browser-session authority to user-service; never accept on network failure.
async function checkLoginSession(token, claims) {
  if (!claims.sid && process.env.DEVICE_SESSION_LIMIT_ENABLED !== 'true') return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(new URL('/api/users/verify', process.env.USER_SERVICE_URL || 'http://user-service:3000'), {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }, signal: controller.signal,
    });
    if (response.ok) return;
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error(body.code === 'SESSION_REVOKED' ? 'SESSION_REVOKED' : 'authorization_unavailable'),
      { status: response.status === 401 ? 401 : 503, code: body.code === 'SESSION_REVOKED' ? 'SESSION_REVOKED' : 'authorization_unavailable' });
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('authorization_unavailable'), { status: 503, code: 'authorization_unavailable' });
  } finally { clearTimeout(timer); }
}
module.exports = { checkLoginSession };
