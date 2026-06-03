/**
 * isRecallMode Branch Tests
 *
 * Pure-logic tests for the recall-mode (mode=recall) branching in Conversation.js.
 * Conversation.js cannot be rendered standalone (WebSocket / audio / AuthContext
 * deps), so — matching the convention of the other __tests__/ files — we
 * replicate the decision logic as pure predicates and assert on those:
 *
 *  1. mode parsing — isRecallMode = URLSearchParams.get('mode') === 'recall'
 *     (mirrors the useRef(...).current initializer in Conversation.js).
 *  2. phase_transition → navigate('/discovery') predicate — fires only when
 *     isRecallMode && phase === 'scene_theater'.
 *  3. magic-card visibility predicate — (isRecallMode && currentPhase === 'magic_repetition').
 */

// ── Replicated pure logic (mirrors Conversation.js) ───────────────────────────

// isRecallMode = URLSearchParams(search).get('mode') === 'recall'
function parseIsRecallMode(search) {
  return new URLSearchParams(search).get('mode') === 'recall';
}

// On phase_transition: in recall mode, completing magic repetition transitions
// the backend to 'scene_theater' — the frontend intercepts and navigates to
// /discovery instead of playing scene_theater. Returns true when navigate fires.
function shouldNavigateToDiscovery(isRecallMode, phase) {
  return isRecallMode && phase === 'scene_theater';
}

// Initial phase depends on mode: recall starts in magic_repetition, normal in scene_theater.
function initialPhase(isRecallMode) {
  return isRecallMode ? 'magic_repetition' : 'scene_theater';
}

// Magic card (台词卡) only renders in recall mode while in the magic_repetition phase.
function isMagicCardVisible(isRecallMode, currentPhase) {
  return isRecallMode && currentPhase === 'magic_repetition';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('isRecallMode — mode parsing from URL', () => {
  test('mode=recall → true', () => {
    expect(parseIsRecallMode('?mode=recall')).toBe(true);
  });

  test('mode=recall with extra params → true', () => {
    expect(parseIsRecallMode('?scenario=Coffee%20Shop&mode=recall&voice=Tina')).toBe(true);
  });

  test('no mode param → false', () => {
    expect(parseIsRecallMode('?scenario=Coffee%20Shop')).toBe(false);
  });

  test('mode=normal (any non-recall value) → false', () => {
    expect(parseIsRecallMode('?mode=normal')).toBe(false);
  });

  test('empty query string → false', () => {
    expect(parseIsRecallMode('')).toBe(false);
  });

  test('mode value is case-sensitive: Recall !== recall → false', () => {
    expect(parseIsRecallMode('?mode=Recall')).toBe(false);
  });
});

describe('isRecallMode — initial phase selection', () => {
  test('recall mode initializes to magic_repetition', () => {
    expect(initialPhase(true)).toBe('magic_repetition');
  });

  test('normal mode initializes to scene_theater', () => {
    expect(initialPhase(false)).toBe('scene_theater');
  });
});

describe('phase_transition → navigate("/discovery") predicate', () => {
  test('recall mode + scene_theater transition → navigate to discovery', () => {
    expect(shouldNavigateToDiscovery(true, 'scene_theater')).toBe(true);
  });

  test('recall mode but magic_repetition phase → does NOT navigate', () => {
    expect(shouldNavigateToDiscovery(true, 'magic_repetition')).toBe(false);
  });

  test('normal mode + scene_theater → does NOT navigate (plays scene_theater)', () => {
    expect(shouldNavigateToDiscovery(false, 'scene_theater')).toBe(false);
  });

  test('normal mode + magic_repetition → does NOT navigate', () => {
    expect(shouldNavigateToDiscovery(false, 'magic_repetition')).toBe(false);
  });

  test('recall mode + undefined phase → does NOT navigate', () => {
    expect(shouldNavigateToDiscovery(true, undefined)).toBe(false);
  });
});

describe('magic-card visibility predicate (isRecallMode && currentPhase === "magic_repetition")', () => {
  test('recall mode + magic_repetition → visible', () => {
    expect(isMagicCardVisible(true, 'magic_repetition')).toBe(true);
  });

  test('recall mode + scene_theater → hidden', () => {
    expect(isMagicCardVisible(true, 'scene_theater')).toBe(false);
  });

  test('normal mode + magic_repetition → hidden (card is recall-only)', () => {
    expect(isMagicCardVisible(false, 'magic_repetition')).toBe(false);
  });

  test('normal mode + scene_theater → hidden', () => {
    expect(isMagicCardVisible(false, 'scene_theater')).toBe(false);
  });
});

describe('isRecallMode — end-to-end flow consistency', () => {
  test('recall URL → recall mode → magic card visible at start, navigates on scene_theater', () => {
    const isRecallMode = parseIsRecallMode('?mode=recall&scenario=Coffee%20Shop');
    expect(isRecallMode).toBe(true);

    const startPhase = initialPhase(isRecallMode);
    expect(startPhase).toBe('magic_repetition');
    expect(isMagicCardVisible(isRecallMode, startPhase)).toBe(true);

    // backend later signals scene_theater → frontend bails to discovery
    expect(shouldNavigateToDiscovery(isRecallMode, 'scene_theater')).toBe(true);
  });

  test('normal URL → normal mode → no magic card, no early discovery navigation', () => {
    const isRecallMode = parseIsRecallMode('?scenario=Coffee%20Shop');
    expect(isRecallMode).toBe(false);

    const startPhase = initialPhase(isRecallMode);
    expect(startPhase).toBe('scene_theater');
    expect(isMagicCardVisible(isRecallMode, startPhase)).toBe(false);
    expect(shouldNavigateToDiscovery(isRecallMode, 'scene_theater')).toBe(false);
  });
});
