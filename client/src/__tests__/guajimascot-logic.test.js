// Unit tests for the state→asset mapping and overlay predicates in
// components/GuajiMascot.jsx.
//
// GuajiMascot picks an SVG via a small state-first / mood-fallback resolver,
// falls back to SVG_MAP.calm for unknown keys, derives a bob-animation speed
// from state, and conditionally renders two overlays (listening rings,
// thinking dots). All of this is plain logic, replicated VERBATIM below so it
// can be tested without rendering React / loading SVG assets. If you change the
// SVG_MAP, the svgKey selection, the bobSpeed, or the overlay conditions in
// GuajiMascot.jsx, mirror the change here.

// ---- replicated verbatim from client/src/components/GuajiMascot.jsx ----

const SVG_MAP = {
  listening: 'bird-state-listening.svg',
  speaking: 'bird-state-speaking.svg',
  guiding: 'bird-state-guiding.svg',
  correctAnswer: 'bird-state-correct-answer.svg',
  happy: 'bird-expression-happy.svg',
  excited: 'bird-expression-excited.svg',
  confuse: 'bird-expression-confuse.svg',
  confused: 'bird-expression-confuse.svg',
  loving: 'bird-expression-loving.svg',
  proud: 'bird-expression-proud.svg',
  sleepy: 'bird-expression-sleepy.svg',
  surprised: 'bird-expression-surprised.svg',
  thinking: 'bird-expression-thinking.svg',
  winking: 'bird-expression-winking.svg',
  calm: 'bird-logo.svg',
};

// Replicates the svgKey selection + `SVG_MAP[svgKey] || SVG_MAP.calm` lookup.
function resolveSvgFile(state, mood = 'calm') {
  let svgKey;
  if (state === 'listening') svgKey = 'listening';
  else if (state === 'speaking') svgKey = 'speaking';
  else if (state === 'thinking') svgKey = 'thinking';
  else svgKey = mood;

  return SVG_MAP[svgKey] || SVG_MAP.calm;
}

// Replicates: `state === 'speaking' ? 1.6 : state === 'thinking' ? 2.4 : 3.2`
function resolveBobSpeed(state) {
  return state === 'speaking' ? 1.6 :
    state === 'thinking' ? 2.4 : 3.2;
}

// Overlay predicates.
const showListeningRings = (state) => state === 'listening';
const showThinkingDots = (state) => state === 'thinking';

// ---- end replicated bodies ----

describe('GuajiMascot state→asset (state takes precedence over mood)', () => {
  test("state 'listening' → listening svg (ignores mood)", () => {
    expect(resolveSvgFile('listening', 'happy')).toBe('bird-state-listening.svg');
  });

  test("state 'speaking' → speaking svg (ignores mood)", () => {
    expect(resolveSvgFile('speaking', 'proud')).toBe('bird-state-speaking.svg');
  });

  test("state 'thinking' → thinking expression svg (ignores mood)", () => {
    expect(resolveSvgFile('thinking', 'sleepy')).toBe('bird-expression-thinking.svg');
  });
});

describe('GuajiMascot mood fallback (state not a recognized override)', () => {
  test("state 'idle' falls through to mood → happy", () => {
    expect(resolveSvgFile('idle', 'happy')).toBe('bird-expression-happy.svg');
  });

  test("default state/mood ('idle'/'calm') → calm logo", () => {
    expect(resolveSvgFile('idle', 'calm')).toBe('bird-logo.svg');
  });

  test("mood 'confuse' and alias 'confused' map to same svg", () => {
    expect(resolveSvgFile('idle', 'confuse')).toBe('bird-expression-confuse.svg');
    expect(resolveSvgFile('idle', 'confused')).toBe('bird-expression-confuse.svg');
  });

  test('each non-override mood resolves to its mapped expression', () => {
    const cases = {
      excited: 'bird-expression-excited.svg',
      loving: 'bird-expression-loving.svg',
      proud: 'bird-expression-proud.svg',
      sleepy: 'bird-expression-sleepy.svg',
      surprised: 'bird-expression-surprised.svg',
      winking: 'bird-expression-winking.svg',
      guiding: 'bird-state-guiding.svg',
      correctAnswer: 'bird-state-correct-answer.svg',
    };
    for (const [mood, file] of Object.entries(cases)) {
      expect(resolveSvgFile('idle', mood)).toBe(file);
    }
  });
});

describe('GuajiMascot unknown fallback', () => {
  test('unknown mood (with non-override state) → calm logo', () => {
    expect(resolveSvgFile('idle', 'banana')).toBe('bird-logo.svg');
  });

  test('unknown state + unknown mood → calm logo', () => {
    expect(resolveSvgFile('dancing', 'banana')).toBe('bird-logo.svg');
  });

  test('default mood when omitted is calm → calm logo', () => {
    expect(resolveSvgFile('idle')).toBe('bird-logo.svg');
  });
});

describe('GuajiMascot bob speed', () => {
  test("'speaking' → 1.6s", () => {
    expect(resolveBobSpeed('speaking')).toBe(1.6);
  });

  test("'thinking' → 2.4s", () => {
    expect(resolveBobSpeed('thinking')).toBe(2.4);
  });

  test('any other state → 3.2s default', () => {
    expect(resolveBobSpeed('idle')).toBe(3.2);
    expect(resolveBobSpeed('listening')).toBe(3.2);
    expect(resolveBobSpeed(undefined)).toBe(3.2);
  });
});

describe('GuajiMascot overlays', () => {
  test('listening rings only render in listening state', () => {
    expect(showListeningRings('listening')).toBe(true);
    expect(showListeningRings('thinking')).toBe(false);
    expect(showListeningRings('idle')).toBe(false);
  });

  test('thinking dots only render in thinking state', () => {
    expect(showThinkingDots('thinking')).toBe(true);
    expect(showThinkingDots('listening')).toBe(false);
    expect(showThinkingDots('idle')).toBe(false);
  });

  test('overlays are mutually exclusive (no state shows both)', () => {
    for (const state of ['listening', 'speaking', 'thinking', 'idle']) {
      expect(showListeningRings(state) && showThinkingDots(state)).toBe(false);
    }
  });
});
