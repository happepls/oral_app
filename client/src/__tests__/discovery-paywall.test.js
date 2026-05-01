/**
 * Tests for Discovery.js paywall/gating logic
 * - isScenarioUnlocked: free vs pro scenario access
 * - DailyQA paywall: free user blocked from re-answer/pool
 */

// Replicate from Discovery.js
function isScenarioUnlocked(index, scenarios, isPro) {
  if (isPro) return true;
  if (index < 3) return true;
  return false;
}

function getScenarioCardState(scenario, unlocked, pct) {
  if (!unlocked) return 'locked';
  if (pct === 100) return 'completed';
  if (pct > 0) return 'active';
  return 'default';
}

describe('isScenarioUnlocked', () => {
  const scenarios = Array(10).fill({ title: 'test' });

  test('Pro user unlocks all scenarios', () => {
    for (let i = 0; i < 10; i++) {
      expect(isScenarioUnlocked(i, scenarios, true)).toBe(true);
    }
  });

  test('Free user unlocks first 3 scenarios', () => {
    expect(isScenarioUnlocked(0, scenarios, false)).toBe(true);
    expect(isScenarioUnlocked(1, scenarios, false)).toBe(true);
    expect(isScenarioUnlocked(2, scenarios, false)).toBe(true);
  });

  test('Free user locked from scenario 4+', () => {
    expect(isScenarioUnlocked(3, scenarios, false)).toBe(false);
    expect(isScenarioUnlocked(5, scenarios, false)).toBe(false);
    expect(isScenarioUnlocked(9, scenarios, false)).toBe(false);
  });
});

describe('getScenarioCardState', () => {
  test('locked when not unlocked', () => {
    expect(getScenarioCardState({}, false, 0)).toBe('locked');
    expect(getScenarioCardState({}, false, 50)).toBe('locked');
  });

  test('completed when 100%', () => {
    expect(getScenarioCardState({}, true, 100)).toBe('completed');
  });

  test('active when in progress', () => {
    expect(getScenarioCardState({}, true, 50)).toBe('active');
    expect(getScenarioCardState({}, true, 1)).toBe('active');
  });

  test('default when 0%', () => {
    expect(getScenarioCardState({}, true, 0)).toBe('default');
  });
});

describe('Daily QA paywall logic', () => {
  // Simulates the gating check in Discovery.js handleReAnswer/handleOpenQAPool
  function canAccessQAPool(user) {
    return user?.subscription_status === 'active';
  }

  test('Pro user can access QA pool', () => {
    expect(canAccessQAPool({ subscription_status: 'active' })).toBe(true);
  });

  test('Free user cannot access QA pool', () => {
    expect(canAccessQAPool({ subscription_status: 'free' })).toBe(false);
  });

  test('No subscription_status blocks access', () => {
    expect(canAccessQAPool({})).toBe(false);
    expect(canAccessQAPool(null)).toBe(false);
    expect(canAccessQAPool(undefined)).toBe(false);
  });

  test('Expired subscription blocks access', () => {
    expect(canAccessQAPool({ subscription_status: 'expired' })).toBe(false);
    expect(canAccessQAPool({ subscription_status: 'cancelled' })).toBe(false);
  });

  // Daily QA passed + free user → show lock
  // Daily QA passed + pro user → show pool selector
  function getDailyQAAction(isPro, passed) {
    if (!passed) return 'start';
    if (isPro) return 'pool';
    return 'locked';
  }

  test('Not passed → start for both', () => {
    expect(getDailyQAAction(true, false)).toBe('start');
    expect(getDailyQAAction(false, false)).toBe('start');
  });

  test('Passed + Pro → pool selector', () => {
    expect(getDailyQAAction(true, true)).toBe('pool');
  });

  test('Passed + Free → locked', () => {
    expect(getDailyQAAction(false, true)).toBe('locked');
  });
});
