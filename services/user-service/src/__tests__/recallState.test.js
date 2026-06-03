const db = require('../models/db');

jest.mock('../models/db', () => ({ query: jest.fn() }));
jest.mock('../utils/notificationPublisher', () => ({ publishNotification: jest.fn() }));

const userController = require('../controllers/userController');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return res;
}

const reqWith = (id = 'u1') => ({ user: { id } });

// ─── getRecallDailyState ──────────────────────────────────────────────

describe('getRecallDailyState', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns existing row values', async () => {
    db.query.mockResolvedValue({ rows: [{ switch_count: 2, completed: true }] });

    const res = mockRes();
    await userController.getRecallDailyState(reqWith('u1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { switch_count: 2, completed: true } });
    expect(db.query.mock.calls[0][0]).toContain('FROM recall_daily_state');
    expect(db.query.mock.calls[0][0]).toContain('state_date = CURRENT_DATE');
    expect(db.query.mock.calls[0][1]).toEqual(['u1']);
  });

  test('returns defaults when no row exists', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = mockRes();
    await userController.getRecallDailyState(reqWith('u1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { switch_count: 0, completed: false } });
  });

  test('returns 500 on db error', async () => {
    db.query.mockRejectedValue(new Error('connection refused'));

    const res = mockRes();
    await userController.getRecallDailyState(reqWith('u1'), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ─── incrementRecallSwitch ────────────────────────────────────────────

describe('incrementRecallSwitch', () => {
  afterEach(() => jest.clearAllMocks());

  test('UPSERT returns incremented switch_count', async () => {
    db.query.mockResolvedValue({ rows: [{ switch_count: 1 }] });

    const res = mockRes();
    await userController.incrementRecallSwitch(reqWith('u1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { switch_count: 1 } });
    expect(db.query.mock.calls[0][0]).toContain('INSERT INTO recall_daily_state');
    expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT');
    expect(db.query.mock.calls[0][0]).toContain('switch_count = recall_daily_state.switch_count + 1');
    expect(db.query.mock.calls[0][0]).toContain('RETURNING switch_count');
    expect(db.query.mock.calls[0][1]).toEqual(['u1']);
  });

  test('returns server count on subsequent switch', async () => {
    db.query.mockResolvedValue({ rows: [{ switch_count: 3 }] });

    const res = mockRes();
    await userController.incrementRecallSwitch(reqWith('u1'), res);

    expect(res.body.data.switch_count).toBe(3);
  });

  test('returns 500 on db error', async () => {
    db.query.mockRejectedValue(new Error('db down'));

    const res = mockRes();
    await userController.incrementRecallSwitch(reqWith('u1'), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ─── markRecallCompleted ──────────────────────────────────────────────

describe('markRecallCompleted', () => {
  afterEach(() => jest.clearAllMocks());

  test('UPSERT sets completed=true and returns completed:true', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = mockRes();
    await userController.markRecallCompleted(reqWith('u1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { completed: true } });
    expect(db.query.mock.calls[0][0]).toContain('INSERT INTO recall_daily_state');
    expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT');
    expect(db.query.mock.calls[0][0]).toContain('completed = TRUE');
    expect(db.query.mock.calls[0][1]).toEqual(['u1']);
  });

  test('returns 500 on db error', async () => {
    db.query.mockRejectedValue(new Error('boom'));

    const res = mockRes();
    await userController.markRecallCompleted(reqWith('u1'), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
