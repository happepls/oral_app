function normalizedContent(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function historyContentKey(message) {
  return `${message?.type || ''}\u0000${normalizedContent(message?.content)}`;
}

function messageIdentity(message) {
  return String(message?.historyId || message?.id || message?.responseId || '');
}

function isLegacySnapshotMessage(message) {
  return /^conversation-turn-\d+-(?:user|assistant)$/.test(messageIdentity(message));
}

function mergeHistoryVersions(previous, message) {
  const previousIsLegacy = isLegacySnapshotMessage(previous);
  const messageIsLegacy = isLegacySnapshotMessage(message);
  const canonical = previousIsLegacy && !messageIsLegacy
    ? message
    : (!previousIsLegacy && messageIsLegacy ? previous : (message.audioUrl ? message : previous));
  const richerMessage = message.audioUrl ? message : previous;

  return {
    ...previous,
    ...richerMessage,
    content: message.content || previous.content,
    audioUrl: message.audioUrl || previous.audioUrl || null,
    historyId: canonical.historyId || canonical.id || previous.historyId || message.historyId,
  };
}

// Older autosaves could store the text-only and audio-enriched versions of one
// bubble as adjacent records. Merge only compatible adjacent versions: two
// genuine repetitions with different audio URLs remain separate turns.
export function collapseAdjacentHistoryDuplicates(messages) {
  return (messages || []).reduce((result, message) => {
    // Frontend snapshots created before ASR IDs were forwarded used an
    // index-based ID. The AI service stored the same turn with its real ASR ID,
    // and asynchronous writes could place those copies on opposite sides of an
    // assistant reply. Collapse that known legacy pair even when non-adjacent,
    // while preserving genuine repeated turns that have two real IDs.
    const legacyMatchIndex = result.findIndex(existing => (
      historyContentKey(existing) === historyContentKey(message)
      && (isLegacySnapshotMessage(existing) || isLegacySnapshotMessage(message))
    ));
    if (legacyMatchIndex !== -1) {
      result[legacyMatchIndex] = mergeHistoryVersions(result[legacyMatchIndex], message);
      return result;
    }

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

    result[result.length - 1] = mergeHistoryVersions(previous, message);
    return result;
  }, []);
}

// Reconcile the final ASR transcript with the placeholder created when the
// recorder starts. Keeping the local `id` lets a late user audio_url event find
// the bubble; `historyId` carries the server ASR ID so frontend autosave and the
// AI service upsert the same MongoDB message.
export function reconcileUserTranscript(messages, { text, messageId, currentMessageId } = {}) {
  const content = String(text || '').trim();
  if (!content) return messages || [];

  const stableId = String(messageId || '').trim();
  const next = [...(messages || [])];
  let matchIndex = -1;

  if (stableId) {
    matchIndex = next.findIndex(message => (
      message.type === 'user' && messageIdentity(message) === stableId
    ));
  }
  if (matchIndex === -1 && currentMessageId) {
    for (let index = next.length - 1; index >= 0; index -= 1) {
      if (next[index].type === 'user' && next[index].id === currentMessageId) {
        matchIndex = index;
        break;
      }
    }
  }
  if (matchIndex === -1) {
    for (let index = next.length - 1; index >= 0; index -= 1) {
      if (next[index].type === 'user' && !next[index].isFinal) {
        matchIndex = index;
        break;
      }
    }
  }

  if (matchIndex !== -1) {
    next[matchIndex] = {
      ...next[matchIndex],
      content,
      isFinal: true,
      ...(stableId ? { historyId: stableId } : {}),
      ...(stableId ? { turn_id: stableId } : {}),
    };
    return next;
  }

  let insertIndex = next.length;
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index].type === 'ai' && !next[index].isFinal) {
      insertIndex = index;
      break;
    }
  }
  next.splice(insertIndex, 0, {
    type: 'user',
    content,
    isFinal: true,
    ...(currentMessageId ? { id: currentMessageId } : {}),
    ...(stableId ? { historyId: stableId } : {}),
    ...(stableId ? { turn_id: stableId } : {}),
  });
  return next;
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
        ...(message.scenario ? { scenario: message.scenario } : {}),
        ...(message.task_id != null ? { task_id: String(message.task_id) } : {}),
        ...(message.turn_id ? { turn_id: message.turn_id } : {}),
      };
    });
}
