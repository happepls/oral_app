import { isCurrentTeachingState } from '../pages/conversationExpressions';

test('waiting and retry states are bound to the current recording and generation', () => {
  const state = { task_id: 42, scenario: 'Restaurant', scoring_generation: 3, turn_id: 'turn-2',
    protocol_version: 2, input_id: 'record-2', status: 'analyzing' };
  const task = { id: 42, scoring_generation: 3 };
  expect(isCurrentTeachingState(state, task, new Map(), 'Restaurant', 'record-2')).toBe(true);
  for (const bad of [{ ...state, input_id: 'record-1' }, { ...state, scoring_generation: 4 },
    { ...state, protocol_version: 1 }, { ...state, status: 'anything' }, { ...state, turn_id: null }]) {
    expect(isCurrentTeachingState(bad, task, new Map(), 'Restaurant', 'record-2')).toBe(false);
  }
});
