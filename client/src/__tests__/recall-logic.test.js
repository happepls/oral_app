// Unit tests for the module-scope pure helpers in pages/Recall.js.
//
// Those helpers (normalize/similarity/extractSentences/pickRecallScenario) are
// NOT exported from Recall.js — they're private to the module. To test them in
// isolation without pulling in React / Web Speech / motion-react, their bodies
// are replicated VERBATIM below. If you change the originals in Recall.js, mirror
// the change here so the tests keep guarding the real behavior.

// ---- replicated verbatim from client/src/pages/Recall.js ----

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  a = normalize(a);
  b = normalize(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  const dp = Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

function extractSentences(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map(t => (typeof t === 'string' ? t : (t?.text || t?.description || t?.title || '')))
    .map(s => s.trim())
    .filter(Boolean);
}

function pickRecallScenario(scenarios, skipIndex) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return null;
  const startIdx = typeof skipIndex === 'number' ? skipIndex : 0;
  // Search from startIdx forward, wrapping around
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[(startIdx + i) % scenarios.length];
    const taskList = Array.isArray(s.tasks) ? s.tasks : [];
    if (taskList.length > 0) return s;
  }
  return scenarios[0];
}

// ---- end replicated bodies ----

describe('normalize', () => {
  test('returns empty string for null/undefined/empty input', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
    expect(normalize('')).toBe('');
  });

  test('lowercases and collapses whitespace', () => {
    expect(normalize('  Hello   WORLD  ')).toBe('hello world');
  });

  test('strips ASCII punctuation to spaces', () => {
    expect(normalize('Hello, world!')).toBe('hello world');
    expect(normalize('a.b.c')).toBe('a b c');
  });

  test('strips CJK punctuation (。！？，)', () => {
    // Chinese full-width punctuation must be removed by the \p{P} unicode class.
    expect(normalize('你好，世界。')).toBe('你好 世界');
    expect(normalize('真的吗？是的！')).toBe('真的吗 是的');
    expect(normalize('「引用」')).toBe('引用');
  });

  test('strips symbols (\\p{S}) like currency and math', () => {
    expect(normalize('cost $5 + tax')).toBe('cost 5 tax');
  });

  test('preserves CJK characters themselves (not punctuation)', () => {
    expect(normalize('今天天气好')).toBe('今天天气好');
  });
});

