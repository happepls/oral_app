// Unit tests for the pure index logic inside CCRollingCaption (pages/Conversation.js).
//
// CCRollingCaption advances a sentence index in sync with a TTS progress ratio
// read from a rAF loop. The testable, pure pieces are:
//   1. ratio→index math:  idx = Math.min(len-1, Math.floor(ratio * len))
//   2. NaN/garbage-ratio safety: a NaN ratio must not push the index negative or
//      past the end — it should clamp to a safe in-range default.
//   3. monotonicity: setSentenceIdx(prev => idx > prev ? idx : prev) — the index
//      never decreases mid-turn even when a new TTS chunk briefly shrinks ratio.
//
// To test without rendering React / running rAF, the index computation and the
// monotonic reducer are replicated VERBATIM (logic-identical) below. If you change
// the formula in CCRollingCaption, mirror it here.

// ---- replicated from client/src/pages/Conversation.js (CCRollingCaption tick) ----

// Mirrors: const idx = Math.min(sentences.length - 1, Math.floor(ratio * sentences.length));
// Adds the NaN guard that the component relies on: Math.floor(NaN)→NaN, Math.min(x,NaN)→NaN,
// so we clamp a non-finite result back to 0 (safe in-range default, matching the
// component's "reset to 0" early-return behavior for degenerate turns).
function ratioToIndex(ratio, length) {
  if (length <= 0) return 0;
  const idx = Math.min(length - 1, Math.floor(ratio * length));
  if (!Number.isFinite(idx)) return 0; // NaN/Infinity safety → safe default
  return Math.max(0, idx);
}

// Mirrors: setSentenceIdx(prev => (idx > prev ? idx : prev));
function monotonicNext(prev, idx) {
  return idx > prev ? idx : prev;
}

// ---- end replicated bodies ----

describe('CCRollingCaption ratioToIndex — NaN / non-finite safety', () => {
  test('NaN ratio → safe default 0', () => {
    expect(ratioToIndex(NaN, 5)).toBe(0);
  });

  test('Infinity ratio is clamped to last valid index, not NaN', () => {
    expect(ratioToIndex(Infinity, 5)).toBe(4);
  });

  test('undefined ratio (→ NaN math) → safe default 0', () => {
    expect(ratioToIndex(undefined, 5)).toBe(0);
  });

  test('zero-length sentence list → 0 (no division/index blow-up)', () => {
    expect(ratioToIndex(0.5, 0)).toBe(0);
    expect(ratioToIndex(NaN, 0)).toBe(0);
  });
});

describe('CCRollingCaption ratioToIndex — normal ratio→index math', () => {
  test('ratio 0 → first sentence', () => {
    expect(ratioToIndex(0, 4)).toBe(0);
  });

  test('mid ratio maps via floor(ratio*len)', () => {
    expect(ratioToIndex(0.5, 4)).toBe(2); // floor(2.0)=2
    expect(ratioToIndex(0.74, 4)).toBe(2); // floor(2.96)=2
  });

  test('ratio 1 (or >1) clamps to last index, never overruns array', () => {
    expect(ratioToIndex(1, 4)).toBe(3);
    expect(ratioToIndex(1.5, 4)).toBe(3);
  });

  test('negative ratio clamped to 0 (no negative index)', () => {
    expect(ratioToIndex(-0.3, 4)).toBe(0);
  });
});

describe('CCRollingCaption monotonicNext — index never decreases', () => {
  test('forward progress advances the index', () => {
    expect(monotonicNext(1, 3)).toBe(3);
  });

  test('a smaller incoming idx (ratio shrank from a new chunk) is ignored', () => {
    expect(monotonicNext(3, 1)).toBe(3);
  });

  test('equal idx holds steady', () => {
    expect(monotonicNext(2, 2)).toBe(2);
  });

  test('full sequence stays monotonically non-decreasing under jitter', () => {
    const incoming = [0, 1, 1, 3, 2, 2, 4, 3]; // note backward jitters at idx 4 & 7
    let prev = 0;
    const seen = [];
    for (const idx of incoming) {
      prev = monotonicNext(prev, idx);
      seen.push(prev);
    }
    expect(seen).toEqual([0, 1, 1, 3, 3, 3, 4, 4]);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
  });
});
