const PREFIX = '/api/users/analytics';
const PATHS = new Set(['/', '/welcome', '/login', '/register', '/quick-experience',
  '/forgot-password', '/reset-password', '/conversation', '/recall', '/discovery',
  '/profile', '/onboarding', '/goal-setting', '/checkin', '/goals', '/subscription',
  '/achievements', '/history']);

export function analyticsAllowed() {
  try {
    return localStorage.getItem('analytics_opt_out') !== 'true' &&
      navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl;
  } catch { return false; }
}
export function normalizeAnalyticsPath(path) {
  return PATHS.has(path) ? path : '/other';
}
export async function trackPage(path) {
  if (!analyticsAllowed()) return;
  try {
    const config = await fetch(`${PREFIX}/config`, { credentials: 'omit' });
    if (!config.ok || !(await config.json()).enabled || !analyticsAllowed()) return;
    let referrer = '';
    try { referrer = new URL(document.referrer).origin; } catch { /* no referrer */ }
    await fetch(`${PREFIX}/pageview`, {
      method: 'POST', credentials: 'omit', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: normalizeAnalyticsPath(path), referrer, language: navigator.language }),
    });
  } catch { /* Optional analytics must not affect navigation. */ }
}

// Only explicit navigation invokes this. Unmount/disconnect/refresh are not completion.
export async function endAnalyticsConversation(sessionId, userId, endProof) {
  if (!sessionId || !endProof) return;
  const key = userId ? `analytics_pending_ends:${userId}` : null;
  try {
    if (key) {
      const pending = JSON.parse(localStorage.getItem(key) || '{}');
      pending[sessionId] = pending[sessionId] || { at: Date.now(), proof: endProof };
      localStorage.setItem(key, JSON.stringify(pending));
    }
  } catch { /* Storage may be disabled; still attempt delivery. */ }
  try {
    const response = await fetch(`${PREFIX}/end`, { method: 'POST', credentials: 'include', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, endProof }) });
    if ((response.ok || response.status === 403) && key) {
      const pending = JSON.parse(localStorage.getItem(key) || '{}');
      delete pending[sessionId];
      localStorage.setItem(key, JSON.stringify(pending));
    }
  } catch { /* Business navigation remains available during analytics outages. */ }
}

export async function retryAnalyticsEnds(userId) {
  if (!userId) return;
  try {
    const key = `analytics_pending_ends:${userId}`;
    const pending = JSON.parse(localStorage.getItem(key) || '{}');
    for (const [sessionId, item] of Object.entries(pending)) {
      if (!item.proof || Date.now() - item.at > 90 * 86400000) delete pending[sessionId];
    }
    localStorage.setItem(key, JSON.stringify(pending));
    for (const sessionId of Object.keys(pending).slice(0, 20)) await endAnalyticsConversation(sessionId, userId, pending[sessionId].proof);
  } catch { /* Retry on the next navigation or online event. */ }
}
