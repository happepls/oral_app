import {
  getLocalDateKey,
  pickProgressAwareRecallScenario,
} from '../utils/dailyTaskMaterial';

const scenario = (title, status = 'in_progress') => ({
  title,
  tasks: [{ text: `${title} task`, status }],
});

describe('daily recall material selection', () => {
  test('uses a local calendar date key', () => {
    expect(getLocalDateKey(new Date(2026, 7, 2, 0, 5))).toBe('2026-08-02');
  });

  test('prioritizes scenarios that still have unfinished work', () => {
    const completed = scenario('Completed', 'completed');
    const pending = scenario('Pending');

    expect(pickProgressAwareRecallScenario(
      [completed, pending],
      { goalId: 7, dateKey: '2026-08-02' }
    )).toBe(pending);
  });

  test('is stable within a day and rotates on the next day', () => {
    const scenarios = [scenario('A'), scenario('B'), scenario('C')];
    const options = { goalId: 7, dateKey: '2026-08-02', variant: 0 };

    const first = pickProgressAwareRecallScenario(scenarios, options);
    expect(pickProgressAwareRecallScenario(scenarios, options)).toBe(first);
    expect(pickProgressAwareRecallScenario(
      scenarios,
      { ...options, dateKey: '2026-08-03' }
    )).not.toBe(first);
  });

  test('manual variant rotates material without changing the date', () => {
    const scenarios = [scenario('A'), scenario('B'), scenario('C')];
    const base = { goalId: 'goal-a', dateKey: '2026-08-02' };

    expect(pickProgressAwareRecallScenario(scenarios, { ...base, variant: 1 }))
      .not.toBe(pickProgressAwareRecallScenario(scenarios, { ...base, variant: 0 }));
  });

  test('reviews completed scenarios when no pending scenario remains', () => {
    const scenarios = [scenario('A', 'completed'), scenario('B', 'completed')];
    expect(scenarios).toContain(pickProgressAwareRecallScenario(
      scenarios,
      { goalId: 7, dateKey: '2026-08-02' }
    ));
  });
});
