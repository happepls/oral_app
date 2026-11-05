import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Recall, { resolveLang } from '../pages/Recall';
import { aiAPI, userAPI } from '../services/api';

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../services/api', () => ({
  aiAPI: { getDailyRecall: jest.fn(), translate: jest.fn(), tts: jest.fn() },
  userAPI: { getActiveGoal: jest.fn(), getRecallDailyState: jest.fn(), markRecallComplete: jest.fn(), incrementRecallSwitch: jest.fn() },
}));
jest.mock('../components/GuajiMascot', () => ({ GuajiMascot: () => null }));
jest.mock('motion/react', () => ({
  AnimatePresence: ({ children }) => children,
  motion: { div: ({ children }) => <div>{children}</div> },
}));
const target = 'この結果は、主にスケジュール調整の遅れによるものです。';
let engines;
let audio;
let userAgentSpy;
const result = (text, isFinal) => Object.assign([{ transcript: text }], { isFinal });
const send = (text, isFinal = false) => act(() => engines.at(-1).onresult({ resultIndex: 0, results: [result(text, isFinal)] }));
const start = () => fireEvent.click(screen.getByRole('button', { name: /クリック|点击说话/ }));
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  engines = [];
  window.SpeechRecognition = class {
    constructor() { engines.push(this); }
    start() {}
    stop = jest.fn();
    abort = jest.fn();
  };
  audio = { play: jest.fn().mockResolvedValue(), pause: jest.fn() };
  window.Audio = jest.fn(() => audio);
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
  userAPI.getRecallDailyState.mockResolvedValue({ completed: false, switch_count: 0 });
  userAPI.getActiveGoal.mockResolvedValue({ goal: { id: 1, target_language: 'jp', scenarios: [{ title: 'Synthetic', tasks: ['Hello.'] }] } });
  aiAPI.getDailyRecall.mockResolvedValue({ sentences: [target, '次の文です。'] });
  aiAPI.tts.mockResolvedValue(new Blob(['audio']));
});
afterEach(() => { delete window.SpeechRecognition; jest.useRealTimers(); userAgentSpy?.mockRestore(); });

test('Android auto-final advances reading to memory without restarting recognition', async () => {
  userAgentSpy = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 17; Pixel 10a)');
  render(<Recall />);
  await screen.findByText(target);
  expect(screen.getByText(/停顿后自动结束/)).toBeVisible();
  start();
  expect(engines[0].continuous).toBe(false);
  const lateEnd = engines[0].onend;
  send(target, true);
  act(() => lateEnd());
  expect(screen.getByRole('button', { name: /点击说话（背诵）/ })).toBeEnabled();
  expect(engines).toHaveLength(1);
  start();
  send(target, true);
  expect(screen.getByRole('button', { name: /本句已完成/ })).toBeDisabled();
  expect(screen.getAllByText('识别 100%')).toHaveLength(2);
});

test('failed retry clears previous score and transcript without passing the step', async () => {
  render(<Recall />);
  await screen.findByText(target);
  start();
  send('unrelated synthetic response', true);
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  act(() => engines[0].onend());
  expect(screen.getByText(/unrelated synthetic response/)).toBeVisible();
  start();
  act(() => engines[1].onerror({ error: 'network' }));
  expect(screen.queryByText(/unrelated synthetic response/)).not.toBeInTheDocument();
  expect(screen.queryByText(/识别 \d+%/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /点击说话（跟读）/ })).toBeEnabled();
});

test.each(['japanese', 'ja', 'ja-JP', 'jp'])('%s resolves recognition and translation consistently', language => {
  expect(resolveLang(language)).toEqual({ bcp47: 'ja-JP', code: 'ja' });
});

test('screenshot target revisions score once after stop, then move from reading to memory', async () => {
  render(<Recall />);
  await screen.findByText(target);
  start();
  expect(engines[0].lang).toBe('ja-JP');
  for (let i = 1; i <= target.length; i++) send(target.slice(0, i));
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  expect(screen.getByRole('button', { name: /识别中/ })).toBeDisabled();
  expect(screen.queryByText(/识别 100%/)).not.toBeInTheDocument();
  send(target, true);
  act(() => engines[0].onend());
  expect(screen.getByRole('button', { name: /点击说话（背诵）/ })).toBeVisible();
  expect(screen.getByText('识别 100%')).toBeVisible();
  expect(screen.queryByText(target)).not.toBeInTheDocument();
  start();
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  send(target, true);
  act(() => engines[1].onend());
  expect(screen.getByRole('button', { name: /本句已完成/ })).toBeDisabled();
  expect(screen.getAllByText('识别 100%')).toHaveLength(2);
});

