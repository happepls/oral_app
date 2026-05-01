const db = require('../models/db');

jest.mock('../models/db', () => ({
  query: jest.fn(),
}));

const User = require('../models/user');

describe('recordDailyQAPass', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns record on successful insert', async () => {
    const mockRecord = { id: 1, user_id: 'u1', pass_date: '2026-04-29', question_text: 'What is your hobby?' };
    db.query.mockResolvedValue({ rows: [mockRecord] });

    const result = await User.recordDailyQAPass('u1', 'What is your hobby?');
    expect(result).toEqual(mockRecord);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain('INSERT INTO daily_qa_passes');
    expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT');
    expect(db.query.mock.calls[0][1]).toEqual(['u1', 'What is your hobby?']);
  });

  test('returns null on conflict (idempotent)', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const result = await User.recordDailyQAPass('u1', 'What is your hobby?');
    expect(result).toBeNull();
  });
});

describe('getDailyQAPassStatus', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns passed=true when record exists', async () => {
    const mockRecord = { id: 1, pass_date: '2026-04-29', question_text: 'Hello?', created_at: new Date() };
    db.query.mockResolvedValue({ rows: [mockRecord] });

    const result = await User.getDailyQAPassStatus('u1');
    expect(result).toEqual({ passed: true, record: mockRecord });
    expect(db.query.mock.calls[0][0]).toContain('pass_date = CURRENT_DATE');
    expect(db.query.mock.calls[0][1]).toEqual(['u1']);
  });

  test('returns passed=false when no record', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const result = await User.getDailyQAPassStatus('u1');
    expect(result).toEqual({ passed: false, record: null });
  });
});
