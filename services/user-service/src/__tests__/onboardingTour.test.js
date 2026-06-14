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

// ─── getOnboardingTour ────────────────────────────────────────────────

describe('getOnboardingTour', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns completed=true when row flag is set', async () => {
    db.query.mockResolvedValue({ rows: [{ onboarding_tour_completed: true }] });

    const res = mockRes();
    await userController.getOnboardingTour(reqWith('u1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { completed: true } });
    expect(db.query.mock.calls[0][0]).toContain('onboarding_tour_completed');
    expect(db.query.mock.calls[0][0]).toContain('FROM users');
    expect(db.query.mock.calls[0][1]).toEqual(['u1']);
  });

  test('returns completed=false when flag is false', async () => {
    db.query.mockResolvedValue({ rows: [{ onboarding_tour_completed: false }] });

    const res = mockRes();
    await userController.getOnboardingTour(reqWith('u1'), res);

    expect(res.body).toEqual({ success: true, data: { completed: false } });
  });

  test('returns completed=false when no row exists', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = mockRes();
    await userController.getOnboardingTour(reqWith('u1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { completed: false } });
  });

  test('returns 500 on db error', async () => {
    db.query.mockRejectedValue(new Error('connection refused'));

    const res = mockRes();
    await userController.getOnboardingTour(reqWith('u1'), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ─── markOnboardingTourComplete ───────────────────────────────────────

describe('markOnboardingTourComplete', () => {
  afterEach(() => jest.clearAllMocks());

  test('UPDATE sets flag TRUE and returns completed:true (idempotent)', async () => {
    db.query.mockResolvedValue({ rows: [{ onboarding_tour_completed: true }] });

    const res = mockRes();
    await userController.markOnboardingTourComplete(reqWith('u1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { completed: true } });
    expect(db.query.mock.calls[0][0]).toContain('UPDATE users');
    expect(db.query.mock.calls[0][0]).toContain('onboarding_tour_completed = TRUE');
    expect(db.query.mock.calls[0][0]).toContain('WHERE id = $1');
    expect(db.query.mock.calls[0][1]).toEqual(['u1']);
  });

  test('returns completed:true even when UPDATE matches no rows', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = mockRes();
    await userController.markOnboardingTourComplete(reqWith('u1'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { completed: true } });
  });

  test('returns 500 on db error', async () => {
    db.query.mockRejectedValue(new Error('boom'));

    const res = mockRes();
    await userController.markOnboardingTourComplete(reqWith('u1'), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
