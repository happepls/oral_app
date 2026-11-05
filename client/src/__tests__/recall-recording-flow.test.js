import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Recall, { resolveLang } from '../pages/Recall';
import { aiAPI, userAPI } from '../services/api';
import { createRecallManualRecording } from '../utils/recallManualRecording';

jest.mock('../utils/recallManualRecording', () => ({ createRecallManualRecording: jest.fn() }));

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../services/api', () => ({
  aiAPI: { getDailyRecall: jest.fn(), translate: jest.fn(), tts: jest.fn(), transcribeRecall: jest.fn() },
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
const send = text => act(() => { engines.at(-1).onComplete(text); engines.at(-1).onEnd(); });
const start = () => fireEvent.click(screen.getByRole('button', { name: /クリック|点击说话/ }));
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  engines = [];
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn() } });
  window.MediaRecorder = jest.fn();
  createRecallManualRecording.mockImplementation(callbacks => {
    const engine = { ...callbacks, stop: jest.fn(callbacks.onStopping), cancel: jest.fn() };
    engines.push(engine);
    return engine;
  });
  audio = { play: jest.fn().mockResolvedValue(), pause: jest.fn() };
  window.Audio = jest.fn(() => audio);
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
  userAPI.getRecallDailyState.mockResolvedValue({ completed: false, switch_count: 0 });
  userAPI.getActiveGoal.mockResolvedValue({ goal: { id: 1, target_language: 'jp', scenarios: [{ title: 'Synthetic', tasks: ['Hello.'] }] } });
  aiAPI.getDailyRecall.mockResolvedValue({ sentences: [target, '次の文です。'] });
  aiAPI.tts.mockResolvedValue(new Blob(['audio']));
});
afterEach(() => { delete window.MediaRecorder; jest.useRealTimers(); });

test('manual recording waits through pauses and both steps require stop', async () => {
  render(<Recall />);
  await screen.findByText(target);
  expect(screen.getByText(/停顿不会结束录音/)).toBeVisible();
  start();
  expect(engines[0].language).toBe('ja');
  expect(engines[0].transcribe).toBe(aiAPI.transcribeRecall);
  jest.useFakeTimers();
  act(() => jest.advanceTimersByTime(10000));
  expect(screen.getByRole('button', { name: /点击结束/ })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  send(target);
  expect(screen.getByRole('button', { name: /点击说话（背诵）/ })).toBeEnabled();
  expect(engines).toHaveLength(1);
  start();
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  send(target);
  expect(screen.getByRole('button', { name: /本句已完成/ })).toBeDisabled();
  expect(screen.getAllByText('识别 100%')).toHaveLength(2);
});

test('failed retry clears previous score and transcript without passing the step', async () => {
  render(<Recall />);
  await screen.findByText(target);
  start();
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  send('unrelated synthetic response');
  expect(screen.getByText(/unrelated synthetic response/)).toBeVisible();
  start();
  act(() => { engines[1].onError('transcription-unavailable'); engines[1].onEnd(); });
  expect(screen.queryByText(/unrelated synthetic response/)).not.toBeInTheDocument();
  expect(screen.queryByText(/识别 \d+%/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /点击说话（跟读）/ })).toBeEnabled();
});

test.each(['japanese', 'ja', 'ja-JP', 'jp'])('%s resolves recognition and translation consistently', language => {
  expect(resolveLang(language)).toEqual({ bcp47: 'ja-JP', code: 'ja' });
});

test('final server transcript scores after stop then moves reading to memory', async () => {
  render(<Recall />);
  await screen.findByText(target);
  start();
  expect(engines[0].language).toBe('ja');
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  expect(screen.getByRole('button', { name: /识别中/ })).toBeDisabled();
  expect(screen.queryByText(/识别 100%/)).not.toBeInTheDocument();
  send(target);
  expect(screen.getByRole('button', { name: /点击说话（背诵）/ })).toBeVisible();
  expect(screen.getByText('识别 100%')).toBeVisible();
  expect(screen.queryByText(target)).not.toBeInTheDocument();
  start();
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  send(target);
  expect(screen.getByRole('button', { name: /本句已完成/ })).toBeDisabled();
  expect(screen.getAllByText('识别 100%')).toHaveLength(2);
});

test('genuine repeated final speech lowers score instead of being deduplicated', async () => {
  render(<Recall />);
  await screen.findByText(target);
  start();
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  send(`${target} ${target}`);
  expect(screen.getByRole('button', { name: /点击说话（跟读）/ })).toBeVisible();
  expect(screen.getByText(/识别 4[89]%|识别 50%/)).toBeVisible();
});

test('missing final event exits recognizing with retry and no score', async () => {
  render(<Recall />);
  await screen.findByText(target);
  start();
  fireEvent.click(screen.getByRole('button', { name: /点击结束/ }));
  act(() => { engines[0].onError('transcription-timeout'); engines[0].onEnd(); });
  expect(screen.getByRole('alert')).toHaveTextContent('转写等待超时');
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

test('unmount cancels pending recording', async () => {
  const view = render(<Recall />);
  await screen.findByText(target);
  start();
  view.unmount();
  expect(engines[0].cancel).toHaveBeenCalled();
  expect(engines).toHaveLength(1);
});
