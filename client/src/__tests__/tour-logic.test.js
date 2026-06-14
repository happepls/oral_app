/**
 * Tests for Onboarding Tour pure logic.
 * Functions are replicated verbatim from:
 *   - client/src/contexts/TourContext.js  (getNextStep, shouldStartTour, shouldSkipStep)
 *   - client/src/components/Spotlight.jsx  (computePlacement)
 * No React rendering (project convention: stripAIMarkers / discovery-paywall).
 */

// ── Replicate from TourContext.js ──────────────────────────────────────

// Returns the next step index, or null when already on the last step.
function getNextStep(idx, total) {
  if (typeof idx !== 'number' || typeof total !== 'number') return null;
  const next = idx + 1;
  return next < total ? next : null;
}

// Returns the previous step index, or null when already on the first step.
function getPrevStep(idx) {
  if (typeof idx !== 'number') return null;
  return idx > 0 ? idx - 1 : null;
}

// Tour starts only when not yet completed AND the start signal is present.
function shouldStartTour(completed, startTourFlag) {
  return !completed && !!startTourFlag;
}

// Auto-skip a step whose anchor never resolved within the timeout budget.
function shouldSkipStep(elapsedMs, timeoutMs) {
  return elapsedMs >= timeoutMs;
}

// ── Replicate from Spotlight.jsx ───────────────────────────────────────

// Decide where the bubble sits relative to the highlighted rect. Prefer the
// requested side; flip when it would overflow the viewport.
function computePlacement(rect, viewport, prefer = 'bottom') {
  const BUBBLE_H = 160; // conservative bubble height estimate
  const GAP = 12;
  const spaceBelow = viewport.height - rect.bottom;
  const spaceAbove = rect.top;

  if (prefer === 'bottom') {
    if (spaceBelow >= BUBBLE_H + GAP) return 'bottom';
    if (spaceAbove >= BUBBLE_H + GAP) return 'top';
    return spaceBelow >= spaceAbove ? 'bottom' : 'top';
  }
  // prefer === 'top'
  if (spaceAbove >= BUBBLE_H + GAP) return 'top';
  if (spaceBelow >= BUBBLE_H + GAP) return 'bottom';
  return spaceAbove >= spaceBelow ? 'top' : 'bottom';
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('getNextStep', () => {
  test('advances to next index mid-sequence', () => {
    expect(getNextStep(0, 3)).toBe(1);
    expect(getNextStep(1, 3)).toBe(2);
  });

  test('returns null on last step', () => {
    expect(getNextStep(2, 3)).toBeNull();
  });

  test('returns null past the end (defensive)', () => {
    expect(getNextStep(5, 3)).toBeNull();
  });

  test('returns null for invalid input', () => {
    expect(getNextStep(undefined, 3)).toBeNull();
    expect(getNextStep(0, undefined)).toBeNull();
  });
});

describe('getPrevStep', () => {
  test('goes back mid-sequence', () => {
    expect(getPrevStep(2)).toBe(1);
    expect(getPrevStep(1)).toBe(0);
  });

  test('returns null on first step', () => {
    expect(getPrevStep(0)).toBeNull();
  });

  test('returns null for invalid input', () => {
    expect(getPrevStep(undefined)).toBeNull();
  });
});

describe('shouldStartTour', () => {
  test('true only when not completed AND start flag set', () => {
    expect(shouldStartTour(false, true)).toBe(true);
  });

  test('false when already completed', () => {
    expect(shouldStartTour(true, true)).toBe(false);
  });

  test('false when no start signal', () => {
    expect(shouldStartTour(false, false)).toBe(false);
    expect(shouldStartTour(false, undefined)).toBe(false);
  });
});

describe('shouldSkipStep', () => {
  test('skips once elapsed reaches timeout', () => {
    expect(shouldSkipStep(3000, 3000)).toBe(true);
    expect(shouldSkipStep(3500, 3000)).toBe(true);
  });

  test('does not skip before timeout', () => {
    expect(shouldSkipStep(1200, 3000)).toBe(false);
  });
});

describe('computePlacement', () => {
  const viewport = { width: 390, height: 844 }; // iPhone-ish

  test('prefers bottom when room below', () => {
    const rect = { top: 100, bottom: 160 };
    expect(computePlacement(rect, viewport, 'bottom')).toBe('bottom');
  });

  test('flips to top when no room below', () => {
    const rect = { top: 600, bottom: 800 };
    expect(computePlacement(rect, viewport, 'bottom')).toBe('top');
  });

  test('prefers top when room above', () => {
    const rect = { top: 600, bottom: 700 };
    expect(computePlacement(rect, viewport, 'top')).toBe('top');
  });

  test('flips to bottom when no room above', () => {
    const rect = { top: 20, bottom: 80 };
    expect(computePlacement(rect, viewport, 'top')).toBe('bottom');
  });

  test('falls back to larger side when neither fits', () => {
    const tight = { width: 390, height: 300 };
    const rect = { top: 120, bottom: 180 };
    // spaceBelow=120, spaceAbove=120 → bottom wins tie for prefer=bottom
    expect(computePlacement(rect, tight, 'bottom')).toBe('bottom');
  });
});
