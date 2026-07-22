import { getScenarioDisplayTitle } from '../utils/scenarioDisplay';

describe('getScenarioDisplayTitle', () => {
  test('uses a localized display title without changing known teaching titles', () => {
    expect(getScenarioDisplayTitle('Airport Check-in', 0, 'zh-CN')).toBe('机场值机');
  });

  test('uses a deterministic localized fallback for generated Latin titles', () => {
    expect(getScenarioDisplayTitle('Unexpected Generated Topic', 2, 'zh')).toBe('练习场景 3');
  });

  test('keeps target-language titles outside the Chinese UI', () => {
    expect(getScenarioDisplayTitle('Airport Check-in', 0, 'en')).toBe('Airport Check-in');
  });
});
