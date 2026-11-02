import { createRecallRecording } from './recallRecording';

let engines;
const result = (text, isFinal = true) => Object.assign([{ transcript: text }], { isFinal });
class Recognition {
  constructor() { engines.push(this); }
  start = jest.fn();
  stop = jest.fn();
  abort = jest.fn();
  result(text, isFinal = true) { this.onresult?.({ resultIndex: 0, results: [result(text, isFinal)] }); }
}
const setup = (extra = {}) => {
  engines = [];
  const callbacks = { onComplete: jest.fn(), onError: jest.fn(), onEnd: jest.fn(), onPreview: jest.fn(), onStopping: jest.fn() };
  const session = createRecallRecording({ Recognition, lang: 'ja-JP', ...callbacks, ...extra });
  return { session, ...callbacks };
};
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('Japanese incremental hypotheses replace previews; only final slot is scored', () => {
  const { session, onComplete, onPreview } = setup();
  // Target supplied in the screenshot, not the user's recorded transcription.
  const target = 'この結果は、主にスケジュール調整の遅れによるものです。';
  for (let length = 1; length <= target.length; length++) engines[0].result(target.slice(0, length), false);
  expect(onPreview).toHaveBeenLastCalledWith(target);
  expect(onComplete).not.toHaveBeenCalled();
  session.stop();
  engines[0].result(target);
  engines[0].onend();
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(target);
});

test('indexed final segments are not duplicated by repeated snapshots; real repetition is retained', () => {
  const { session, onComplete } = setup();
  const first = result('はい');
  engines[0].onresult({ resultIndex: 0, results: [first, result('は', false)] });
  engines[0].onresult({ resultIndex: 1, results: [first, result('はい')] });
  engines[0].onresult({ resultIndex: 1, results: [first, result('はい')] });
  session.stop();
  engines[0].onend();
  expect(onComplete).toHaveBeenCalledWith('はい はい');
});

test('silence restarts commit only finals, discard interim, and ignore queued callbacks from old engine', () => {
  const { session, onComplete, onEnd } = setup();
  const oldResult = engines[0].onresult;
  const oldEnd = engines[0].onend;
  engines[0].onresult({ resultIndex: 0, results: [result('first'), result('draft', false)] });
  oldEnd();
  oldResult({ resultIndex: 0, results: [result('late old')] });
  oldEnd();
  expect(engines).toHaveLength(2);
  expect(onEnd).not.toHaveBeenCalled();
  engines[1].result('second', false);
  session.stop();
  engines[1].result('second final');
  const end = engines[1].onend;
  end();
  end();
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith('first second final');
});

test('stop waits for final event and end, settles once, and releases microphone', () => {
  const { session, onComplete, onEnd, onStopping } = setup();
  session.stop();
  session.stop();
  expect(engines[0].stop).toHaveBeenCalledTimes(1);
  expect(onStopping).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  engines[0].result('final');
  expect(onComplete).not.toHaveBeenCalled();
  engines[0].onend();
  jest.runAllTimers();
  expect(onComplete).toHaveBeenCalledWith('final');
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(engines[0].abort).toHaveBeenCalled();
});

test.each(['timeout', 'interim-end', 'partial-end', 'empty-end', 'stop-throws'])('%s never scores unfinished input', mode => {
  const { session, onComplete, onError, onEnd } = setup();
  if (mode === 'partial-end') engines[0].onresult({ resultIndex: 0, results: [result('confirmed'), result('unfinished', false)] });
  else if (mode !== 'empty-end') engines[0].result('draft', false);
  if (mode === 'stop-throws') engines[0].stop.mockImplementation(() => { throw new Error(); });
  session.stop();
  if (mode === 'timeout') jest.advanceTimersByTime(4000);
  else engines[0].onend?.();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('cancel during final wait invalidates queued callbacks and clears timeout', () => {
  const { session, onComplete, onError, onEnd } = setup();
  const lateResult = engines[0].onresult;
  const lateEnd = engines[0].onend;
  session.stop();
  session.cancel();
  lateResult({ resultIndex: 0, results: [result('late')] });
  lateEnd();
  jest.runAllTimers();
  expect(onComplete).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(onEnd).not.toHaveBeenCalled();
  expect(engines[0].abort).toHaveBeenCalledTimes(1);
});

test('permission failure reports once and releases microphone without partial scoring', () => {
  const { onComplete, onError, onEnd } = setup();
  engines[0].result('partial', false);
  const error = engines[0].onerror;
  error({ error: 'not-allowed' });
  error({ error: 'not-allowed' });
  expect(onError).toHaveBeenCalledWith('not-allowed');
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  expect(engines[0].abort).toHaveBeenCalledTimes(1);
});

test('repeated empty engine endings have a bounded retry', () => {
  const { onError } = setup();
  for (let i = 0; i < 4; i++) engines[i].onend();
  expect(engines).toHaveLength(4);
  expect(onError).toHaveBeenCalledWith('recognition-ended');
});

test('ordinary silence timeouts keep recording beyond three restarts', () => {
  const { session, onEnd, onError } = setup();
  for (let i = 0; i < 8; i++) {
    jest.advanceTimersByTime(15000);
    engines[i].onend();
  }
  expect(onEnd).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  session.cancel();
});

test('constructor failure is reported as a terminal error', () => {
  const { onError, onEnd } = setup({ Recognition: class { constructor() { throw new Error('unavailable'); } } });
  expect(onError).toHaveBeenCalledWith('Error');
  expect(onEnd).toHaveBeenCalledTimes(1);
});
