// Browser snapshots must never manufacture server-side audio assessment evidence.
function historyMessages(messages, trusted = false) {
  if (trusted) return messages;
  return messages.map(message => {
    const safe = { ...message };
    delete safe.input_source;
    delete safe.audio_evidence;
    return safe;
  });
}

module.exports = { historyMessages };