test('genuine repeated final speech lowers score instead of being deduplicated', async () => {
  render(<Recall />);
  await screen.findByText(target);
  start();
  act(() => engines[0].onresult({ resultIndex: 0, results: [result(target, true), result(target, true)] }));
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  act(() => engines[0].onend());
  expect(screen.getByRole('button', { name: /点击说话（跟读）/ })).toBeVisible();
  expect(screen.getByText(/识别 4[89]%|识别 50%/)).toBeVisible();
});

test('missing final event exits recognizing with retry and no score', async () => {
  render(<Recall />);
  await screen.findByText(target);
  jest.useFakeTimers();
  start();
  send(target);
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  act(() => jest.advanceTimersByTime(4000));
  expect(screen.getByRole('alert')).toHaveTextContent('最终识别结果');
  expect(screen.queryByText(/识别 \d+%/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /点击说话（跟读）/ })).toBeEnabled();
});

test('translation failure and empty success stay uncached; retry requests normalized language', async () => {
  aiAPI.getDailyRecall.mockRejectedValue(new Error('unavailable'));
  aiAPI.translate.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce({ translation: '' }).mockResolvedValueOnce({ translation: target });
  render(<Recall />);
  await screen.findByRole('alert');
  expect(localStorage.setItem.mock.calls.filter(([k]) => k.startsWith('recall_translated'))).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '重试加载台词' }));
  await screen.findByRole('alert');
  expect(localStorage.setItem.mock.calls.filter(([k]) => k.startsWith('recall_translated'))).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '重试加载台词' }));
  await screen.findByText(target);
  expect(aiAPI.translate).toHaveBeenLastCalledWith('Hello.', 'ja', expect.objectContaining({ signal: expect.anything() }));
  expect(localStorage.setItem).toHaveBeenCalledWith(expect.stringMatching(/^recall_translated_v3/), JSON.stringify([target]));
});

test('TTS failure is retryable; recording stops playing audio and disables preview', async () => {
  aiAPI.tts.mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce(new Blob(['audio']));
  render(<Recall />);
  await screen.findByText(target);
  fireEvent.click(screen.getByTitle('试听'));
  fireEvent.click(await screen.findByText('语音合成或播放失败，请重试'));
  await act(async () => {});
  expect(audio.play).toHaveBeenCalledTimes(1);
  start();
  expect(audio.pause).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  expect(screen.getByTitle('试听')).toBeDisabled();
});

test('retry after a completed-set switch failure opens new material without charging another switch', async () => {
  userAPI.getRecallDailyState.mockResolvedValue({ completed: true, switch_count: 0 });
  userAPI.incrementRecallSwitch.mockResolvedValue({ switch_count: 1 });
  aiAPI.getDailyRecall.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ sentences: [target] });
  aiAPI.translate.mockRejectedValueOnce(new Error('500'));
  render(<Recall />);
  fireEvent.click(await screen.findByRole('button', { name: /切换下一组/ }));
  fireEvent.click(await screen.findByRole('button', { name: '重试加载台词' }));
  await screen.findByText(target);
  expect(screen.getByRole('button', { name: /点击说话（跟读）/ })).toBeVisible();
  expect(userAPI.incrementRecallSwitch).toHaveBeenCalledTimes(1);
  expect(aiAPI.getDailyRecall).toHaveBeenLastCalledWith(1, expect.any(Object));
});

test.each(['server', 'offline'])('initial %s completion does not request material or lose completion on model failure', async source => {
  if (source === 'server') userAPI.getRecallDailyState.mockResolvedValue({ completed: true, switch_count: 0 });
  else {
    userAPI.getRecallDailyState.mockRejectedValue(new Error('offline'));
    localStorage.getItem.mockImplementation(key => key.startsWith('recall_completed_') ? 'true' : null);
  }
  aiAPI.getDailyRecall.mockRejectedValue(new Error('unavailable'));
  render(<Recall />);
  await screen.findByText('今日复述已完成！');
  expect(aiAPI.getDailyRecall).not.toHaveBeenCalled();
  expect(aiAPI.translate).not.toHaveBeenCalled();
});

test.each(['record', 'unmount'])('late TTS cannot play after %s', async action => {
  let resolve;
  aiAPI.tts.mockReturnValue(new Promise(r => { resolve = r; }));
  const view = render(<Recall />);
  await screen.findByText(target);
  fireEvent.click(screen.getByTitle('试听'));
  if (action === 'record') start();
  else view.unmount();
  expect(aiAPI.tts.mock.calls[0][2].signal.aborted).toBe(true);
  await act(async () => resolve(new Blob(['late audio'])));
  expect(audio.play).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test('unmount cancels recognizer and rejects queued final callbacks', async () => {
  const view = render(<Recall />);
  await screen.findByText(target);
  start();
  const lateResult = engines[0].onresult;
  const lateEnd = engines[0].onend;
  view.unmount();
  expect(engines[0].abort).toHaveBeenCalledTimes(1);
  act(() => {
    lateResult({ resultIndex: 0, results: [result(target, true)] });
    lateEnd();
  });
  expect(engines).toHaveLength(1);
});
