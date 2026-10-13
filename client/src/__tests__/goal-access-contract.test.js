import { validateGoalAccess } from '../utils/validateGoalAccess';

test('missing or partial authority fails instead of displaying locked scenarios', () => {
  const goal = { scenarios: [{ title: 'Cafe' }] };
  expect(() => validateGoalAccess({ goal })).toThrow('authorization');
  expect(() => validateGoalAccess({ goal: { ...goal, access: { membership: { active: true }, unlocked_count: 1, scenarios: [] } } })).toThrow('authorization');
});
test.each([true, false])('valid authority is preserved for membership=%s', active => {
  const snapshot = { goal: { scenarios: [{ title: 'Cafe' }], access: {
    membership: { active }, unlocked_count: 1, scenarios: [{ title: 'Cafe', allowed: true }],
  } } };
  expect(validateGoalAccess(snapshot)).toBe(snapshot);
});
