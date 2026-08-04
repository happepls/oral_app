function normalizedContent(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function historyContentKey(message) {
  return `${message?.type || ''}\u0000${normalizedContent(message?.content)}`;
}

// Older autosaves could store the text-only and audio-enriched versions of one
// bubble as adjacent records. Merge only compatible adjacent versions: two
// genuine repetitions with different audio URLs remain separate turns.
export function collapseAdjacentHistoryDuplicates(messages) {
  return (messages || []).reduce((result, message) => {
    const previous = result[result.length - 1];
    const sameBubble = previous
      && historyContentKey(previous) === historyContentKey(message);
    const compatibleAudio = sameBubble && (
      !previous.audioUrl
      || !message.audioUrl
      || previous.audioUrl === message.audioUrl
    );

    if (!compatibleAudio) {
      result.push(message);
      return result;
    }

    const richerMessage = message.audioUrl ? message : previous;
    result[result.length - 1] = {
      ...previous,
      ...richerMessage,
      content: message.content || previous.content,
      audioUrl: message.audioUrl || previous.audioUrl || null,
      historyId: richerMessage.historyId || previous.historyId,
    };
    return result;
  }, []);
}

// A full snapshot may be saved repeatedly while a bubble gains its audio URL.
// Stable IDs make those saves updates instead of new MongoDB array entries.
export function prepareHistorySnapshot(messages) {
  return (messages || [])
    .filter(message => message.isFinal || message.type === 'ai')
    .map((message, index) => {
      const role = message.type === 'user' ? 'user' : 'assistant';
      const stableId = message.historyId
        || message.id
        || message.responseId
        || `conversation-turn-${index}-${role}`;
      return {
        id: String(stableId).slice(0, 128),
        role,
        content: message.content,
        audioUrl: message.audioUrl || null,
      };
    });
}
