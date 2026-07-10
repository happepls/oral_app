// client/src/__tests__/streaming-text-logic.test.js
import { cleanStreamingText, appendDelta, aiBubbleRenderState } from '../pages/streamingTextLogic';

describe('cleanStreamingText - closed markers', () => {
  test('strips [TASK_N_COMPLETE]', () => {
    expect(cleanStreamingText('great work [TASK_1_COMPLETE] keep going'))
      .toBe('great work  keep going');
  });
  test('strips [MAGIC_SENTENCE: ...] and <MAGIC_SENTENCE: ...>', () => {
    expect(cleanStreamingText('say [MAGIC_SENTENCE: hello world] now')).toBe('say  now');
    expect(cleanStreamingText('say <MAGIC_SENTENCE: hola> now')).toBe('say  now');
  });
  test('strips [MAGIC_PASS] / [DAILY_QA_PASSED] / [NATIVE: ...]', () => {
    expect(cleanStreamingText('done [MAGIC_PASS]')).toBe('done ');
    expect(cleanStreamingText('yes [DAILY_QA_PASSED] ok')).toBe('yes  ok');
    expect(cleanStreamingText('hi [NATIVE: 你好] there')).toBe('hi  there');
  });
  test('multiple markers in one string', () => {
    expect(cleanStreamingText('a [TASK_0_COMPLETE] b [MAGIC_PASS] c'))
      .toBe('a  b  c');
  });
});

describe('cleanStreamingText - partial (unclosed) trailing markers', () => {
  test('hides trailing "[TASK_"', () => {
    expect(cleanStreamingText('great job [TASK_')).toBe('great job ');
  });
  test('hides trailing "<MAGIC_SENTENCE: hel"', () => {
    expect(cleanStreamingText('please say <MAGIC_SENTENCE: hel')).toBe('please say ');
  });
  test('hides trailing lone bracket "[" that starts a marker word', () => {
    expect(cleanStreamingText('nice [MAGIC')).toBe('nice ');
  });
  test('does NOT swallow ordinary unclosed punctuation like "cost is (about"', () => {
    expect(cleanStreamingText('cost is (about')).toBe('cost is (about');
  });
});

describe('cleanStreamingText - benign / edge cases', () => {
  test('plain text unchanged', () => {
    expect(cleanStreamingText('hello there')).toBe('hello there');
  });
  test('closed brackets earlier in string are preserved', () => {
    expect(cleanStreamingText('see [note] here')).toBe('see [note] here');
  });
  test('empty / falsy input', () => {
    expect(cleanStreamingText('')).toBe('');
    expect(cleanStreamingText(undefined)).toBe('');
    expect(cleanStreamingText(null)).toBe('');
  });
});

describe('aiBubbleRenderState', () => {
  test('streaming with text (isFinal=false, hasContent) → text, NOT dots', () => {
    expect(aiBubbleRenderState({ isFinal: false, hasContent: true })).toBe('text');
  });
  test('streaming with no text yet (isFinal=false, empty) → dots', () => {
    expect(aiBubbleRenderState({ isFinal: false, hasContent: false })).toBe('dots');
  });
  test('final arrived, audio not yet, but has content → text (no flash back to dots)', () => {
    expect(aiBubbleRenderState({
      isFinal: true, hasContent: true, audioUrl: undefined, audioPlayed: false,
    })).toBe('text');
  });
  test('final, empty content, no audio yet → dots (legacy waiting state)', () => {
    expect(aiBubbleRenderState({
      isFinal: true, hasContent: false, audioUrl: undefined, audioPlayed: false,
    })).toBe('dots');
  });
  test('normal final with content and audioUrl → text', () => {
    expect(aiBubbleRenderState({
      isFinal: true, hasContent: true, audioUrl: 'https://x/a.wav', audioPlayed: false,
    })).toBe('text');
  });
  test('history message: audioPlayed=true, no audioUrl, has content → text', () => {
    expect(aiBubbleRenderState({
      isFinal: true, hasContent: true, audioUrl: undefined, audioPlayed: true,
    })).toBe('text');
  });
  test('history message empty content, audioPlayed=true → text (skip loading)', () => {
    expect(aiBubbleRenderState({
      isFinal: true, hasContent: false, audioUrl: undefined, audioPlayed: true,
    })).toBe('text');
  });
});

describe('appendDelta', () => {
  test('accumulates raw deltas', () => {
    expect(appendDelta('foo', 'bar')).toBe('foobar');
  });
  test('handles falsy previous/delta', () => {
    expect(appendDelta(undefined, 'x')).toBe('x');
    expect(appendDelta('x', undefined)).toBe('x');
    expect(appendDelta(null, null)).toBe('');
  });
});
