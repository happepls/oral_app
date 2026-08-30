import {
  calcScenarioProgress,
  getScenarioPracticeStatus,
  getTaskPracticeProgress,
} from '../utils/scenarioProgress';

describe('scenario practice progress', () => {
  test('keeps untouched pending tasks in not-started', () => {
    const scenario = { tasks: [
      { status: 'pending', score: 0, interaction_count: 0 },
      { status: 'pending', score: 0, interaction_count: 0 },
    ] };
    expect(calcScenarioProgress(scenario)).toBe(0);
    expect(getScenarioPracticeStatus(scenario)).toBe('not-started');
  });

  test('treats a scored unfinished task as in-progress', () => {
    const scenario = { tasks: [
      { status: 'pending', score: 1, interaction_count: 1 },
      { status: 'pending', score: 0, interaction_count: 0 },
      { status: 'pending', score: 0, interaction_count: 0 },
    ] };
    expect(calcScenarioProgress(scenario)).toBe(4);
    expect(getScenarioPracticeStatus(scenario)).toBe('in-progress');
  });

  test('does not award visible progress for unscored interactions', () => {
    const task = { status: 'pending', score: 0, interaction_count: 1 };
    expect(getTaskPracticeProgress(task)).toBe(0);
    expect(calcScenarioProgress({ tasks: [task, { status: 'pending' }] })).toBe(0);
  });

  test('calculates completed tasks as full task progress', () => {
    const scenario = { tasks: [
      { status: 'completed', score: 9 },
      { status: 'pending', score: 0 },
      { status: 'pending', score: 0 },
    ] };
    expect(calcScenarioProgress(scenario)).toBe(33);
    expect(getScenarioPracticeStatus(scenario)).toBe('in-progress');
  });

  test('only marks a scenario completed when every task is complete', () => {
    const scenario = { tasks: [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
    ] };
    expect(calcScenarioProgress(scenario)).toBe(100);
    expect(getScenarioPracticeStatus(scenario)).toBe('completed');
  });
});
