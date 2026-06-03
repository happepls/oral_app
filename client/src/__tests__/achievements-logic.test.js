/**
 * Tests for pure logic extracted from client/src/pages/Achievements.js:
 *  - ACHIEVEMENT_CATEGORIES grouping (category → achievement ids)
 *  - unlocked-Set derivation from fetched data (filter a.unlocked → ids)
 *  - per-tile locked/unlocked rendering decision (isUnlocked = set.has(id))
 *  - findFeaturedAchievement (first locked, or null when all unlocked)
 *
 * The data-fetch (userAPI.achievements) itself is NOT unit-tested. The
 * transforms below are replicated VERBATIM from Achievements.js so they can be
 * exercised without mounting React / motion-react. If the originals change,
 * mirror the change here so the tests keep guarding real behavior.
 */

// ── Replicated verbatim from Achievements.js: ACHIEVEMENT_CATEGORIES ──
const ACHIEVEMENT_CATEGORIES = {
  Learning: {
    icon: '📚',
    achievements: ['first_steps', 'bookworm', 'scholar', 'master'],
  },
  Streaks: {
    icon: '🔥',
    achievements: ['getting_started', 'dedicated', 'unstoppable', 'legend'],
  },
  Skills: {
    icon: '🎤',
    achievements: ['conversation_starter', 'perfect_score', 'polyglot', 'actor'],
  },
};

// ── Replicated from the fetch handler in Achievements.js useEffect ──
// const unlockedSet = new Set(
//   (data.achievements || []).filter(a => a.unlocked).map(a => a.id)
// );
function deriveUnlockedSet(data) {
  return new Set(
    (data?.achievements || [])
      .filter(a => a.unlocked)
      .map(a => a.id)
  );
}

// ── Replicated from the tile map() in Achievements.js render ──
//   const achData = achievements.find(a => a.id === achId);
//   const isUnlocked = unlockedAchievements.has(achId);
function tileState(achId, achievements, unlockedSet) {
  const achData = achievements.find(a => a.id === achId);
  const isUnlocked = unlockedSet.has(achId);
  return { achData, isUnlocked };
}

// ── Replicated verbatim from Achievements.js: findFeaturedAchievement ──
function findFeaturedAchievement(achievements, unlockedAchievements) {
  const unlocked = achievements.filter(a => unlockedAchievements.has(a.id));
  if (unlocked.length === achievements.length) return null;
  return achievements.find(a => !unlockedAchievements.has(a.id)) || null;
}

describe('ACHIEVEMENT_CATEGORIES grouping', () => {
  test('exposes exactly three categories in declared order', () => {
    expect(Object.keys(ACHIEVEMENT_CATEGORIES)).toEqual(['Learning', 'Streaks', 'Skills']);
  });

  test('each category groups exactly four achievement ids', () => {
    Object.values(ACHIEVEMENT_CATEGORIES).forEach(({ achievements }) => {
      expect(achievements).toHaveLength(4);
    });
  });

  test('every achievement id belongs to exactly one category (no duplicates / no gaps)', () => {
    const allIds = Object.values(ACHIEVEMENT_CATEGORIES)
      .flatMap(({ achievements }) => achievements);
    expect(allIds).toHaveLength(12);
    expect(new Set(allIds).size).toBe(12);
  });

  test('Learning category contains the learning-progression ids', () => {
    expect(ACHIEVEMENT_CATEGORIES.Learning.achievements)
      .toEqual(['first_steps', 'bookworm', 'scholar', 'master']);
  });
});

describe('deriveUnlockedSet', () => {
  test('collects only ids where unlocked is truthy', () => {
    const data = {
      achievements: [
        { id: 'first_steps', unlocked: true },
        { id: 'bookworm', unlocked: false },
        { id: 'scholar', unlocked: true },
        { id: 'master' }, // unlocked undefined → locked
      ],
    };
    const set = deriveUnlockedSet(data);
    expect(set.has('first_steps')).toBe(true);
    expect(set.has('scholar')).toBe(true);
    expect(set.has('bookworm')).toBe(false);
    expect(set.has('master')).toBe(false);
    expect(set.size).toBe(2);
  });

  test('returns empty set when data is null/empty (fetch-failure shape)', () => {
    expect(deriveUnlockedSet(null).size).toBe(0);
    expect(deriveUnlockedSet({}).size).toBe(0);
    expect(deriveUnlockedSet({ achievements: [] }).size).toBe(0);
  });
});

describe('tileState — locked/unlocked rendering decision', () => {
  const achievements = [
    { id: 'first_steps', unlocked: true, unlocked_date: '2026-05-01' },
    { id: 'bookworm', unlocked: false },
  ];
  const unlockedSet = deriveUnlockedSet({ achievements });

  test('unlocked tile resolves achData and isUnlocked=true', () => {
    const { achData, isUnlocked } = tileState('first_steps', achievements, unlockedSet);
    expect(isUnlocked).toBe(true);
    expect(achData.unlocked_date).toBe('2026-05-01');
  });

  test('locked tile resolves achData and isUnlocked=false', () => {
    const { achData, isUnlocked } = tileState('bookworm', achievements, unlockedSet);
    expect(isUnlocked).toBe(false);
    expect(achData).toBeDefined();
  });

  test('category id with no fetched data → achData undefined, isUnlocked=false', () => {
    const { achData, isUnlocked } = tileState('legend', achievements, unlockedSet);
    expect(achData).toBeUndefined();
    expect(isUnlocked).toBe(false);
  });
});

describe('findFeaturedAchievement', () => {
  test('returns the first locked achievement', () => {
    const achievements = [
      { id: 'first_steps' },
      { id: 'bookworm' },
      { id: 'scholar' },
    ];
    const set = new Set(['first_steps']);
    expect(findFeaturedAchievement(achievements, set)).toEqual({ id: 'bookworm' });
  });

  test('returns null when every achievement is unlocked', () => {
    const achievements = [{ id: 'a' }, { id: 'b' }];
    const set = new Set(['a', 'b']);
    expect(findFeaturedAchievement(achievements, set)).toBeNull();
  });

  test('returns first item when nothing is unlocked', () => {
    const achievements = [{ id: 'a' }, { id: 'b' }];
    expect(findFeaturedAchievement(achievements, new Set())).toEqual({ id: 'a' });
  });
});
