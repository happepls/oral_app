jest.mock('../models/db', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const User = require('../models/user');

describe('achievement threshold evaluator', () => {
  test('unlocks every threshold at the documented boundaries', () => {
    expect(User._achievementKeysForStats({
      completed_tasks: 1,
      completed_scenarios: 50,
      completed_goals: 1,
      max_streak: 100,
      max_score: 10,
      practiced_languages: 3,
    })).toEqual([
      'first_steps',
      'bookworm',
      'scholar',
      'master',
      'getting_started',
      'dedicated',
      'unstoppable',
      'legend',
      'conversation_starter',
      'perfect_score',
      'polyglot',
      'actor',
    ]);
  });

  test('does not unlock achievements below their thresholds', () => {
    expect(User._achievementKeysForStats({
      completed_tasks: 0,
      completed_scenarios: 0,
      completed_goals: 0,
      max_streak: 2,
      max_score: 7,
      practiced_languages: 2,
    })).toEqual([]);
  });
});
