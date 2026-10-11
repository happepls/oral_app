// Do not turn a missing authorization contract into a normal locked dashboard.
export function validateGoalAccess(snapshot) {
  if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, 'goal')) throw new Error('Goal snapshot is unavailable');
  if (!snapshot.goal) return snapshot;
  const access = snapshot.goal.access;
  const titles = (snapshot.goal.scenarios || []).map(s => s.title);
  if (typeof access?.membership?.active !== 'boolean' || !Array.isArray(access?.scenarios)
    || !Number.isInteger(access.unlocked_count)
    || titles.some(title => access.scenarios.filter(s => s.title === title && typeof s.allowed === 'boolean').length !== 1)) {
    throw new Error('Scenario authorization is unavailable');
  }
  return snapshot;
}
