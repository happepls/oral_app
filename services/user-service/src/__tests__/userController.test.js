const bcrypt = require('bcryptjs');

jest.mock('../models/db', () => ({ query: jest.fn() }));
jest.mock('../utils/notificationPublisher', () => ({ publishNotification: jest.fn() }));

const User = require('../models/user');
const userController = require('../controllers/userController');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    cookies: {},
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    cookie(name, value, opts) { this.cookies[name] = value; return this; },
  };
  return res;
}

// ─── Login: null-password (Google OAuth user) ────────────────────────

describe('login – null-password path', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns 401 when user has no password (OAuth-only account)', async () => {
    jest.spyOn(User, 'findByEmail').mockResolvedValue({
      id: 'u1', email: 'oauth@example.com', username: 'oauthuser'
      // password 字段不存在 — 模拟 Google OAuth 用户
    });

    const req = { body: { email: 'oauth@example.com', password: 'anything' } };
    const res = mockRes();

    await userController.login(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid credentials.');
    expect(res.cookies.accessToken).toBeUndefined();
  });

  test('returns 401 when user.password is explicitly null', async () => {
    jest.spyOn(User, 'findByEmail').mockResolvedValue({
      id: 'u2', email: 'oauth2@example.com', username: 'oauthuser2', password: null
    });

    const req = { body: { email: 'oauth2@example.com', password: 'anything' } };
    const res = mockRes();

    await userController.login(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('does not call bcrypt.compare when password is null', async () => {
    jest.spyOn(User, 'findByEmail').mockResolvedValue({
      id: 'u3', email: 'nopass@example.com', username: 'nopass'
    });
    const compareSpy = jest.spyOn(bcrypt, 'compare');

    const req = { body: { email: 'nopass@example.com', password: 'test' } };
    const res = mockRes();

    await userController.login(req, res);

    expect(compareSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  test('succeeds when password exists and matches', async () => {
    const hashed = await bcrypt.hash('correct', 10);
    jest.spyOn(User, 'findByEmail').mockResolvedValue({
      id: 'u4', email: 'local@example.com', username: 'localuser', password: hashed
    });

    process.env.JWT_SECRET = 'test-secret';
    const req = { body: { email: 'local@example.com', password: 'correct' } };
    const res = mockRes();

    await userController.login(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.cookies.accessToken).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined();
  });
});

// ─── Register: duplicate key error handling ──────────────────────────

describe('register – duplicate key handling', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns 400 when email already exists (pre-check)', async () => {
    jest.spyOn(User, 'findByEmail').mockResolvedValue({
      id: 'existing', email: 'dup@example.com'
    });

    const req = { body: { username: 'newuser', email: 'dup@example.com', password: 'Test123!' } };
    const res = mockRes();

    await userController.register(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('already exists');
  });

  test('returns 400 with username message on 23505 username constraint', async () => {
    jest.spyOn(User, 'findByEmail').mockResolvedValue(null);
    jest.spyOn(User, 'create').mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        detail: 'Key (username)=(taken) already exists.'
      })
    );

    const req = { body: { username: 'taken', email: 'new@example.com', password: 'Test123!' } };
    const res = mockRes();

    await userController.register(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('用户名');
  });

  test('returns 400 with email message on 23505 email constraint', async () => {
    jest.spyOn(User, 'findByEmail').mockResolvedValue(null);
    jest.spyOn(User, 'create').mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        detail: 'Key (email)=(dup@example.com) already exists.'
      })
    );

    const req = { body: { username: 'newuser', email: 'dup@example.com', password: 'Test123!' } };
    const res = mockRes();

    await userController.register(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('邮箱');
  });

  test('returns 400 with generic message on 23505 without detail', async () => {
    jest.spyOn(User, 'findByEmail').mockResolvedValue(null);
    jest.spyOn(User, 'create').mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' })
    );

    const req = { body: { username: 'user', email: 'u@example.com', password: 'Test123!' } };
    const res = mockRes();

    await userController.register(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('重复');
  });

  test('returns 500 on non-duplicate database errors', async () => {
    jest.spyOn(User, 'findByEmail').mockResolvedValue(null);
    jest.spyOn(User, 'create').mockRejectedValue(new Error('connection refused'));

    const req = { body: { username: 'user', email: 'u@example.com', password: 'Test123!' } };
    const res = mockRes();

    await userController.register(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toContain('Server error');
  });
});
