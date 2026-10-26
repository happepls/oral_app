import { createRecallRecording } from './recallRecording';

let engines;
class Recognition {
  constructor() { engines.push(this); }
  start = jest.fn();
  stop = jest.fn();
  abort = jest.fn();
  result(text) { this.onresult({ results: [[{ transcript: text }]] }); }
}
const setup = () => {
  engines = [];
  const callbacks = { onComplete: jest.fn(), onError: jest.fn(), onEnd: jest.fn() };
  const session = createRecallRecording({ Recognition, lang: 'ja-JP', ...callbacks });
  return { session, ...callbacks };
};
test('silence restarts ASR without completing the explicit recording', () => {
  const { session, onComplete, onEnd } = setup();
  engines[0].result('first sentence');
  engines[0].onend();
  expect(onEnd).not.toHaveBeenCalled();
  engines[1].result('second sentence');
  session.stop();
  engines[1].result('second sentence final');
  engines[1].onend();
  engines[1].onend();
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith('first sentence second sentence final');
});
test('cancel ignores late results and engine end', () => {
  const { session, onComplete, onEnd } = setup();
  session.cancel();
  engines[0].result('late');
  engines[0].onend();
  expect(onComplete).not.toHaveBeenCalled();
  expect(onEnd).not.toHaveBeenCalled();
});
test('permission failure reports error and never submits partial input', () => {
  const { onComplete, onError, onEnd } = setup();
  engines[0].result('partial');
  engines[0].onerror({ error: 'not-allowed' });
  engines[0].onend();
  expect(onError).toHaveBeenCalledWith('not-allowed');
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});
test('repeated empty engine endings have a bounded retry', () => {
  const { onError } = setup();
  for (let i = 0; i < 4; i++) engines[i].onend();
  expect(engines).toHaveLength(4);
  expect(onError).toHaveBeenCalledWith('recognition-ended');
});

test('ordinary silence timeouts keep the user recording beyond three restarts', () => {
  const now = jest.spyOn(Date, 'now');
  let time = 0;
  now.mockImplementation(() => time);
  const { session, onEnd, onError } = setup();
  for (let i = 0; i < 8; i++) {
    time += 15000;
    engines[i].onend();
  }
  expect(onEnd).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  session.cancel();
  now.mockRestore();
});
