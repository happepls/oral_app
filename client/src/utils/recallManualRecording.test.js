import { Blob as NodeBlob } from 'buffer';
import { createRecallManualRecording, encodeRecallWav } from './recallManualRecording';

let recorders, track, context;
const originalBlob = global.Blob;
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
beforeEach(() => {
  jest.useFakeTimers();
  global.Blob = NodeBlob;
  recorders = [];
  track = { stop: jest.fn() };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [track] }),
  } });
  context = { resume: jest.fn().mockResolvedValue(), close: jest.fn().mockResolvedValue(),
    decodeAudioData: jest.fn().mockResolvedValue({ duration: 1 }) };
  window.AudioContext = jest.fn(() => context);
  window.OfflineAudioContext = jest.fn(() => ({
    createBufferSource: () => ({ connect() {}, start() {} }),
    startRendering: jest.fn().mockResolvedValue({ getChannelData: () => new Float32Array(16000).fill(.1) }),
  }));
  window.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['synthetic']) });
      this.onstop?.();
    }
  };
});
afterEach(() => { global.Blob = originalBlob; jest.useRealTimers(); });
function setup() {
  const callbacks = { onComplete: jest.fn(), onError: jest.fn(), onEnd: jest.fn(), onStopping: jest.fn(),
    transcribe: jest.fn().mockResolvedValue({ text: 'はい、はい。' }) };
  return { ...callbacks, session: createRecallManualRecording({ language: 'ja', ...callbacks }) };
}

test('pauses never submit; explicit stop uploads one WAV and retains actual repetition', async () => {
  const s = setup(); await tick();
  jest.advanceTimersByTime(20000); await tick();
  expect(recorders[0].state).toBe('recording');
  expect(s.transcribe).not.toHaveBeenCalled();
  s.session.stop(); s.session.stop(); await tick();
  expect(s.transcribe).toHaveBeenCalledTimes(1);
  const [blob, language] = s.transcribe.mock.calls[0];
  expect(blob.type).toBe('audio/wav'); expect(language).toBe('ja');
  expect(s.onComplete).toHaveBeenCalledWith('はい、はい。');
  expect(s.onEnd).toHaveBeenCalledTimes(1);
  expect(track.stop).toHaveBeenCalled();
});

test('WAV encoder carries the actual audio in mono 16k PCM', async () => {
  const bytes = await encodeRecallWav(new Float32Array([-1, 0, 1])).arrayBuffer();
  const view = new DataView(bytes);
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getInt16(44, true)).toBe(-32768);
  expect(view.getInt16(48, true)).toBe(32767);
});

test.each(['cancel', 'stop'])('late microphone permission after %s releases tracks without uploading', async action => {
  let resolve;
  navigator.mediaDevices.getUserMedia.mockImplementation(() => new Promise(r => { resolve = r; }));
  const s = setup(); await tick();
  s.session[action]();
  resolve({ getTracks: () => [track] }); await tick();
  expect(track.stop).toHaveBeenCalled();
  expect(s.transcribe).not.toHaveBeenCalled();
});

test('cancel during upload aborts request and ignores late final text', async () => {
  const s = setup(); let resolve;
  s.transcribe.mockImplementation(() => new Promise(r => { resolve = r; }));
  await tick(); s.session.stop(); await tick();
  s.session.cancel();
  expect(s.transcribe.mock.calls[0][2].signal.aborted).toBe(true);
  resolve({ text: 'late' }); await tick();
  expect(s.onComplete).not.toHaveBeenCalled();
  expect(s.onEnd).not.toHaveBeenCalled();
});

test.each(['interrupted', 'limit', 'permission', 'empty', 'provider'])('%s fails without partial scoring', async mode => {
  if (mode === 'permission') navigator.mediaDevices.getUserMedia.mockRejectedValue({ name: 'NotAllowedError' });
  if (mode === 'empty') context.decodeAudioData.mockResolvedValue({ duration: 0 });
  const s = setup();
  if (mode === 'provider') s.transcribe.mockRejectedValue(new Error('unavailable'));
  await tick();
  if (mode === 'interrupted') recorders[0].onstop();
  if (mode === 'limit') jest.advanceTimersByTime(120000);
  if (['empty', 'provider'].includes(mode)) s.session.stop();
  await tick();
  expect(s.onError).toHaveBeenCalledTimes(1);
  expect(s.onComplete).not.toHaveBeenCalled();
  expect(s.onEnd).toHaveBeenCalledTimes(1);
});
