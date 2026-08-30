import { calculateTaskProgress, isCompletedWindowEvaluation } from '../pages/conversationProgress';

describe('conversation task progress', () => {
  test.each([
    ['mastered', 5],
    ['strong', 4],
    ['satisfactory', 3],
  ])('first %s window never exceeds 33%%', (_quality, score) => {
    expect(calculateTaskProgress({ score, completedWindowCount: 1 })).toBeLessThanOrEqual(33);
  });

  test('each live update advances by at most 33 points', () => {
    const first = calculateTaskProgress({ score: 3, completedWindowCount: 1, previousProgress: 0 });
    const second = calculateTaskProgress({ score: 6, completedWindowCount: 2, previousProgress: first });
    expect(first).toBe(33);
    expect(second).toBe(66);
  });

  test('ready task stays at 99 until confirmation', () => {
    expect(calculateTaskProgress({ score: 9, completedWindowCount: 3, previousProgress: 66 })).toBe(99);
    expect(calculateTaskProgress({ score: 9, completedWindowCount: 3, taskCompleted: true })).toBe(100);
  });

  test('raw dialogue-turn count cannot create scoring progress', () => {
    expect(calculateTaskProgress({ score: 0, interactionCount: 4 })).toBe(0);
  });

  test('restored progress can be capped by completed scoring windows', () => {
    expect(calculateTaskProgress({ score: 9, completedWindowCount: 1 })).toBe(33);
    expect(calculateTaskProgress({ score: 9, completedWindowCount: 2 })).toBe(66);
    expect(calculateTaskProgress({ score: 9, completedWindowCount: 3 })).toBe(99);
  });

  test('null window metadata does not erase a completed score', () => {
    expect(calculateTaskProgress({ score: 3, completedWindowCount: null })).toBe(33);
  });

  test('only completed window evaluations are applied', () => {
    expect(isCompletedWindowEvaluation({ evaluation_status: 'completed' })).toBe(true);
    expect(isCompletedWindowEvaluation({ window_completed: true })).toBe(true);
    expect(isCompletedWindowEvaluation({ evaluation_status: 'evaluation_pending' })).toBe(false);
    expect(isCompletedWindowEvaluation({ delta: 3, interaction_count: 3 })).toBe(false);
  });
});
