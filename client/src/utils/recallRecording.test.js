import { createRecallRecording, shouldUseSingleUtteranceRecognition } from './recallRecording';

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

test('diagnostics expose state and lengths without speech content', () => {
  const onDiagnostic = jest.fn();
  const { session } = setup({ onDiagnostic });
  engines[0].result('private synthetic speech', false);
  session.stop();
  engines[0].onend();
  expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ event: 'result', interimCount: 1, finalCount: 0 }));
  expect(onDiagnostic).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'settled', error: 'incomplete-result' }));
  expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('private synthetic speech');
});

test.each([
  [{ userAgent: 'Mozilla/5.0 (Linux; Android 17; Pixel 10a)' }, true],
  [{ userAgentData: { platform: 'Android' }, userAgent: '' }, true],
  [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0)' }, false],
  [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' }, false],
])('single utterance is restricted to Android (%j)', (nav, expected) => {
  expect(shouldUseSingleUtteranceRecognition(nav)).toBe(expected);
});

test.each([false, true])('Android final settles once without waiting for end (manual stop=%s)', stop => {
  const { session, onComplete, onEnd, onError } = setup({ singleUtterance: true });
  const engine = engines[0];
  const lateEnd = engine.onend;
  const lateResult = engine.onresult;
  expect(engine.continuous).toBe(false);
  // Repetition spoken inside the utterance must be retained verbatim.
  engine.result('はい', false);
  engine.result('はい、はい', false);
  if (stop) session.stop();
  engine.result('はい、はい');
  lateEnd();
  lateResult({ resultIndex: 0, results: [result('late')] });
  jest.runAllTimers();
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith('はい、はい');
  expect(onError).not.toHaveBeenCalled();
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(engines).toHaveLength(1);
  expect(engine.abort).toHaveBeenCalledTimes(1);
});

test.each(['empty', 'interim', 'timeout', 'permission', 'multiple-finals'])('Android %s fails without automatic restart or scoring', mode => {
  const { session, onComplete, onError } = setup({ singleUtterance: true });
  if (mode === 'multiple-finals') engines[0].onresult({ resultIndex: 0, results: [result('first'), result('second')] });
  else if (mode === 'permission') engines[0].onerror({ error: 'not-allowed' });
  else {
    if (mode !== 'empty') engines[0].result('unfinished', false);
    if (mode === 'timeout') { session.stop(); jest.advanceTimersByTime(4000); }
    else engines[0].onend();
  }
  expect(onComplete).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(engines).toHaveLength(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('Android cancellation rejects a queued final result', () => {
  const { session, onComplete, onError } = setup({ singleUtterance: true });
  const lateResult = engines[0].onresult;
  session.cancel();
  lateResult({ resultIndex: 0, results: [result('cancelled')] });
  expect(onComplete).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});
