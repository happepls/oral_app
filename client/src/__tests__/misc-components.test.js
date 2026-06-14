// Unit tests for the pure logic embedded in five small presentational components:
//   MicBar, ConvHeader, HintBanner, VoiceBubble, GuajiAvatar
//
// Each component is mostly inline-styled JSX. For each, ONE pure piece of logic is
// extracted and replicated VERBATIM (logic-identical) below, then tested without
// rendering React. If a component has no meaningful pure branch, a documented
// smoke assertion stands in. If you change the originals, mirror the change here.

// =====================================================================
// VoiceBubble — waveform bar-height calc (the only non-trivial pure logic).
// Source: Array.from({ length: bars }, (_, i) => 4 + Math.abs(Math.sin(i*1.7))*14 + i%3*2)
// =====================================================================

// replicated verbatim from components/VoiceBubble.jsx (bar height + opacity)
function voiceBubbleBarHeights(bars = 24) {
  return Array.from({ length: bars }, (_, i) => 4 + Math.abs(Math.sin(i * 1.7)) * 14 + i % 3 * 2);
}
function voiceBubbleOpacity(dark) {
  return dark ? 0.85 : 0.6;
}

describe('VoiceBubble — waveform bar heights', () => {
  test('default produces exactly 24 bars', () => {
    expect(voiceBubbleBarHeights()).toHaveLength(24);
  });

  test('custom bar count honored', () => {
    expect(voiceBubbleBarHeights(8)).toHaveLength(8);
  });

  test('every bar height is within [4, 24] (4 base + ≤14 sine + ≤4 from i%3*2)', () => {
    for (const h of voiceBubbleBarHeights()) {
      expect(h).toBeGreaterThanOrEqual(4);
      expect(h).toBeLessThanOrEqual(4 + 14 + 4);
      expect(Number.isFinite(h)).toBe(true);
    }
  });

  test('deterministic: same input → same heights', () => {
    expect(voiceBubbleBarHeights(24)).toEqual(voiceBubbleBarHeights(24));
  });

  test('i=0 bar is the base height (sin(0)=0, 0%3*2=0)', () => {
    expect(voiceBubbleBarHeights(1)[0]).toBeCloseTo(4, 10);
  });

  test('dark mode raises bar opacity', () => {
    expect(voiceBubbleOpacity(true)).toBe(0.85);
    expect(voiceBubbleOpacity(false)).toBe(0.6);
  });
});

// =====================================================================
// HintBanner — visibility predicate for the optional 跳过 (skip) button.
// Source: `{onSkip && (<button ...>跳过 →</button>)}` — button renders iff onSkip truthy.
// =====================================================================

// replicated logic: the skip button is shown only when onSkip is provided.
function hintBannerShowsSkip(onSkip) {
  return Boolean(onSkip);
}

describe('HintBanner — skip button visibility predicate', () => {
  test('callback provided → skip button shown', () => {
    expect(hintBannerShowsSkip(() => {})).toBe(true);
  });

  test('no callback → skip button hidden', () => {
    expect(hintBannerShowsSkip(undefined)).toBe(false);
    expect(hintBannerShowsSkip(null)).toBe(false);
  });
});

// =====================================================================
// ConvHeader — progress-dot fill: each dot's color depends on its boolean `active`.
// Source: dots.map((active, i) => background: active ? 'var(--primary)' : 'var(--border-solid)')
// Also: dots block + online badge render conditionally.
// =====================================================================

// replicated logic verbatim
function convHeaderDotColor(active) {
  return active ? 'var(--primary)' : 'var(--border-solid)';
}
function convHeaderShowsDots(dots) {
  return Boolean(dots);
}

describe('ConvHeader — progress dot fill', () => {
  test('active dot uses primary color', () => {
    expect(convHeaderDotColor(true)).toBe('var(--primary)');
  });

  test('inactive dot uses border-solid color', () => {
    expect(convHeaderDotColor(false)).toBe('var(--border-solid)');
  });

  test('mapping a dots array fills only the active ones', () => {
    const dots = [true, true, false];
    expect(dots.map(convHeaderDotColor)).toEqual([
      'var(--primary)',
      'var(--primary)',
      'var(--border-solid)',
    ]);
  });

  test('dots block hidden when no dots array passed', () => {
    expect(convHeaderShowsDots(undefined)).toBe(false);
    expect(convHeaderShowsDots([true])).toBe(true);
  });
});

// =====================================================================
// MicBar — recording-state label + restart-button visibility.
// Source: button text = recording ? '正在录音…' : (label || '点击说话')
//         restart button renders iff onRestart provided.
// =====================================================================

// replicated logic verbatim
function micBarLabel(recording, label) {
  return recording ? '正在录音…' : label || '点击说话';
}
function micBarShowsRestart(onRestart) {
  return Boolean(onRestart);
}

describe('MicBar — label + restart visibility', () => {
  test('recording → shows recording text regardless of label', () => {
    expect(micBarLabel(true, '自定义')).toBe('正在录音…');
  });

  test('not recording → uses custom label when provided', () => {
    expect(micBarLabel(false, '开始')).toBe('开始');
  });

  test('not recording, no label → default 点击说话', () => {
    expect(micBarLabel(false, undefined)).toBe('点击说话');
    expect(micBarLabel(false, '')).toBe('点击说话');
  });

  test('restart button only shown when onRestart provided', () => {
    expect(micBarShowsRestart(() => {})).toBe(true);
    expect(micBarShowsRestart(undefined)).toBe(false);
  });
});

// =====================================================================
// GuajiAvatar — mood→SVG file lookup with calm fallback.
// Source: const svgFile = MOOD_SVG[mood] || MOOD_SVG.calm;
// =====================================================================

// replicated verbatim from components/GuajiAvatar.jsx
const MOOD_SVG = {
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
function resolveMoodSvg(mood) {
  return MOOD_SVG[mood] || MOOD_SVG.calm;
}

describe('GuajiAvatar — mood→SVG lookup', () => {
  test('known mood maps to its SVG', () => {
    expect(resolveMoodSvg('happy')).toBe('bird-expression-happy.svg');
    expect(resolveMoodSvg('excited')).toBe('bird-expression-excited.svg');
  });

  test('confuse and confused alias to the same SVG', () => {
    expect(resolveMoodSvg('confused')).toBe(resolveMoodSvg('confuse'));
  });

  test('unknown mood falls back to calm (bird-logo.svg)', () => {
    expect(resolveMoodSvg('grumpy')).toBe('bird-logo.svg');
    expect(resolveMoodSvg(undefined)).toBe('bird-logo.svg');
    expect(resolveMoodSvg('')).toBe('bird-logo.svg');
  });

  test('calm explicitly maps to bird-logo.svg', () => {
    expect(resolveMoodSvg('calm')).toBe('bird-logo.svg');
  });
});
