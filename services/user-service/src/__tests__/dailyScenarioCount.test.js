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

// ─── getDailyScenarioCount ────────────────────────────────────────────

describe('getDailyScenarioCount', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns distinct scenario count for today', async () => {
    db.query.mockResolvedValue({ rows: [{ count: '3' }] });

    const res = mockRes();
    await userController.getDailyScenarioCount(reqWith('u1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { count: 3 } });
    expect(db.query.mock.calls[0][0]).toContain('COUNT(DISTINCT scenario_title)');
    expect(db.query.mock.calls[0][0]).toContain('FROM user_tasks');
    expect(db.query.mock.calls[0][0]).toContain("status = 'completed'");
    expect(db.query.mock.calls[0][0]).toContain('completed_at >= CURRENT_DATE');
    expect(db.query.mock.calls[0][1]).toEqual(['u1']);
  });

  test('returns 0 when no scenarios completed today', async () => {
    db.query.mockResolvedValue({ rows: [{ count: '0' }] });

    const res = mockRes();
    await userController.getDailyScenarioCount(reqWith('u1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { count: 0 } });
  });

  test('returns 500 on db error', async () => {
    db.query.mockRejectedValue(new Error('connection refused'));

    const res = mockRes();
    await userController.getDailyScenarioCount(reqWith('u1'), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
