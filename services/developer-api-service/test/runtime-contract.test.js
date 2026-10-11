const test = require('node:test');
const assert = require('node:assert/strict');

test('release probe requires matching runtime, actual login cookie, complete authority and binary replay', async () => {
  const { verifyTtsAccess } = await import('../../../scripts/release/verify-tts-access.mjs');
  const calls = [];
  const fixture = { baseUrl: 'http://test.invalid', healthUrl: 'http://developer.invalid/health', email: 'synthetic@example.invalid',
    password: 'synthetic-fixture', expectedMember: true, expectedNativeLanguage: 'Chinese', expectedDigest: 'test-digest',
    expectedTargetLanguage: 'Japanese', expectedScenarioCount: 1, expectedUnlockedCount: 1 };
  const fetchImpl = async (url, options) => {
    const pathname = new URL(url).pathname;
    calls.push({ pathname, options });
    if (pathname === '/health') return Response.json({ service: 'developer-api-service', build: { source_sha256: 'test-digest' } });
    if (pathname === '/api/users/login') return Response.json({ success: true }, { headers: { 'set-cookie': 'accessToken=synthetic; HttpOnly; Path=/api' } });
    assert.equal(options.headers.Cookie, 'accessToken=synthetic');
    if (pathname.endsWith('/profile')) return Response.json({ data: { native_language: 'Chinese' } });
    if (pathname.endsWith('/goals/active')) return Response.json({ data: { access: { membership: { active: true }, unlocked_count: 1, scenarios: [{ title: 'Cafe', allowed: true }] }, goal: {
      target_language: 'Japanese',
      access: { membership: { active: true }, unlocked_count: 1, scenarios: [{ title: 'Cafe', allowed: true }] },
      scenarios: [{ title: 'Cafe', tasks: [{ id: 1, score: 3, interaction_count: 4, scoring_generation: 3 }] }],
    } } });
    return new Response('RIFF-synthetic', { headers: { 'content-type': 'audio/wav' } });
  };
  assert.equal((await verifyTtsAccess({ ...fixture, fetchImpl })).authenticated_audio, true);
  assert.equal(calls.length, 6);
  assert.equal(calls[4].options.headers['Idempotency-Key'], calls[5].options.headers['Idempotency-Key']);
  await assert.rejects(verifyTtsAccess({ ...fixture, fetchImpl, expectedDigest: 'old-deployment' }), /does not match/);
  await assert.rejects(verifyTtsAccess({ ...fixture, fetchImpl, expectedMember: undefined }), /required/);
  const freeButUnlocked = async (url, options) => {
    const response = await fetchImpl(url, options);
    if (!new URL(url).pathname.endsWith('/goals/active')) return response;
    const body = await response.json();
    for (const access of [body.data.access, body.data.goal.access]) {
      access.membership.active = false;
      access.unlocked_count = 0;
    }
    return Response.json(body);
  };
  await assert.rejects(verifyTtsAccess({ ...fixture, fetchImpl: freeButUnlocked,
    expectedMember: false, expectedUnlockedCount: 0 }), /permissions differ/);
});
