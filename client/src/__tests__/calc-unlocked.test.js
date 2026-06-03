// Unit tests for the progressive-unlock logic in pages/Discovery.js.
//
// Free users start with FREE_INITIAL_UNLOCK (3) scenarios unlocked; once every
// already-unlocked scenario is 100% complete the window expands by +1 (cascading
// while the leading prefix stays fully done). Pro users have everything unlocked
// (handled by isScenarioUnlocked, not calcUnlockedCount). To test without
// rendering Discovery, calcProgress + FREE_INITIAL_UNLOCK + calcUnlockedCount +
// isScenarioUnlocked are replicated VERBATIM below. If you change them in
// Discovery.js, mirror the change here.

// ---- replicated verbatim from client/src/pages/Discovery.js ----

function calcProgress(scenario) {
  if (!scenario.tasks || scenario.tasks.length === 0) return 0;
  const done = scenario.tasks.filter(t => typeof t === 'object' && t.status === 'completed').length;
  return Math.round((done / scenario.tasks.length) * 100);
}

const FREE_INITIAL_UNLOCK = 3;

function calcUnlockedCount(scenarios) {
  let unlocked = Math.min(FREE_INITIAL_UNLOCK, scenarios.length);
  while (unlocked < scenarios.length) {
    const allPrevDone = scenarios.slice(0, unlocked).every(s => calcProgress(s) === 100);
    if (!allPrevDone) break;
    unlocked += 1;
  }
  return unlocked;
}

function isScenarioUnlocked(index, unlockedCount, isPro) {
  if (isPro) return true;
  return index < unlockedCount;
}

// ---- end replicated bodies ----

// Test helpers: build a scenario whose calcProgress() returns 0 (not done) or 100 (done).
const doneScenario = () => ({ tasks: [{ status: 'completed' }, { status: 'completed' }] });
const partialScenario = () => ({ tasks: [{ status: 'completed' }, { status: 'pending' }] });
const emptyScenario = () => ({ tasks: [] });
const makeList = (n, doneCount) =>
  Array.from({ length: n }, (_, i) => (i < doneCount ? doneScenario() : partialScenario()));

describe('calcUnlockedCount — initial regime (3 unlocked)', () => {
  test('nothing completed → exactly FREE_INITIAL_UNLOCK unlocked', () => {
    expect(calcUnlockedCount(makeList(10, 0))).toBe(3);
  });

  test('partial progress on first scenario does not expand window', () => {
    const list = makeList(10, 0);
    list[0] = partialScenario(); // 50% — not 100
    expect(calcUnlockedCount(list)).toBe(3);
  });

  test('fewer scenarios than initial cap → unlocked clamps to list length', () => {
    expect(calcUnlockedCount(makeList(2, 0))).toBe(2);
    expect(calcUnlockedCount([])).toBe(0);
  });
});

describe('calcUnlockedCount — +1 per completion regime', () => {
  test('first 3 done → window expands to 4', () => {
    expect(calcUnlockedCount(makeList(10, 3))).toBe(4);
  });

  test('cascades: 5 leading done → 6 unlocked', () => {
    expect(calcUnlockedCount(makeList(10, 5))).toBe(6);
  });

  test('expansion stops at first non-complete scenario in the prefix', () => {
    const list = makeList(10, 3); // 0,1,2 done → would expand to 4
    list[1] = partialScenario();  // break the prefix at index 1
    expect(calcUnlockedCount(list)).toBe(3);
  });

  test('all scenarios completed → entire list unlocked, never exceeds length', () => {
    expect(calcUnlockedCount(makeList(10, 10))).toBe(10);
  });

  test('empty-task scenario counts as 0% and blocks expansion', () => {
    const list = makeList(10, 3);
    list[0] = emptyScenario(); // calcProgress → 0
    expect(calcUnlockedCount(list)).toBe(3);
  });
});

describe('isScenarioUnlocked — Pro unlocks everything', () => {
  test('Pro user: any index unlocked regardless of count', () => {
    expect(isScenarioUnlocked(9, 3, true)).toBe(true);
    expect(isScenarioUnlocked(0, 0, true)).toBe(true);
  });

  test('free user: index below window is unlocked, at/above is locked', () => {
    const count = calcUnlockedCount(makeList(10, 0)); // 3
    expect(isScenarioUnlocked(0, count, false)).toBe(true);
    expect(isScenarioUnlocked(2, count, false)).toBe(true);
    expect(isScenarioUnlocked(3, count, false)).toBe(false);
    expect(isScenarioUnlocked(9, count, false)).toBe(false);
  });
});
