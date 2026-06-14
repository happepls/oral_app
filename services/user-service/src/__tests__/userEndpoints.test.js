// Controller-level tests for previously-uncovered endpoints in userController.js:
//   - recordPracticeTime  (POST /api/users/practice-time)
//   - getDailyProgress    (GET  /api/users/daily-progress)
//   - submitFeedback      (POST /api/users/feedback)
//
// Mirrors userController.test.js: mock the pg layer (../models/db) and spy on the
// User model static methods so the controller branch logic (validation, auto
// check-in, error mapping) is exercised in isolation without a real database.

jest.mock('../models/db', () => ({ query: jest.fn() }));
jest.mock('../utils/notificationPublisher', () => ({ publishNotification: jest.fn() }));

const db = require('../models/db');
const User = require('../models/user');
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

afterEach(() => {
  jest.restoreAllMocks();
  db.query.mockReset();
});

// ─── recordPracticeTime ──────────────────────────────────────────────

describe('recordPracticeTime', () => {
  test('400 when minutes is missing or non-positive', async () => {
    const res = mockRes();
    await userController.recordPracticeTime({ body: {}, user: { id: 'u1' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid minutes');

    const res2 = mockRes();
    await userController.recordPracticeTime({ body: { minutes: 0 }, user: { id: 'u1' } }, res2);
    expect(res2.statusCode).toBe(400);
  });

  test('records time without auto-checkin when below daily goal', async () => {
    jest.spyOn(User, 'recordPracticeTime').mockResolvedValue({ minutes: 5 });
    const checkinSpy = jest.spyOn(User, 'checkin').mockResolvedValue({});
    // controller reads daily_practice_goal via db.query
    db.query.mockResolvedValue({ rows: [{ daily_practice_goal: 15 }] });

    const req = { body: { minutes: 5 }, user: { id: 'u1' } };
    const res = mockRes();
    await userController.recordPracticeTime(req, res);

    expect(User.recordPracticeTime).toHaveBeenCalledWith('u1', 5);
    expect(res.body).toEqual({ totalMinutes: 5, goal: 15, autoCheckin: null });
    expect(checkinSpy).not.toHaveBeenCalled();
  });

  test('triggers auto-checkin when accumulated minutes reach the goal', async () => {
    jest.spyOn(User, 'recordPracticeTime').mockResolvedValue({ minutes: 20 });
    const checkinSpy = jest.spyOn(User, 'checkin').mockResolvedValue({ streak: 3 });
    db.query.mockResolvedValue({ rows: [{ daily_practice_goal: 15 }] });

    const req = { body: { minutes: 20.4 }, user: { id: 'u1' } };
    const res = mockRes();
    await userController.recordPracticeTime(req, res);

    // minutes are rounded before persisting
    expect(User.recordPracticeTime).toHaveBeenCalledWith('u1', 20);
    expect(checkinSpy).toHaveBeenCalledWith('u1');
    expect(res.body).toEqual({ totalMinutes: 20, goal: 15, autoCheckin: { streak: 3 } });
  });

  test('500 when the model throws', async () => {
    jest.spyOn(User, 'recordPracticeTime').mockRejectedValue(new Error('db down'));
    const req = { body: { minutes: 10 }, user: { id: 'u1' } };
    const res = mockRes();
    await userController.recordPracticeTime(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('db down');
  });
});

// ─── getDailyProgress ────────────────────────────────────────────────

describe('getDailyProgress', () => {
  test('returns the progress payload from the model', async () => {
    const progress = {
      recallCompleted: false,
      qaCompleted: true,
      scenarioCompleted: false,
      practiceMinutes: 10,
      practiceGoal: 15,
      streak: 2,
    };
    jest.spyOn(User, 'getDailyProgress').mockResolvedValue(progress);

    const req = { user: { id: 'u1' } };
    const res = mockRes();
    await userController.getDailyProgress(req, res);

    expect(User.getDailyProgress).toHaveBeenCalledWith('u1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(progress);
  });

  test('500 when the model throws', async () => {
    jest.spyOn(User, 'getDailyProgress').mockRejectedValue(new Error('query failed'));
    const req = { user: { id: 'u1' } };
    const res = mockRes();
    await userController.getDailyProgress(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('query failed');
  });
});

// ─── submitFeedback ──────────────────────────────────────────────────

describe('submitFeedback', () => {
  test('400 when message is empty or whitespace-only', async () => {
    const res = mockRes();
    await userController.submitFeedback({ body: { category: 'bug' }, user: { id: 'u1' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Message required');

    const res2 = mockRes();
    await userController.submitFeedback({ body: { message: '   ' }, user: { id: 'u1' } }, res2);
    expect(res2.statusCode).toBe(400);
  });

  test('persists feedback and defaults category to "other"', async () => {
    const created = { id: 7, user_id: 'u1', category: 'other', message: 'nice app' };
    jest.spyOn(User, 'submitFeedback').mockResolvedValue(created);

    const req = { body: { message: '  nice app  ' }, user: { id: 'u1' } };
    const res = mockRes();
    await userController.submitFeedback(req, res);

    // category defaults to 'other', message is trimmed
    expect(User.submitFeedback).toHaveBeenCalledWith('u1', 'other', 'nice app');
    expect(res.body).toEqual({ success: true, feedback: created });
  });

  test('passes through an explicit category', async () => {
    jest.spyOn(User, 'submitFeedback').mockResolvedValue({ id: 8 });
    const req = { body: { category: 'bug', message: 'crash on save' }, user: { id: 'u1' } };
    const res = mockRes();
    await userController.submitFeedback(req, res);
    expect(User.submitFeedback).toHaveBeenCalledWith('u1', 'bug', 'crash on save');
  });

  test('500 when the model throws', async () => {
    jest.spyOn(User, 'submitFeedback').mockRejectedValue(new Error('insert failed'));
    const req = { body: { message: 'hi' }, user: { id: 'u1' } };
    const res = mockRes();
    await userController.submitFeedback(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('insert failed');
  });
});
