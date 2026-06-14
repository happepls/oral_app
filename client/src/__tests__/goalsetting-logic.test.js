/**
 * Tests for pure logic extracted from GoalSetting.js:
 *  - calcQuizScore / scoreToProficiency / getLevel (quiz scoring)
 *  - custom-goal-type resolution (finalGoalType)
 *  - selectedVoice fallback against VOICE_OPTIONS
 *
 * These functions are replicated verbatim from client/src/pages/GoalSetting.js
 * (and config/personaConfig.js) so the logic can be unit-tested without
 * mounting the full multi-step wizard component.
 */

// ── Replicated from GoalSetting.js: QUIZ_QUESTIONS ──
const QUIZ_QUESTIONS = [
  {
    id: 'q1', icon: '🌍',
    question: '你目前最常接触外语的场景是什么？',
    type: 'single',
    options: [
      { label: '几乎不接触，靠课本/应试', score: 0, emoji: '📚' },
      { label: '偶尔刷外语内容（视频/音乐）', score: 2, emoji: '🎵' },
      { label: '工作/学习中需要读写，但很少开口', score: 4, emoji: '💻' },
      { label: '身边有外国同事或朋友，常用外语', score: 7, emoji: '👥' },
      { label: '生活在外语环境中，天天沉浸', score: 10, emoji: '✈️' },
    ],
  },
  {
    id: 'q2', icon: '⏰',
    question: '你多久会主动开口说外语？',
    type: 'single',
    options: [
      { label: '从来不说，太怕尴尬了', score: 0, emoji: '🙈' },
      { label: '偶尔（一个月不到几次）', score: 2, emoji: '😅' },
      { label: '每周都会说几次', score: 4, emoji: '😊' },
      { label: '几乎每天都开口', score: 6, emoji: '💬' },
    ],
  },
  {
    id: 'q3', icon: '☕',
    question: '遇到外国人随意闲聊（small talk），你通常怎么反应？',
    type: 'single',
    options: [
      { label: '沉默或摆手，完全不知道说啥', score: 0, emoji: '😶' },
      { label: '能应付简单问候，再深入就卡壳', score: 2, emoji: '😬' },
      { label: '可以聊天气、爱好等轻松话题', score: 5, emoji: '🙂' },
      { label: '聊得来，能玩梗开玩笑', score: 7, emoji: '😄' },
      { label: '完全没压力，融入当地人圈子', score: 9, emoji: '🤝' },
    ],
  },
  {
    id: 'q4', icon: '✅',
    question: '以下场景，你能独立应对哪些？（可多选）',
    type: 'multi',
    options: [
      { label: '问路或乘坐公共交通', emoji: '🚌' },
      { label: '餐厅点餐、咖啡厅闲聊', emoji: '🍽️' },
      { label: '工作中介绍自己或做简单汇报', emoji: '💼' },
      { label: '和朋友讨论新闻、电影或热点话题', emoji: '📱' },
      { label: '无字幕看懂外语电影/综艺', emoji: '🎬' },
    ],
  },
];

// ── Replicated from GoalSetting.js: LEVEL_MAP + getLevel ──
const LEVEL_MAP = [
  { min: 0,  max: 4,  cefr: 'A1', label: '入门级', tag: 'Beginner',          color: '#10B981', emoji: '🌱' },
  { min: 5,  max: 9,  cefr: 'A2', label: '基础级', tag: 'Elementary',        color: '#3B82F6', emoji: '📖' },
  { min: 10, max: 15, cefr: 'B1', label: '中级',   tag: 'Intermediate',      color: '#637FF1', emoji: '🗣️' },
  { min: 16, max: 21, cefr: 'B2', label: '中高级', tag: 'Upper-Intermediate', color: '#8B5CF6', emoji: '💼' },
  { min: 22, max: 24, cefr: 'C1', label: '高级',   tag: 'Advanced',          color: '#F59E0B', emoji: '🌟' },
  { min: 25, max: 99, cefr: 'C2', label: '近母语级', tag: 'Fluent',          color: '#EF4444', emoji: '🏆' },
];

