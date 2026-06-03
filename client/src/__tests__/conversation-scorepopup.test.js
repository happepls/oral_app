/**
 * ScorePopup Tests
 *
 * Pure-logic tests for the ScorePopup component used in Conversation.js.
 * Conversation.js cannot be rendered in isolation (heavy WebSocket / audio /
 * AuthContext deps), so following the convention of the other __tests__/ files
 * we replicate the load-bearing logic as pure functions and assert on those:
 *
 *  1. TRIGGER predicate — popup shows only when keyword_coverage is present
 *     (!== undefined) AND delta > 0.
 *  2. onClose semantics — modeled as a boolean show/hide state machine.
 *  3. Ring-number computation — the central overall score shown in the SVG ring,
 *     mirroring `overall = round((fluency+grammar+vocab+task_relevance)/4 * 10)`
 *     from the ScorePopup component (each sub-score defaults to 5 when absent).
 */

// ── Replicated pure logic (mirrors Conversation.js) ───────────────────────────

// Trigger condition: popup is shown only when keyword_coverage is present and
// the proficiency delta is positive.
function shouldShowScorePopup(payload) {
  const delta = payload?.delta || 0;
  return payload?.keyword_coverage !== undefined && delta > 0;
}

// Ring number = overall score (0-100). Mirrors ScorePopup's `overall` calc:
// average of the four 0-10 dimensions (defaulting missing ones to 5), ×10, rounded.
function computeRingNumber(scores) {
  const s = scores || {};
  return Math.round(
    (((s.fluency || 5) + (s.grammar || 5) + (s.vocabulary || 5) + (s.task_relevance || 5)) / 4) * 10
  );
}

// onClose semantics modeled as a tiny boolean state machine.
function makePopupState() {
  let show = false;
  return {
    get isVisible() { return show; },
    open() { show = true; },
    close() { show = false; },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScorePopup — trigger predicate (keyword_coverage present && delta > 0)', () => {
  test('triggers when keyword_coverage is present (0) and delta > 0', () => {
    expect(shouldShowScorePopup({ keyword_coverage: 0, delta: 2 })).toBe(true);
  });

  test('triggers when keyword_coverage is a positive number and delta > 0', () => {
    expect(shouldShowScorePopup({ keyword_coverage: 0.75, delta: 1 })).toBe(true);
  });

  test('does NOT trigger when keyword_coverage is undefined (even with delta > 0)', () => {
    expect(shouldShowScorePopup({ delta: 2 })).toBe(false);
  });

  test('does NOT trigger when delta is 0 (even with keyword_coverage present)', () => {
    expect(shouldShowScorePopup({ keyword_coverage: 0.5, delta: 0 })).toBe(false);
  });

  test('does NOT trigger when delta is negative', () => {
    expect(shouldShowScorePopup({ keyword_coverage: 0.5, delta: -1 })).toBe(false);
  });

  test('does NOT trigger when delta is missing (treated as 0)', () => {
    expect(shouldShowScorePopup({ keyword_coverage: 0.5 })).toBe(false);
  });

  test('does NOT trigger for empty / null payload', () => {
    expect(shouldShowScorePopup({})).toBe(false);
    expect(shouldShowScorePopup(null)).toBe(false);
    expect(shouldShowScorePopup(undefined)).toBe(false);
  });
});

describe('ScorePopup — onClose semantics (boolean show state)', () => {
  test('starts hidden', () => {
    const popup = makePopupState();
    expect(popup.isVisible).toBe(false);
  });

  test('open() shows the popup', () => {
    const popup = makePopupState();
    popup.open();
    expect(popup.isVisible).toBe(true);
  });

  test('onClose -> close() hides the popup', () => {
    const popup = makePopupState();
    popup.open();
    popup.close();
    expect(popup.isVisible).toBe(false);
  });

  test('close() is idempotent when already hidden', () => {
    const popup = makePopupState();
    popup.close();
    popup.close();
    expect(popup.isVisible).toBe(false);
  });

  test('can re-open after closing', () => {
    const popup = makePopupState();
    popup.open();
    popup.close();
    popup.open();
    expect(popup.isVisible).toBe(true);
  });
});

describe('ScorePopup — ring number (overall) computation', () => {
  test('all four dimensions present → averaged ×10 and rounded', () => {
    // (8 + 7 + 9 + 6) / 4 = 7.5 → ×10 = 75
    expect(computeRingNumber({ fluency: 8, grammar: 7, vocabulary: 9, task_relevance: 6 })).toBe(75);
  });

  test('perfect 10s across the board → 100', () => {
    expect(computeRingNumber({ fluency: 10, grammar: 10, vocabulary: 10, task_relevance: 10 })).toBe(100);
  });

  test('missing dimensions default to 5 each', () => {
    // empty object → all default to 5 → (5*4)/4=5 → ×10 = 50
    expect(computeRingNumber({})).toBe(50);
  });

  test('partial scores: present dims used, missing dims default to 5', () => {
    // fluency 9, others default 5 → (9 + 5 + 5 + 5)/4 = 6 → ×10 = 60
    expect(computeRingNumber({ fluency: 9 })).toBe(60);
  });

  test('rounds to nearest integer', () => {
    // (5 + 5 + 5 + 6)/4 = 5.25 → ×10 = 52.5 → round = 53
    expect(computeRingNumber({ fluency: 5, grammar: 5, vocabulary: 5, task_relevance: 6 })).toBe(53);
  });

  test('null scores → defaults applied → 50', () => {
    expect(computeRingNumber(null)).toBe(50);
  });
});
