// One explicit recording owns a frozen sentence/step across browser ASR restarts.
// Result indexes belong to one engine instance. Only confirmed slots survive
// a restart; interim hypotheses replace the preview and never enter scoring.
export function shouldUseSingleUtteranceRecognition(nav = typeof navigator === 'undefined' ? undefined : navigator) {
  return nav?.userAgentData?.platform === 'Android' || /Android/i.test(nav?.userAgent || '');
}

export function createRecallRecording({
  Recognition, lang, onComplete, onError, onEnd,
  onPreview = () => {}, onStopping = () => {}, stopTimeoutMs = 4000,
  onDiagnostic = () => {},
  singleUtterance = false,
}) {
  let recognizer;
  let listening = true;
  let settled = false;
  const segments = [];
  let restarts = 0;
  let stopTimer;
  let engineIndex = 0;

  const release = () => {
    clearTimeout(stopTimer);
    const current = recognizer;
    recognizer = null;
    if (current) {
      current.onresult = current.onerror = current.onend = null;
      try { current.abort(); } catch {}
    }
  };
  const settle = error => {
    if (settled) return;
    settled = true;
    listening = false;
    release();
    const text = segments.join(' ').trim();
    onDiagnostic({ event: 'settled', engineIndex, error: error || (!text ? 'no-speech' : null), finalLength: text.length });
    if (error || !text) onError(error || 'no-speech');
    else onComplete(text);
    onEnd();
  };
  const start = () => {
    let current;
    try { current = new Recognition(); }
    catch (error) { settle(error.name || 'recognition-start'); return; }
    const startedAt = Date.now();
    recognizer = current;
    const index = ++engineIndex;
    const finals = new Map();
    let interim = [];
    const confirmed = () => [...finals.entries()]
      .sort(([a], [b]) => a - b).map(([, text]) => text).join(' ').trim();
    const isCurrent = () => !settled && recognizer === current;
    current.lang = lang;
    // Android's continuous adapter can report incremental hypotheses as new
    // final slots. Request one utterance instead of guessing/deduplicating text.
    current.continuous = !singleUtterance;
    current.interimResults = true;
    current.maxAlternatives = 1;
    current.onresult = event => {
      if (!isCurrent()) return;
      for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finals.set(i, result[0]?.transcript || '');
      }
      // Interim slots can shrink or disappear in subsequent snapshots.
      interim = Array.from(event.results)
        .filter((result, i) => !result.isFinal && !finals.has(i))
        .map(result => result[0]?.transcript || '').filter(text => text.trim());
      onDiagnostic({ event: 'result', engineIndex: index, resultIndex: event.resultIndex ?? 0,
        finalCount: finals.size, interimCount: interim.length, finalLength: confirmed().length });
      onPreview([...segments, confirmed(), ...interim].filter(Boolean).join(' '));
      if (singleUtterance && finals.size) {
        // continuous=false promises at most one final result. Fail closed if
        // the provider violates that contract; never choose a target-like slot.
        if (finals.size !== 1 || interim.length) {
          settle('incompatible-results');
          return;
        }
        segments.push(confirmed());
        settle();
      }
    };
    current.onerror = event => {
      if (!isCurrent() || event.error === 'no-speech') return;
      settle(event.error);
    };
    current.onend = () => {
      if (!isCurrent()) return;
      onDiagnostic({ event: 'end', engineIndex: index, stopping: !listening,
        finalCount: finals.size, interimCount: interim.length, elapsedMs: Date.now() - startedAt });
      const text = confirmed();
      if (text) segments.push(text);
      // Invalidate before restarting, including callbacks already queued.
      release();
      if (!listening || singleUtterance) {
        settle(interim.length ? 'incomplete-result' : undefined);
        return;
      }
      if (Date.now() - startedAt >= 1000 || text) restarts = 0;
      if (restarts++ < 3) start();
      else settle('recognition-ended');
    };
    try { current.start(); }
    catch (error) { settle(error.name || 'recognition-start'); }
  };
  start();
  return {
    stop() {
      if (!listening || settled) return;
      listening = false;
      onStopping();
      stopTimer = setTimeout(() => settle('final-result-timeout'), stopTimeoutMs);
      try { recognizer.stop(); }
      catch { settle('recognition-stop'); }
    },
    cancel() {
      settled = true;
      listening = false;
      release();
    },
  };
}
