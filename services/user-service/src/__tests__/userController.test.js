const bcrypt = require('bcryptjs');

jest.mock('../models/db', () => ({ query: jest.fn() }));
jest.mock('../utils/notificationPublisher', () => ({ publishNotification: jest.fn() }));
jest.mock('../utils/redisClient', () => ({
  get: jest.fn(),
  eval: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
}));

const User = require('../models/user');
const userController = require('../controllers/userController');
const redis = require('../utils/redisClient');

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

describe('confirmCompleteTask readiness capability', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  test('rejects a missing or stale readiness token before mutating the task', async () => {
    redis.get.mockResolvedValue('current-ready-token-1234567890');
    jest.spyOn(User, 'getTaskByIdForUser').mockResolvedValue({ id: 42, status: 'pending' });
    const complete = jest.spyOn(User, 'confirmCompleteTaskById');
    const req = { user: { id: 'u1' }, params: { id: '42' }, body: { ready_token: 'stale-ready-token-12345678901' } };
    const res = mockRes();

    await userController.confirmCompleteTask(req, res);

    expect(res.statusCode).toBe(409);
    expect(complete).not.toHaveBeenCalled();
  });

  test('accepts and consumes the task-bound readiness token after completion', async () => {
    const token = 'current-ready-token-1234567890';
    redis.get.mockResolvedValue(`4:12:${token}`);
    redis.eval.mockResolvedValue(1);
    jest.spyOn(User, 'getTaskByIdForUser').mockResolvedValue({ id: 42, status: 'pending' });
    jest.spyOn(User, 'confirmCompleteTaskById').mockResolvedValue({
      completed_task: { id: 42, status: 'completed' },
      next_task: { id: 43 },
      current_proficiency: 7,
    });
    jest.spyOn(User, 'evaluateAchievements').mockResolvedValue(undefined);
    const req = { user: { id: 'u1' }, params: { id: '42' }, body: { ready_token: token } };
    const res = mockRes();

    await userController.confirmCompleteTask(req, res);

    expect(res.statusCode).toBe(200);
    expect(User.confirmCompleteTaskById).toHaveBeenCalledWith('u1', '42', null);
    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(redis.eval.mock.calls[0]).toContain(`4:12:${token}`);
  });

  test('recovers an already-completed task when the original ACK was lost', async () => {
    jest.spyOn(User, 'getTaskByIdForUser').mockResolvedValue({ id: 42, status: 'completed' });
    jest.spyOn(User, 'confirmCompleteTaskById').mockResolvedValue({
      completed_task: { id: 42, status: 'completed' },
      next_task: { id: 43, status: 'pending' },
      current_proficiency: 33,
      already_completed: true,
    });
    const req = { user: { id: 'u1' }, params: { id: '42' }, body: {} };
    const res = mockRes();

    await userController.confirmCompleteTask(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.next_task.id).toBe(43);
    expect(redis.get).not.toHaveBeenCalled();
  });

  test('internal confirmation binds the service-authenticated websocket user id', async () => {
    const token = 'current-ready-token-1234567890';
    redis.get.mockResolvedValue(`0:9:${token}`);
    redis.eval.mockResolvedValue(1);
    jest.spyOn(User, 'getTaskByIdForUser').mockResolvedValue({ id: 42, status: 'pending' });
    jest.spyOn(User, 'confirmCompleteTaskById').mockResolvedValue({
      completed_task: { id: 42, status: 'completed' },
      next_task: { id: 43 },
      current_proficiency: 7,
    });
    jest.spyOn(User, 'evaluateAchievements').mockResolvedValue(undefined);
    const req = {
      params: { userId: 'trusted-ws-user', id: '42' },
      body: { ready_token: token },
    };
    const res = mockRes();

    await userController.confirmCompleteTaskInternal(req, res);

    expect(res.statusCode).toBe(200);
    expect(User.getTaskByIdForUser).toHaveBeenCalledWith('trusted-ws-user', '42');
    expect(User.confirmCompleteTaskById).toHaveBeenCalledWith('trusted-ws-user', '42', null);
  });
});

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
