/**
 * Tests for Goals.js pure logic:
 * - getGoalProgress: GoalCard progress calc (completed scenes / total → pct)
 * - toggleExpanded: the scenario collapse/expand toggle reducer
 *
 * Both are replicated verbatim from Goals.js (getGoalProgress lines 15-22,
 * expand toggle `setExpanded(e => !e)` line ~100).
 */

// Replicate getGoalProgress from Goals.js
function getGoalProgress(goal) {
  if (!goal?.scenarios?.length) return { completed: 0, total: 0, pct: 0 };
  const total = goal.scenarios.length;
  const completed = goal.scenarios.filter(s =>
    s.tasks?.length > 0 && s.tasks.every(t => t.status === 'completed')
  ).length;
  return { completed, total, pct: Math.round((completed / total) * 100) };
}

// Replicate the expand toggle reducer from GoalCard: setExpanded(e => !e)
const toggleExpanded = (e) => !e;

// Helpers to build scenario fixtures
const doneScene = (title = 's') => ({ title, tasks: [{ status: 'completed' }, { status: 'completed' }] });
const partialScene = (title = 's') => ({ title, tasks: [{ status: 'completed' }, { status: 'in_progress' }] });
const emptyScene = (title = 's') => ({ title, tasks: [] });

describe('getGoalProgress', () => {
  test('null/undefined goal → all zero, no NaN', () => {
    const r = getGoalProgress(null);
    expect(r).toEqual({ completed: 0, total: 0, pct: 0 });
    expect(Number.isNaN(r.pct)).toBe(false);
  });

  test('goal with no scenarios → all zero, no NaN', () => {
    const r = getGoalProgress({ scenarios: [] });
    expect(r).toEqual({ completed: 0, total: 0, pct: 0 });
    expect(Number.isNaN(r.pct)).toBe(false);
  });

  test('goal with undefined scenarios → all zero, no NaN', () => {
    const r = getGoalProgress({});
    expect(r).toEqual({ completed: 0, total: 0, pct: 0 });
    expect(Number.isNaN(r.pct)).toBe(false);
  });

  test('full completion → pct 100', () => {
    const goal = { scenarios: [doneScene('a'), doneScene('b'), doneScene('c')] };
    expect(getGoalProgress(goal)).toEqual({ completed: 3, total: 3, pct: 100 });
  });

  test('half completion → pct 50', () => {
    const goal = { scenarios: [doneScene('a'), partialScene('b')] };
    expect(getGoalProgress(goal)).toEqual({ completed: 1, total: 2, pct: 50 });
  });

  test('zero completion → pct 0 (no NaN)', () => {
    const goal = { scenarios: [partialScene('a'), partialScene('b')] };
    const r = getGoalProgress(goal);
    expect(r).toEqual({ completed: 0, total: 2, pct: 0 });
    expect(Number.isNaN(r.pct)).toBe(false);
  });

  test('scenario with empty tasks array counts as not completed', () => {
    const goal = { scenarios: [emptyScene('a'), doneScene('b')] };
    expect(getGoalProgress(goal)).toEqual({ completed: 1, total: 2, pct: 50 });
  });

  test('scenario without tasks field counts as not completed', () => {
    const goal = { scenarios: [{ title: 'no-tasks' }, doneScene('b')] };
    expect(getGoalProgress(goal)).toEqual({ completed: 1, total: 2, pct: 50 });
  });

  test('rounds to nearest integer (1/3 → 33)', () => {
    const goal = { scenarios: [doneScene('a'), partialScene('b'), partialScene('c')] };
    expect(getGoalProgress(goal).pct).toBe(33);
  });

  test('rounds to nearest integer (2/3 → 67)', () => {
    const goal = { scenarios: [doneScene('a'), doneScene('b'), partialScene('c')] };
    expect(getGoalProgress(goal).pct).toBe(67);
  });
});

describe('toggleExpanded reducer', () => {
  test('flips false → true', () => {
    expect(toggleExpanded(false)).toBe(true);
  });

  test('flips true → false', () => {
    expect(toggleExpanded(true)).toBe(false);
  });

  test('double toggle returns to original state', () => {
    expect(toggleExpanded(toggleExpanded(false))).toBe(false);
    expect(toggleExpanded(toggleExpanded(true))).toBe(true);
  });
});
