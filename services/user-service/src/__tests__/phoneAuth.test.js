jest.mock('../models/db', () => ({ query: jest.fn() }));
jest.mock('../utils/notificationPublisher', () => ({ publishNotification: jest.fn() }));
jest.mock('../utils/redisClient', () => ({ eval: jest.fn(), setex: jest.fn() }));
jest.mock('../utils/aliyunSms', () => ({ isConfigured: jest.fn(), sendCode: jest.fn(), checkCode: jest.fn() }));
jest.mock('../utils/twilioVerify', () => ({ isConfigured: jest.fn(), sendCode: jest.fn(), checkCode: jest.fn() }));

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const redis = require('../utils/redisClient');
const db = require('../models/db');
const User = require('../models/user');
const aliyun = require('../utils/aliyunSms');
const twilio = require('../utils/twilioVerify');
const controller = require('../controllers/userController');
// The auth middleware owns a periodic blacklist cleanup; this unit suite
// tests requests, not its background scheduler.
jest.useFakeTimers();
const { protect } = require('../middleware/enhancedAuthMiddleware');
jest.clearAllTimers();
jest.useRealTimers();
const { normalizePhone } = require('../utils/phoneAuth');
const phone = '+8613800138000';
const originalSecret = process.env.JWT_SECRET;

function response() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), cookie: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  redis.eval.mockResolvedValue(0);
  for (const provider of [aliyun, twilio]) {
    provider.isConfigured.mockReturnValue(true);
    provider.sendCode.mockResolvedValue({ sent: true });
    provider.checkCode.mockResolvedValue({ ok: true });
  }
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

test.each([null, {}, 1234, '+86', '+86123', '+86013800138000', '+8612800138000', '+1234567890123456', '+86<script>'])('rejects malformed phone %p', value => {
  expect(normalizePhone(value)).toBeNull();
});

test.each([[' +8613800138000 ', aliyun, phone], ['+14155552671', twilio, '+14155552671']])('routes %s to its configured provider', async (input, provider, normalized) => {
  const res = response();
  await controller.sendPhoneCode({ body: { phone: input } }, res);
  expect(provider.sendCode).toHaveBeenCalledWith(normalized);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, retryAfter: 60 }));
});

test('missing configuration cannot claim SMS delivery or authenticate with the old fixed code', async () => {
  aliyun.isConfigured.mockReturnValue(false);
  for (const fn of [controller.sendPhoneCode, controller.phoneLogin]) {
    const res = response();
    await fn({ body: { phone, code: '000000' } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.cookie).not.toHaveBeenCalled();
  }
  expect(aliyun.sendCode).not.toHaveBeenCalled();
  expect(aliyun.checkCode).not.toHaveBeenCalled();
});

test.each([controller.sendPhoneCode, controller.phoneLogin])('rate limits before any supplier call', async fn => {
  redis.eval.mockResolvedValue(48);
  const res = response();
  await fn({ body: { phone, code: '123456' } }, res);
  expect(res.status).toHaveBeenCalledWith(429);
  expect(res.set).toHaveBeenCalledWith('Retry-After', '48');
  expect(aliyun.sendCode).not.toHaveBeenCalled();
  expect(aliyun.checkCode).not.toHaveBeenCalled();
});

test.each([controller.sendPhoneCode, controller.phoneLogin])('Redis failure denies the request', async fn => {
  redis.eval.mockRejectedValue(new Error('Redis unavailable'));
  const res = response();
  await fn({ body: { phone, code: '123456' } }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.cookie).not.toHaveBeenCalled();
  expect(aliyun.sendCode).not.toHaveBeenCalled();
  expect(aliyun.checkCode).not.toHaveBeenCalled();
});

test('supplier failure does not report success', async () => {
  aliyun.sendCode.mockResolvedValue({ sent: false, devMode: true });
  const res = response();
  await controller.sendPhoneCode({ body: { phone } }, res);
  expect(res.status).toHaveBeenCalledWith(502);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
});

test.each(['1234', '1234567', 'abcdef', 123456, {}, null])('invalid code %p never reaches verification', async code => {
  const res = response();
  await controller.phoneLogin({ body: { phone, code } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(aliyun.checkCode).not.toHaveBeenCalled();
});

test('wrong, expired or consumed codes cannot create a user or session', async () => {
  aliyun.checkCode.mockResolvedValue({ ok: false });
  const create = jest.spyOn(User, 'findOrCreateByPhone');
  const res = response();
  await controller.phoneLogin({ body: { phone, code: '123456' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.cookie).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

test('verified registration issues a JWT usable by cookie and Bearer authentication', async () => {
  const user = { id: crypto.randomUUID(), phone, native_language: null };
  jest.spyOn(User, 'findOrCreateByPhone').mockResolvedValue(user);
  jest.spyOn(User, 'findById').mockResolvedValue(user);
  const res = response();
  await controller.phoneLogin({ body: { phone, code: '123456' } }, res);
  expect(User.findOrCreateByPhone).toHaveBeenCalledWith(phone);
  const [name, token, options] = res.cookie.mock.calls[0];
  expect(name).toBe('accessToken');
  expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api' });
  expect(jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'oral-app', audience: 'oral-app-users' })).toMatchObject({ id: user.id, type: 'access' });
  for (const req of [{ cookies: { accessToken: token }, headers: {} }, { headers: { authorization: `Bearer ${token}` } }]) {
    const next = jest.fn();
    await protect(req, response(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe(user.id);
  }
});

test.each(['missing', 'expired', 'other-service-secret'])('rejects %s authentication', async kind => {
  const secret = kind === 'other-service-secret' ? crypto.randomBytes(32).toString('hex') : process.env.JWT_SECRET;
  const token = jwt.sign({ id: 'u1', type: 'access' }, secret, { expiresIn: kind === 'expired' ? -1 : 60, issuer: 'oral-app', audience: 'oral-app-users' });
  const res = response(); const next = jest.fn();
  await protect({ cookies: kind === 'missing' ? {} : { accessToken: token }, headers: {} }, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('same phone created concurrently returns the existing account', async () => {
  const user = { id: 'one-account', phone };
  db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [user] });
  expect(await User.findOrCreateByPhone(phone)).toEqual(user);
  expect(db.query.mock.calls[1][0]).toContain('ON CONFLICT (phone) DO NOTHING');
});

test('an existing phone account is not replaced', async () => {
  db.query.mockResolvedValueOnce({ rows: [{ id: 'existing', phone }] });
  expect(await User.findOrCreateByPhone(phone)).toMatchObject({ id: 'existing' });
  expect(db.query).toHaveBeenCalledTimes(1);
});
