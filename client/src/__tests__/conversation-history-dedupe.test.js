import {
  collapseAdjacentHistoryDuplicates,
  prepareHistorySnapshot,
  reconcileUserTranscript,
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

  test('collapses a non-adjacent legacy snapshot copy without removing real repeated turns', () => {
    const result = collapseAdjacentHistoryDuplicates([
      { type: 'user', content: 'Start again', historyId: 'asr-item-1' },
      { type: 'ai', content: 'Ready when you are', historyId: 'ai-1' },
      { type: 'user', content: 'Start again', historyId: 'conversation-turn-2-user' },
      { type: 'user', content: 'Start again', historyId: 'asr-item-2', audioUrl: 'attempt-2.mp3' },
    ]);

    expect(result).toEqual([
      expect.objectContaining({ type: 'user', content: 'Start again', historyId: 'asr-item-1' }),
      expect.objectContaining({ type: 'ai', content: 'Ready when you are' }),
      expect.objectContaining({ type: 'user', content: 'Start again', historyId: 'asr-item-2' }),
    ]);
  });

  test('reconciles the ASR transcript into the recorder placeholder with the server ID', () => {
    const once = reconcileUserTranscript([
      { type: 'ai', content: 'Your turn', isFinal: true },
      { type: 'user', content: '...', isFinal: false, id: 'local-recording-1', audioUrl: 'user.mp3' },
    ], {
      text: 'Start again',
      messageId: 'asr-item-1',
      currentMessageId: 'local-recording-1',
    });
    const replayed = reconcileUserTranscript(once, {
      text: 'Start again',
      messageId: 'asr-item-1',
      currentMessageId: 'local-recording-1',
    });

    expect(replayed).toHaveLength(2);
    expect(replayed[1]).toEqual(expect.objectContaining({
      id: 'local-recording-1',
      historyId: 'asr-item-1',
      content: 'Start again',
      audioUrl: 'user.mp3',
      isFinal: true,
    }));
    expect(prepareHistorySnapshot(replayed)[1].id).toBe('asr-item-1');
  });
});
