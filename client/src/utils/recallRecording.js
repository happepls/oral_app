// One explicit recording owns a frozen sentence/step across browser ASR restarts.
export function createRecallRecording({ Recognition, lang, onComplete, onError, onEnd }) {
  let recognizer;
  let listening = true;
  let cancelled = false;
  let finished = false;
  let segments = [];
  let results = [];
  let restarts = 0;

  const finish = () => {
    if (finished || cancelled) return;
    finished = true;
    const text = segments.join(' ').trim();
    if (text) onComplete(text);
    onEnd();
  };
  const start = () => {
    const current = new Recognition();
    const startedAt = Date.now();
    recognizer = current;
    results = [];
    current.lang = lang;
    current.continuous = true;
    current.interimResults = true;
    current.maxAlternatives = 1;
    current.onresult = event => {
      if (cancelled || finished || recognizer !== current) return;
      results = Array.from(event.results, result => result[0]?.transcript || '');
      restarts = 0;
    };
    current.onerror = event => {
      if (cancelled || finished || recognizer !== current) return;
      if (event.error === 'no-speech') return;
      listening = false;
      cancelled = true;
      onError(event.error);
      onEnd();
    };
    current.onend = () => {
      if (cancelled || finished || recognizer !== current) return;
      segments.push(results.join(' '));
      results = [];
      // Bound rapid broken-engine loops, not ordinary silence timeouts.
      if (Date.now() - startedAt >= 1000) restarts = 0;
      if (listening && restarts++ < 3) start();
      else if (listening) {
        cancelled = true;
        onError('recognition-ended');
        onEnd();
      } else finish();
    };
    try { current.start(); }
    catch (error) {
      cancelled = true;
      onError(error.name || 'recognition-start');
      onEnd();
    }
  };
  start();
  return {
    stop() {
      if (!listening || cancelled || finished) return;
      listening = false;
      try { recognizer.stop(); } catch { finish(); }
    },
    cancel() {
      cancelled = true;
      listening = false;
      try { recognizer.abort(); } catch {}
    },
  };
}
