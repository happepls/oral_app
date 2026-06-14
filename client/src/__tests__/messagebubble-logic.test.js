// Unit tests for the display-state branching in components/MessageBubble.jsx.
//
// MessageBubble has two key branches that don't require rendering React:
//   1. The bubble body: `state === "loading"` shows the typing dots, otherwise
//      it shows the message text (+ optional voice/footer/translation).
//   2. The voice bubble: `(audioUrl || audioDuration) && !isUser` decides whether
//      the VoiceBubble (audio playback) is shown.
// Both predicates are replicated VERBATIM below. If you change the branch
// conditions in MessageBubble.jsx, mirror the change here.

// ---- replicated verbatim from client/src/components/MessageBubble.jsx ----

// `const isUser = type === "user";`
function isUser(type) {
  return type === 'user';
}

// Body branch: `{state === "loading" ? <dots/> : <text.../>}`
function bodyMode(state) {
  return state === 'loading' ? 'loading' : 'content';
}

// Voice branch: `{(audioUrl || audioDuration) && !isUser && <VoiceBubble.../>}`
function showVoiceBubble({ type, audioUrl, audioDuration }) {
  return !!((audioUrl || audioDuration) && !isUser(type));
}

// ---- end replicated bodies ----

describe('MessageBubble body branch', () => {
  test("state 'loading' → loading dots branch", () => {
    expect(bodyMode('loading')).toBe('loading');
  });

  test("state 'default' → content branch", () => {
    expect(bodyMode('default')).toBe('content');
  });

  test('omitted/undefined state → content branch (default prop is "default")', () => {
    expect(bodyMode(undefined)).toBe('content');
  });

  test('any non-loading state renders content (e.g. "error")', () => {
    expect(bodyMode('error')).toBe('content');
  });
});

describe('MessageBubble voice-bubble branch', () => {
  test('AI message with audioUrl → shows voice bubble', () => {
    expect(showVoiceBubble({ type: 'ai', audioUrl: 'https://x/a.wav' })).toBe(true);
  });

  test('AI message with audioDuration only → shows voice bubble', () => {
    expect(showVoiceBubble({ type: 'ai', audioDuration: 3.2 })).toBe(true);
  });

  test('AI message with neither audioUrl nor audioDuration → no voice bubble', () => {
    expect(showVoiceBubble({ type: 'ai' })).toBe(false);
  });

  test('user message with audioUrl → no voice bubble (gated by !isUser)', () => {
    expect(showVoiceBubble({ type: 'user', audioUrl: 'https://x/a.wav' })).toBe(false);
  });

  test('user message with audioDuration → no voice bubble', () => {
    expect(showVoiceBubble({ type: 'user', audioDuration: 5 })).toBe(false);
  });

  test('audioDuration of 0 is falsy → no voice bubble when no url', () => {
    expect(showVoiceBubble({ type: 'ai', audioDuration: 0 })).toBe(false);
  });

  test('empty-string audioUrl is falsy → no voice bubble when no duration', () => {
    expect(showVoiceBubble({ type: 'ai', audioUrl: '' })).toBe(false);
  });

  test('returns a strict boolean (not the truthy operand)', () => {
    const r = showVoiceBubble({ type: 'ai', audioUrl: 'https://x/a.wav' });
    expect(typeof r).toBe('boolean');
  });
});

describe('MessageBubble isUser', () => {
  test("type 'user' → true", () => {
    expect(isUser('user')).toBe(true);
  });

  test("type 'ai' → false", () => {
    expect(isUser('ai')).toBe(false);
  });

  test('undefined type → false', () => {
    expect(isUser(undefined)).toBe(false);
  });
});
