// Recording is local until an explicit stop. Silence never submits a turn.
export function encodeRecallWav(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, value * (value < 0 ? 32768 : 32767), true);
  });
  return new Blob([buffer], { type: 'audio/wav' });
}

export function createRecallManualRecording({ language, transcribe, onComplete, onError, onEnd, onStopping }) {
  let cancelled = false, settled = false, stopping = false;
  let stream, recorder, context, timer;
  let chunks = [], bytes = 0;
  const controller = new AbortController();
  const clear = () => {
    clearTimeout(timer);
    if (recorder) {
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
      if (recorder.state !== 'inactive') { try { recorder.stop(); } catch {} }
    }
    stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    if (context) context.close().catch(() => {});
    chunks = [];
  };
  const finish = (error, text) => {
    if (cancelled || settled) return;
    settled = true;
    controller.abort();
    clear();
    if (error) onError(error); else onComplete(text);
    onEnd();
  };
  const alive = () => !cancelled && !settled;

  async function upload() {
    if (!alive()) return;
    if (!stopping) { finish('recording-interrupted'); return; }
    clearTimeout(timer);
    stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    timer = setTimeout(() => finish('transcription-timeout'), 60000);
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      chunks = [];
      if (!blob.size) { finish('no-speech'); return; }
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      if (!alive()) return;
      if (decoded.duration < 0.1) { finish('no-speech'); return; }
      if (decoded.duration > 120) { finish('recording-too-long'); return; }
      const offline = new window.OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
      const source = offline.createBufferSource();
      source.buffer = decoded; source.connect(offline.destination); source.start();
      const normalized = await offline.startRendering();
      if (!alive()) return;
      const audio = encodeRecallWav(normalized.getChannelData(0));
      const result = await transcribe(audio, language, { signal: controller.signal });
      if (!alive()) return;
      const text = result?.text?.trim();
      finish(text ? null : 'no-speech', text);
    } catch (error) {
      if (alive()) finish(error.status === 422 ? 'no-speech' : 'transcription-unavailable');
    }
  }

  async function start() {
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
      await context.resume();
      if (!alive()) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true, noiseSuppression: true, channelCount: 1,
      } });
      if (!alive()) { clear(); return; }
      stream.getTracks().forEach(track => { track.onended = () => finish('recording-interrupted'); });
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
        .find(type => window.MediaRecorder.isTypeSupported(type));
      recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = event => {
        if (!alive() || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > 8 * 1024 * 1024) { finish('recording-too-long'); return; }
        chunks.push(event.data);
      };
      recorder.onerror = () => finish('audio-capture');
      recorder.onstop = upload;
      recorder.start(1000);
      // Resource limit cancels with an error; it never auto-scores a partial turn.
      timer = setTimeout(() => finish('recording-too-long'), 120000);
    } catch (error) {
      finish(error.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture');
    }
  }
  start();
  return {
    stop() {
      if (!alive() || stopping) return;
      stopping = true;
      onStopping();
      clearTimeout(timer);
      if (!recorder || recorder.state === 'inactive') { finish('no-speech'); return; }
      timer = setTimeout(() => finish('recording-interrupted'), 5000);
      recorder.stop();
    },
    cancel() { cancelled = true; controller.abort(); clear(); },
  };
}
