import { AudioInputUpload } from './audioInputUpload';
const socket = () => ({ readyState: 1, send: jest.fn() });
test('120 seconds including silence are retained, coalesced, and acknowledged once', () => {
  const upload = new AudioInputUpload();
  const first = socket();
  upload.prepare('long-input', Array.from({ length: 2400 }, () => new Int16Array(800)));
  expect(upload.send(first)).toBe(true);
  const events = first.send.mock.calls.map(([raw]) => JSON.parse(raw));
  expect(events.filter(e => e.type === 'audio_stream')).toHaveLength(120);
  expect(events.at(-1)).toEqual({ type: 'user_audio_ended', payload: { input_id: 'long-input', chunks: 120 } });
  expect(upload.send(first)).toBe(false);
  const next = socket();
  expect(upload.send(next)).toBe(true);
  expect(upload.acknowledge('old-input')).toBe(false);
  expect(upload.pending).not.toBeNull();
  expect(upload.acknowledge('long-input')).toBe(true);
  expect(upload.send(socket())).toBe(false);
});
test('cancel and disconnected sockets never submit input', () => {
  const upload = new AudioInputUpload();
  upload.prepare('input', [new Int16Array(800)]);
  expect(upload.send({ readyState: 3 })).toBe(false);
  upload.cancel();
  expect(upload.send(socket())).toBe(false);
});
