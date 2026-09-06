jest.mock('../utils/redisClient', () => ({ eval: jest.fn(), setex: jest.fn() }));
const crypto = require('crypto');
const redis = require('../utils/redisClient');
const aliyun = require('../utils/aliyunSms');
const twilio = require('../utils/twilioVerify');
const phone = '+8613800138000';
const keys = ['ALIYUN_SMS_ACCESS_KEY_ID', 'ALIYUN_SMS_ACCESS_KEY_SECRET', 'ALIYUN_SMS_SIGN_NAME', 'ALIYUN_SMS_TEMPLATE_CODE', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  keys.forEach(key => { process.env[key] = crypto.randomBytes(16).toString('hex'); });
  global.fetch = jest.fn();
  redis.setex.mockResolvedValue('OK');
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  keys.forEach(key => { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; });
  global.fetch = originalFetch;
});

test.each([aliyun, twilio])('unconfigured supplier rejects fixed-code fallback', async provider => {
  keys.forEach(key => delete process.env[key]);
  expect(await provider.sendCode(phone)).toEqual({ sent: false, reason: 'not_configured' });
  expect(await provider.checkCode(phone, '000000')).toEqual({ ok: false, reason: 'not_configured' });
  expect(global.fetch).not.toHaveBeenCalled();
  expect(redis.eval).not.toHaveBeenCalled();
  expect(redis.setex).not.toHaveBeenCalled();
});

test('Aliyun stores a digest only after supplier acceptance and uses a bounded request', async () => {
  jest.spyOn(crypto, 'randomInt').mockReturnValue(123456);
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ Code: 'OK' }) });
  expect(await aliyun.sendCode(phone)).toEqual({ sent: true });
  const [url, options] = global.fetch.mock.calls[0];
  expect(new URL(url).searchParams.get('PhoneNumbers')).toBe('13800138000');
  expect(options.signal).toBeInstanceOf(AbortSignal);
  const [key, ttl, digest] = redis.setex.mock.calls[0];
  expect(key).not.toContain(phone);
  expect(ttl).toBe(300);
  expect(digest).toBe(crypto.createHmac('sha256', process.env.ALIYUN_SMS_ACCESS_KEY_SECRET).update(`${phone}:123456`).digest('hex'));
});

test.each(['rejected', 'timeout', 'invalid-json'])('Aliyun %s does not activate a code or log sensitive details', async kind => {
  const log = jest.spyOn(console, 'error');
  if (kind === 'timeout') global.fetch.mockRejectedValue(new Error(`Timeout ${phone}`));
  else global.fetch.mockResolvedValue({ ok: kind !== 'rejected', json: kind === 'invalid-json' ? async () => { throw new Error('JSON'); } : async () => ({ Code: 'FAIL', Message: phone }) });
  expect((await aliyun.sendCode(phone)).sent).toBe(false);
  expect(redis.setex).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

test('Aliyun Redis write failure is not successful delivery', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ Code: 'OK' }) });
  redis.setex.mockRejectedValue(new Error('Redis'));
  expect(await aliyun.sendCode(phone)).toEqual({ sent: false, reason: 'redis_error' });
});

test('Aliyun relies on atomic compare-and-delete, and fails closed on Redis failure', async () => {
  redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockRejectedValueOnce(new Error('Redis'));
  expect(await aliyun.checkCode(phone, '123456')).toEqual({ ok: true });
  expect(await aliyun.checkCode(phone, '123456')).toEqual({ ok: false });
  expect(await aliyun.checkCode(phone, '123456')).toEqual({ ok: false, reason: 'redis_error' });
});

test.each(['pending', 'failed', undefined])('Twilio send response status %s is checked', async status => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ status }) });
  expect((await twilio.sendCode('+14155552671')).sent).toBe(status === 'pending');
  expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

test.each(['approved', 'pending', 'expired'])('Twilio verification requires approved status (%s)', async status => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ status }) });
  expect((await twilio.checkCode('+14155552671', '123456')).ok).toBe(status === 'approved');
});

test('Twilio expired/replayed verification and network errors are denied without provider-body logging', async () => {
  const log = jest.spyOn(console, 'error');
  global.fetch.mockResolvedValueOnce({ ok: false, status: 404 }).mockRejectedValueOnce(new Error(phone));
  expect((await twilio.checkCode(phone, '123456')).ok).toBe(false);
  expect((await twilio.checkCode(phone, '123456')).ok).toBe(false);
  expect(log).not.toHaveBeenCalled();
});
