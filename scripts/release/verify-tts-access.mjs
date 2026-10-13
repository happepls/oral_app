import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import buildIdentity from '../../services/developer-api-service/src/buildIdentity.js';

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

// Run only with a dedicated test account after an approved deployment. Never
// persist cookies, credentials, profile bodies, translations or audio bytes.
export async function verifyTtsAccess({ baseUrl, healthUrl, email, password, expectedMember,
  expectedNativeLanguage, expectedTargetLanguage, expectedScenarioCount, expectedUnlockedCount,
  expectedDigest, fetchImpl = fetch }) {
  requireCheck(baseUrl && healthUrl && email && password && expectedNativeLanguage && expectedDigest
    && typeof expectedMember === 'boolean', 'Explicit URLs, test credentials and expected contract are required');
  requireCheck(expectedTargetLanguage && Number.isInteger(expectedScenarioCount) && expectedScenarioCount > 0
    && Number.isInteger(expectedUnlockedCount) && expectedUnlockedCount >= 0, 'Expected goal language and scene counts are required');
  for (const value of [baseUrl, healthUrl]) requireCheck(['http:', 'https:'].includes(new URL(value).protocol), 'HTTP(S) URLs required');
  const request = (url, options = {}) => fetchImpl(url, { ...options, signal: AbortSignal.timeout(20000) });
  const health = await request(healthUrl);
  requireCheck(health.ok, 'Runtime identity is unavailable');
  const identity = await health.json();
  requireCheck(identity.service === 'developer-api-service' && identity.build?.source_sha256 === expectedDigest, 'Running source does not match checkout');

  const login = await request(new URL('/api/users/login', baseUrl), { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  requireCheck(login.ok, `Test login failed (${login.status})`);
  const session = login.headers.getSetCookie().find(value => value.startsWith('accessToken='))?.split(';')[0];
  requireCheck(session, 'Login did not issue an accessToken cookie');
  const headers = { Cookie: session, 'content-type': 'application/json' };
  const profileResponse = await request(new URL('/api/v1/profile', baseUrl), { headers });
  requireCheck(profileResponse.ok, `Profile failed (${profileResponse.status})`);
  const { data: profile } = await profileResponse.json();
  requireCheck(profile?.native_language === expectedNativeLanguage, 'Native language differs from test fixture');

  const snapshotResponse = await request(new URL('/api/v1/goals/active', baseUrl), { headers });
  requireCheck(snapshotResponse.ok, `Snapshot failed (${snapshotResponse.status})`);
  const { data: snapshot } = await snapshotResponse.json();
  requireCheck(snapshot?.goal && snapshot.access?.membership?.active === expectedMember, 'Membership snapshot differs from test fixture');
  const scenarios = snapshot.goal.scenarios;
  requireCheck(snapshot.goal.target_language === expectedTargetLanguage, 'Goal language differs from test fixture');
  requireCheck(Array.isArray(scenarios) && scenarios.length === expectedScenarioCount
    && snapshot.access.unlocked_count === expectedUnlockedCount, 'Scene counts differ from test fixture');
  requireCheck(snapshot.goal.access?.membership?.active === expectedMember
    && snapshot.goal.access?.unlocked_count === expectedUnlockedCount
    && snapshot.access.scenarios?.length === expectedScenarioCount
    && snapshot.goal.access.scenarios?.length === expectedScenarioCount, 'Goal and top-level authority disagree');
  for (const [index, scenario] of scenarios.entries()) {
    const matches = snapshot.goal.access?.scenarios?.filter(item => item.title === scenario.title);
    const topMatches = snapshot.access.scenarios.filter(item => item.title === scenario.title);
    requireCheck(matches?.length === 1 && typeof matches[0].allowed === 'boolean', 'Scenario access contract incomplete');
    requireCheck(matches[0].allowed === (index < expectedUnlockedCount)
      && topMatches.length === 1 && topMatches[0].allowed === matches[0].allowed, 'Scenario permissions differ from expected authority');
    for (const task of scenario.tasks || []) {
      requireCheck(task.id != null && Number.isInteger(task.scoring_generation)
        && Number.isFinite(task.score) && Number.isInteger(task.interaction_count), 'Task scoring contract incomplete');
    }
  }
  const key = randomUUID();
  const synthesize = () => request(new URL('/api/v1/ai/tts', baseUrl), { method: 'POST',
    headers: { ...headers, 'Idempotency-Key': key }, body: JSON.stringify({ text: 'こんにちは', voice: 'Serena' }) });
  const audio = await synthesize();
  requireCheck(audio.ok && audio.headers.get('content-type')?.startsWith('audio/'), `TTS failed (${audio.status})`);
  const bytes = Buffer.from(await audio.arrayBuffer());
  requireCheck(bytes.length > 0, 'TTS returned empty audio');
  const replay = await synthesize();
  requireCheck(replay.ok && bytes.equals(Buffer.from(await replay.arrayBuffer())), 'Audio idempotent replay differs');
  return { runtime_matches: true, authenticated_audio: true, audio_replay: true, scenario_count: scenarios.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const member = process.env.RELEASE_EXPECT_MEMBERSHIP;
  verifyTtsAccess({ baseUrl: process.env.RELEASE_BASE_URL, healthUrl: process.env.RELEASE_DEVELOPER_HEALTH_URL,
    email: process.env.RELEASE_TEST_EMAIL, password: process.env.RELEASE_TEST_PASSWORD,
    expectedMember: member === 'active' ? true : member === 'free' ? false : undefined,
    expectedNativeLanguage: process.env.RELEASE_EXPECT_NATIVE_LANGUAGE,
    expectedTargetLanguage: process.env.RELEASE_EXPECT_TARGET_LANGUAGE,
    expectedScenarioCount: Number(process.env.RELEASE_EXPECT_SCENARIOS),
    expectedUnlockedCount: Number(process.env.RELEASE_EXPECT_UNLOCKED),
    expectedDigest: buildIdentity.sourceIdentity().source_sha256,
  }).then(result => console.log(JSON.stringify(result))).catch(err => { console.error(err.message); process.exitCode = 1; });
}
