import {
  collapseAdjacentHistoryDuplicates,
  prepareHistorySnapshot,
} from '../utils/conversationHistory';

describe('conversation history refresh de-duplication', () => {
  test('merges adjacent text-only and audio-enriched versions of one bubble', () => {
    const result = collapseAdjacentHistoryDuplicates([
      { type: 'ai', content: 'Welcome back', audioUrl: null, historyId: 'text-version' },
      { type: 'ai', content: 'Welcome back', audioUrl: 'welcome.mp3', historyId: 'audio-version' },
      { type: 'user', content: 'Hello', audioUrl: null, historyId: 'user-text' },
      { type: 'user', content: 'Hello', audioUrl: 'hello.mp3', historyId: 'user-audio' },
    ]);

    expect(result).toEqual([
      expect.objectContaining({ type: 'ai', content: 'Welcome back', audioUrl: 'welcome.mp3', historyId: 'audio-version' }),
      expect.objectContaining({ type: 'user', content: 'Hello', audioUrl: 'hello.mp3', historyId: 'user-audio' }),
    ]);
  });

  test('preserves genuine repeated turns when their recordings differ', () => {
    const result = collapseAdjacentHistoryDuplicates([
      { type: 'user', content: 'もう一度', audioUrl: 'attempt-1.mp3' },
      { type: 'user', content: 'もう一度', audioUrl: 'attempt-2.mp3' },
    ]);

    expect(result).toHaveLength(2);
  });

  test('uses the same stable IDs before and after audio enrichment', () => {
    const textSnapshot = prepareHistorySnapshot([
      { type: 'ai', content: 'Welcome back', isFinal: true, responseId: 'response-1' },
    ]);
    const audioSnapshot = prepareHistorySnapshot([
      { type: 'ai', content: 'Welcome back', isFinal: true, responseId: 'response-1', audioUrl: 'welcome.mp3' },
    ]);

    expect(textSnapshot[0].id).toBe('response-1');
    expect(audioSnapshot[0].id).toBe(textSnapshot[0].id);
  });
});
