jest.mock('../models/db', () => ({ query: jest.fn() }));
jest.mock('../utils/notificationPublisher', () => ({ publishNotification: jest.fn() }));
const db = require('../models/db');
const User = require('../models/user');

const task = { id: 42, goal_id: 7, user_id: 'u1', scenario_title: 'Cafe',
  task_description: 'Old', score: 9, interaction_count: 27, scoring_generation: 3, status: 'pending' };
beforeEach(() => jest.resetAllMocks());

test.each([0, 8])('persisted score %i cannot complete despite caller generation', async score => {
  db.query.mockResolvedValueOnce({ rows: [{ ...task, score }] });
  expect((await User.confirmCompleteTaskById('u1', 42, 'scene_theater', 3)).error).toBe('not_ready');
  expect(db.query).toHaveBeenCalledTimes(1);
});

test('old generation cannot complete a reset task that has reached nine again', async () => {
  db.query.mockResolvedValueOnce({ rows: [{ ...task, scoring_generation: 4 }] });
  expect((await User.confirmCompleteTaskById('u1', 42, 'scene_theater', 3)).error).toBe('stale_generation');
  expect(db.query).toHaveBeenCalledTimes(1);
});

test('reset between read and conditional update cannot be mistaken for completion', async () => {
  db.query.mockResolvedValueOnce({ rows: [task] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ ...task, scoring_generation: 4, score: 0 }] });
  expect((await User.confirmCompleteTaskById('u1', 42, 'scene_theater', 3)).error).toBe('stale_generation');
  expect(db.query.mock.calls[1][1]).toEqual([42, 'scene_theater', 'u1', 3]);
  expect(db.query).toHaveBeenCalledTimes(3);
});

test.each([false, true])('earned completion or lost-ACK replay preserves next task generation (replay=%s)', async replay => {
  db.query.mockResolvedValueOnce({ rows: [{ ...task, status: replay ? 'completed' : 'pending' }] });
  if (!replay) db.query.mockResolvedValueOnce({ rows: [{ ...task, status: 'completed' }] });
  db.query.mockResolvedValueOnce({ rows: [{ total: '2', completed: '1' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 43, task_description: 'New', scenario_title: 'Cafe',
      status: 'pending', score: 1, interaction_count: 3, scoring_generation: 5 }] });
  const result = await User.confirmCompleteTaskById('u1', 42, 'scene_theater', 3);
  expect(result.completed_task.status).toBe('completed');
  expect(result.current_proficiency).toBe(50);
  expect(result.next_task).toMatchObject({ id: 43, text: 'New', scoring_generation: 5, interaction_count: 3 });
  expect(result.already_completed).toBe(replay);
});