function getLevel(score) {
  return LEVEL_MAP.find(l => score >= l.min && score <= l.max) || LEVEL_MAP[0];
}

function calcQuizScore(answers) {
  let total = 0;
  QUIZ_QUESTIONS.forEach(q => {
    const ans = answers[q.id];
    if (!ans) return;
    if (q.type === 'single') {
      const opt = q.options.find(o => o.label === ans);
      if (opt) total += opt.score;
    } else {
      total += (ans || []).length;
    }
  });
  return total;
}

function scoreToProficiency(score) {
  const max = 10 + 6 + 9 + 5; // 30
  return Math.round(Math.min(100, (score / max) * 100));
}

// ── Replicated from GoalSetting.js: custom-goal-type resolution ──
function resolveFinalGoalType(goalType, customGoalType) {
  return goalType === 'custom' ? customGoalType.trim() : goalType;
}

// custom validation guard (handleGenerateScenarios / handleSubmit early return)
function isCustomGoalInvalid(goalType, customGoalType) {
  return goalType === 'custom' && !customGoalType.trim();
}

// ── Replicated from GoalSetting.js + personaConfig.js: voice fallback ──
const VOICE_OPTIONS = [
  { id: 'Tina' },
  { id: 'Serena' },
  { id: 'Evan' },
  { id: 'Arda' },
];

function resolveStoredVoice(stored) {
  return VOICE_OPTIONS.some(v => v.id === stored) ? stored : 'Tina';
}

describe('calcQuizScore', () => {
  test('empty answers → 0', () => {
    expect(calcQuizScore({})).toBe(0);
  });

  test('ignores unanswered / unknown labels', () => {
    expect(calcQuizScore({ q1: '不存在的选项' })).toBe(0);
    expect(calcQuizScore({ q2: undefined })).toBe(0);
  });

  test('sums single-choice scores', () => {
    // q1 max=10, q2 max=6, q3 max=9
    expect(calcQuizScore({
      q1: '生活在外语环境中，天天沉浸', // 10
      q2: '几乎每天都开口',           // 6
      q3: '完全没压力，融入当地人圈子', // 9
    })).toBe(25);
  });

  test('multi-choice counts selected items (1 point each)', () => {
    expect(calcQuizScore({
      q4: ['问路或乘坐公共交通', '餐厅点餐、咖啡厅闲聊'],
    })).toBe(2);
  });

  test('multi-choice empty array → 0', () => {
    expect(calcQuizScore({ q4: [] })).toBe(0);
  });

  test('combined single + multi maxes out at 30', () => {
    expect(calcQuizScore({
      q1: '生活在外语环境中，天天沉浸',   // 10
      q2: '几乎每天都开口',             // 6
      q3: '完全没压力，融入当地人圈子',   // 9
      q4: ['问路或乘坐公共交通', '餐厅点餐、咖啡厅闲聊', '工作中介绍自己或做简单汇报',
           '和朋友讨论新闻、电影或热点话题', '无字幕看懂外语电影/综艺'], // 5
    })).toBe(30);
  });

  test('lowest single-choice answers → 0', () => {
    expect(calcQuizScore({
      q1: '几乎不接触，靠课本/应试', // 0
      q2: '从来不说，太怕尴尬了',     // 0
      q3: '沉默或摆手，完全不知道说啥', // 0
    })).toBe(0);
  });
});

describe('scoreToProficiency', () => {
  test('0 → 0', () => {
    expect(scoreToProficiency(0)).toBe(0);
  });

  test('max (30) → 100', () => {
    expect(scoreToProficiency(30)).toBe(100);
  });

  test('half (15) → 50', () => {
    expect(scoreToProficiency(15)).toBe(50);
  });

  test('rounds to nearest integer', () => {
    // 10/30 = 33.33 → 33
    expect(scoreToProficiency(10)).toBe(33);
    // 20/30 = 66.66 → 67
    expect(scoreToProficiency(20)).toBe(67);
  });

  test('caps at 100 even if score exceeds max', () => {
    expect(scoreToProficiency(45)).toBe(100);
  });
});

