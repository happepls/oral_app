import { calculateTaskProgress } from '../pages/conversationProgress';

describe('conversation task progress', () => {
  test.each([
    ['mastered', 5],
    ['strong', 4],
    ['satisfactory', 3],
  ])('first %s turn never exceeds 33%%', (_quality, score) => {
    expect(calculateTaskProgress({ score, interactionCount: 1 })).toBeLessThanOrEqual(33);
  });

  test('each live update advances by at most 33 points', () => {
    const first = calculateTaskProgress({ score: 5, interactionCount: 1, previousProgress: 0 });
    const second = calculateTaskProgress({ score: 9, interactionCount: 2, previousProgress: first });
    expect(first).toBe(33);
    expect(second).toBe(66);
  });

  test('ready task stays at 99 until confirmation', () => {
    expect(calculateTaskProgress({ score: 9, interactionCount: 3, previousProgress: 66 })).toBe(99);
    expect(calculateTaskProgress({ score: 9, interactionCount: 3, taskCompleted: true })).toBe(100);
  });

  test('restored progress is capped by completed interaction count', () => {
    expect(calculateTaskProgress({ score: 9, interactionCount: 1 })).toBe(33);
    expect(calculateTaskProgress({ score: 9, interactionCount: 2 })).toBe(66);
    expect(calculateTaskProgress({ score: 9, interactionCount: 3 })).toBe(99);
  });
});
