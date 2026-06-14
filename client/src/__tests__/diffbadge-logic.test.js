// Unit tests for the DIFF_MAP lookup + fallback logic in components/DiffBadge.jsx.
//
// DiffBadge renders a colored difficulty pill. Its only branch is the destructure
// `const [bg, label] = DIFF_MAP[diff] || ['#9CA3AF', diff];`. To test this without
// rendering React, the map and the resolver are replicated VERBATIM below. If you
// change DIFF_MAP or the fallback in DiffBadge.jsx, mirror the change here.

// ---- replicated verbatim from client/src/components/DiffBadge.jsx ----

const DIFF_MAP = {
  beginner: ['#10B981', '初级'],
  intermediate: ['#F6B443', '中级'],
  advanced: ['#FB7250', '高级'],
};

// Replicate: `const [bg, label] = DIFF_MAP[diff] || ['#9CA3AF', diff];`
function resolveDiff(diff) {
  const [bg, label] = DIFF_MAP[diff] || ['#9CA3AF', diff];
  return { bg, label };
}

// ---- end replicated bodies ----

describe('DiffBadge DIFF_MAP', () => {
  test('beginner → green + 初级', () => {
    expect(resolveDiff('beginner')).toEqual({ bg: '#10B981', label: '初级' });
  });

  test('intermediate → amber + 中级', () => {
    expect(resolveDiff('intermediate')).toEqual({ bg: '#F6B443', label: '中级' });
  });

  test('advanced → orange + 高级', () => {
    expect(resolveDiff('advanced')).toEqual({ bg: '#FB7250', label: '高级' });
  });
});

describe('DiffBadge fallback', () => {
  test('unknown diff value → gray bg + raw string as label', () => {
    expect(resolveDiff('expert')).toEqual({ bg: '#9CA3AF', label: 'expert' });
  });

  test('arbitrary custom level renders raw label', () => {
    expect(resolveDiff('native')).toEqual({ bg: '#9CA3AF', label: 'native' });
  });

  test('empty string → gray bg + empty label (falsy key hits fallback)', () => {
    expect(resolveDiff('')).toEqual({ bg: '#9CA3AF', label: '' });
  });

  test('undefined diff → gray bg + undefined label', () => {
    expect(resolveDiff(undefined)).toEqual({ bg: '#9CA3AF', label: undefined });
  });

  test('null diff → gray bg + null label', () => {
    expect(resolveDiff(null)).toEqual({ bg: '#9CA3AF', label: null });
  });

  test('known keys never fall through to gray', () => {
    for (const key of ['beginner', 'intermediate', 'advanced']) {
      expect(resolveDiff(key).bg).not.toBe('#9CA3AF');
    }
  });
});
