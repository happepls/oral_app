const http = require('http');
const https = require('https');

function checkAccess(userId, scenario, mode) {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!secret) return Promise.resolve({ allowed: false, status: 503, reason: 'authorization_unavailable' });
  const endpoint = new URL(`/api/users/internal/users/${encodeURIComponent(userId)}/access/check`, process.env.USER_SERVICE_URL || 'http://user-service:3000');
  return new Promise(resolve => {
    const fail = () => resolve({ allowed: false, status: 503, reason: 'authorization_unavailable' });
    const body = JSON.stringify({ scenario, mode });
    const request = (endpoint.protocol === 'https:' ? https : http).request(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'X-Guaji-Internal-Auth': secret },
    }, response => {
      let data = '';
      response.on('error', fail);
      response.on('data', chunk => { data += chunk; if (data.length > 1000000) request.destroy(); });
      response.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(response.statusCode === 200 && result.allowed === true ? result
            : { allowed: false, status: [401, 403, 429].includes(response.statusCode) ? response.statusCode : 503, reason: result.reason || 'authorization_unavailable' });
        } catch (_) { fail(); }
      });
    });
    request.on('error', fail);
    request.setTimeout(5000, () => { request.destroy(); fail(); });
    request.end(body);
  });
}

module.exports = { checkAccess };