describe('getLevel boundaries', () => {
  test('score 0 → A1 (Beginner)', () => {
    expect(getLevel(0).cefr).toBe('A1');
  });

  test('upper edge of A1 (4) stays A1', () => {
    expect(getLevel(4).cefr).toBe('A1');
  });

  test('lower edge of A2 (5) → A2', () => {
    expect(getLevel(5).cefr).toBe('A2');
  });

  test('upper edge of A2 (9) → A2', () => {
    expect(getLevel(9).cefr).toBe('A2');
  });

  test('lower edge of B1 (10) → B1', () => {
    expect(getLevel(10).cefr).toBe('B1');
  });

  test('upper edge of B1 (15) → B1', () => {
    expect(getLevel(15).cefr).toBe('B1');
  });

  test('lower edge of B2 (16) → B2', () => {
    expect(getLevel(16).cefr).toBe('B2');
  });

  test('lower edge of C1 (22) → C1', () => {
    expect(getLevel(22).cefr).toBe('C1');
  });

  test('C1 upper edge (24) → C1', () => {
    expect(getLevel(24).cefr).toBe('C1');
  });

  test('lower edge of C2 (25) → C2', () => {
    expect(getLevel(25).cefr).toBe('C2');
  });

  test('out-of-range high score still resolves (≤99) → C2', () => {
    expect(getLevel(99).cefr).toBe('C2');
  });

  test('out-of-range / negative falls back to LEVEL_MAP[0] (A1)', () => {
    expect(getLevel(-1).cefr).toBe('A1');
    expect(getLevel(100).cefr).toBe('A1'); // beyond max(99) → no match → fallback
  });
});

describe('custom-goal-type resolution', () => {
  test('non-custom goalType returns goalType as-is', () => {
    expect(resolveFinalGoalType('daily_conversation', '')).toBe('daily_conversation');
    expect(resolveFinalGoalType('business_meeting', 'ignored')).toBe('business_meeting');
  });

  test('custom goalType returns trimmed customGoalType', () => {
    expect(resolveFinalGoalType('custom', '  机场值机对话  ')).toBe('机场值机对话');
  });

  test('custom with only-whitespace value trims to empty string', () => {
    expect(resolveFinalGoalType('custom', '   ')).toBe('');
  });
});

describe('custom-goal empty-value validation', () => {
  test('custom + empty string → invalid', () => {
    expect(isCustomGoalInvalid('custom', '')).toBe(true);
  });

  test('custom + whitespace-only → invalid', () => {
    expect(isCustomGoalInvalid('custom', '   ')).toBe(true);
  });

  test('custom + real value → valid', () => {
    expect(isCustomGoalInvalid('custom', '面试模拟')).toBe(false);
  });

  test('non-custom + empty value → valid (preset goal needs no custom text)', () => {
    expect(isCustomGoalInvalid('travel_survival', '')).toBe(false);
  });
});

describe('selectedVoice fallback', () => {
  test.each(['Tina', 'Serena', 'Evan', 'Arda'])(
    'valid stored voice "%s" is kept',
    (voice) => {
      expect(resolveStoredVoice(voice)).toBe(voice);
    }
  );

  test('invalid stored voice falls back to Tina', () => {
    expect(resolveStoredVoice('Cherry')).toBe('Tina');
    expect(resolveStoredVoice('Nofish')).toBe('Tina');
    expect(resolveStoredVoice('Momo')).toBe('Tina');
    expect(resolveStoredVoice('Ryan')).toBe('Tina');
  });

  test('null / empty stored voice falls back to Tina', () => {
    expect(resolveStoredVoice(null)).toBe('Tina');
    expect(resolveStoredVoice(undefined)).toBe('Tina');
    expect(resolveStoredVoice('')).toBe('Tina');
  });
});
