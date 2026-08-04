jest.mock('../models/db', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const db = require('../models/db');
const User = require('../models/user');

describe('User.getDailyProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(User, 'getDailyQAPassStatus').mockResolvedValue({ passed: false });
    jest.spyOn(User, 'getDailyPracticeTime').mockResolvedValue(6);
    jest.spyOn(User, 'getCheckinStats').mockResolvedValue({
      checkedInToday: false,
      currentStreak: 2,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockRemainingQueries(recallRows) {
    db.query
      .mockResolvedValueOnce({ rows: recallRows })
      .mockResolvedValueOnce({ rows: [{ completed: false }] })
      .mockResolvedValueOnce({ rows: [{ daily_practice_goal: 15 }] })
      .mockResolvedValueOnce({ rows: [{ days: '3' }] })
      .mockResolvedValueOnce({ rows: [{ total: '24' }] });
  }

  test('reports recall completed from today recall_daily_state row', async () => {
    mockRemainingQueries([{ completed: true }]);

    const progress = await User.getDailyProgress('user-1');

    expect(progress.recallCompleted).toBe(true);
    expect(db.query.mock.calls[0][0]).toContain('FROM recall_daily_state');
    expect(db.query.mock.calls[0][0]).toContain('state_date = CURRENT_DATE');
    expect(db.query.mock.calls[0][1]).toEqual(['user-1']);
  });

  test('reports recall incomplete when today has no recall row', async () => {
    mockRemainingQueries([]);

    const progress = await User.getDailyProgress('user-1');

    expect(progress.recallCompleted).toBe(false);
  });
});