describe('similarity', () => {
  test('returns 0 when either side is empty after normalize', () => {
    expect(similarity('', 'hello')).toBe(0);
    expect(similarity('hello', '')).toBe(0);
    expect(similarity('', '')).toBe(0);
    // punctuation-only normalizes to empty → 0
    expect(similarity('!!!', 'hello')).toBe(0);
  });

  test('returns 1 for identical strings', () => {
    expect(similarity('hello world', 'hello world')).toBe(1);
  });

  test('returns 1 for strings identical only after normalization', () => {
    expect(similarity('Hello, World!', 'hello   world')).toBe(1);
    expect(similarity('你好，世界。', '你好 世界')).toBe(1);
  });

  test('result is always within [0, 1] range', () => {
    const pairs = [
      ['abcdef', 'ghijkl'],   // disjoint
      ['kitten', 'sitting'],  // partial
      ['the quick brown fox', 'a totally different sentence here'],
      ['今天天气很好', '昨天下雨了呢'],
    ];
    for (const [a, b] of pairs) {
      const r = similarity(a, b);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  test('disjoint strings score low but non-negative', () => {
    // No shared characters → edit distance == max length → similarity 0.
    expect(similarity('aaaa', 'bbbb')).toBe(0);
  });

  test('is symmetric', () => {
    expect(similarity('kitten', 'sitting')).toBeCloseTo(similarity('sitting', 'kitten'), 10);
  });

  test('closer strings score higher than disjoint ones', () => {
    const close = similarity('hello world', 'hello word');
    const far = similarity('hello world', 'xyzzy plugh');
    expect(close).toBeGreaterThan(far);
    expect(close).toBeGreaterThan(0.6); // above the SIMILARITY_THRESHOLD used by Recall
  });
});

describe('extractSentences', () => {
  test('returns empty array for non-array input', () => {
    expect(extractSentences(null)).toEqual([]);
    expect(extractSentences(undefined)).toEqual([]);
    expect(extractSentences('not an array')).toEqual([]);
    expect(extractSentences({})).toEqual([]);
  });

  test('returns empty array for empty array', () => {
    expect(extractSentences([])).toEqual([]);
  });

  test('handles plain string tasks', () => {
    expect(extractSentences(['hello', 'world'])).toEqual(['hello', 'world']);
  });

  test('extracts via text/description/title precedence', () => {
    expect(extractSentences([{ text: 'A' }])).toEqual(['A']);
    expect(extractSentences([{ description: 'B' }])).toEqual(['B']);
    expect(extractSentences([{ title: 'C' }])).toEqual(['C']);
    // text wins over description wins over title
    expect(extractSentences([{ text: 'T', description: 'D', title: 'Ti' }])).toEqual(['T']);
    expect(extractSentences([{ description: 'D', title: 'Ti' }])).toEqual(['D']);
  });

  test('trims whitespace and filters out empties', () => {
    expect(extractSentences(['  spaced  ', '', '   ', 'kept'])).toEqual(['spaced', 'kept']);
  });

  test('drops objects with no usable field', () => {
    expect(extractSentences([{ foo: 'bar' }, { text: 'ok' }])).toEqual(['ok']);
  });

  test('mixed strings and objects', () => {
    const tasks = ['plain', { text: 'fromText' }, { title: 'fromTitle' }, ''];
    expect(extractSentences(tasks)).toEqual(['plain', 'fromText', 'fromTitle']);
  });
});

describe('pickRecallScenario', () => {
  const withTasks = (id, n) => ({ id, tasks: Array.from({ length: n }, (_, i) => `t${i}`) });

  test('returns null for empty or non-array input', () => {
    expect(pickRecallScenario([], 0)).toBeNull();
    expect(pickRecallScenario(null, 0)).toBeNull();
    expect(pickRecallScenario(undefined, 0)).toBeNull();
    expect(pickRecallScenario('nope', 0)).toBeNull();
  });

  test('returns scenario at skipIndex when it has tasks', () => {
    const scenarios = [withTasks('a', 2), withTasks('b', 3), withTasks('c', 1)];
    expect(pickRecallScenario(scenarios, 1).id).toBe('b');
  });

  test('defaults skipIndex to 0 when not a number', () => {
    const scenarios = [withTasks('a', 2), withTasks('b', 3)];
    expect(pickRecallScenario(scenarios, undefined).id).toBe('a');
    expect(pickRecallScenario(scenarios, null).id).toBe('a');
  });

  test('skips empty-task scenarios searching forward', () => {
    const scenarios = [withTasks('a', 0), withTasks('b', 0), withTasks('c', 2)];
    expect(pickRecallScenario(scenarios, 0).id).toBe('c');
  });

  test('wraps around when skipIndex >= length', () => {
    const scenarios = [withTasks('a', 2), withTasks('b', 3)];
    // skipIndex 2 % 2 === 0 → starts at 'a'
    expect(pickRecallScenario(scenarios, 2).id).toBe('a');
    // skipIndex 3 % 2 === 1 → starts at 'b'
    expect(pickRecallScenario(scenarios, 3).id).toBe('b');
    // large skipIndex still wraps
    expect(pickRecallScenario(scenarios, 100).id).toBe('a');
  });

  test('wrap-around finds a tasked scenario behind the start point', () => {
    // start at index 1 ('b', empty) → wrap to index 0 ('a', has tasks)
    const scenarios = [withTasks('a', 2), withTasks('b', 0)];
    expect(pickRecallScenario(scenarios, 1).id).toBe('a');
  });

  test('falls back to scenarios[0] when none have tasks', () => {
    const scenarios = [withTasks('a', 0), withTasks('b', 0)];
    expect(pickRecallScenario(scenarios, 0).id).toBe('a');
  });

  test('treats missing/non-array tasks as empty', () => {
    const scenarios = [{ id: 'a' }, { id: 'b', tasks: 'oops' }, withTasks('c', 1)];
    expect(pickRecallScenario(scenarios, 0).id).toBe('c');
  });
});
