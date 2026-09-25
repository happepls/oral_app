import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import GoalScenarioEditor from '../components/GoalScenarioEditor';
import { aiAPI, userAPI } from '../services/api';
import { changedProgressScenarios, publishGoalScenariosUpdate, scenarioPayload, subscribeGoalScenariosUpdates, validateGoalScenarios } from '../utils/goalScenarios';
import zh from '../i18n/locales/zh.json';

jest.mock('../services/api', () => ({ aiAPI: { generateScenario: jest.fn() }, userAPI: { updateGoalScenarios: jest.fn() } }));
const scene = (title = '点餐') => ({ title, image_url: 'https://example.com/cover.png', tasks: ['询问菜单', '点一份主菜', '请求结账'].map((text, i) => ({ id: i + 40, text, score: i === 0 ? 3 : 0, interaction_count: i === 0 ? 4 : 0, scoring_generation: 3, status: 'pending' })) });
const goal = () => ({ id: 7, status: 'paused', description: '旅行口语', type: 'travel_survival', target_language: 'English', target_level: 'Intermediate', interests: 'Food', scenarios: [scene()] });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

async function setup(overrides = {}) {
  const i18n = createInstance();
  await i18n.init({ lng: 'zh', resources: { zh: { translation: zh } } });
  const props = { goal: goal(), nativeLanguage: 'zh', onClose: jest.fn(), onSaved: jest.fn(), ...overrides };
  return { ...render(<I18nextProvider i18n={i18n}><GoalScenarioEditor {...props} /></I18nextProvider>), props };
}
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { jest.restoreAllMocks(); localStorage.clear(); });

test('locks the whole scenario containing any completed task', async () => {
  const value = goal(); value.scenarios[0].tasks[1].status = 'completed';
  await setup({ goal: value });
  const card = screen.getByRole('group', { name: '场景 1' });
  expect(within(card).getByRole('textbox', { name: '场景标题' })).toBeDisabled();
  within(card).getAllByRole('textbox').forEach(input => expect(input).toBeDisabled());
  expect(within(card).queryByRole('button', { name: 'AI 重新生成' })).not.toBeInTheDocument();
  expect(within(card).getByText(/不可修改或删除/)).toBeInTheDocument();
});

test('warns for changed practiced tasks, strips UI and scoring fields, saves once', async () => {
  const pending = deferred(); userAPI.updateGoalScenarios.mockReturnValue(pending.promise);
  const { props } = await setup();
  fireEvent.change(screen.getByRole('textbox', { name: '子任务 1' }), { target: { value: '  询问今日推荐菜  ' } });
  expect(screen.getByRole('status')).toHaveTextContent('保存后将重置');
  fireEvent.click(screen.getByRole('button', { name: '保存场景' }));
  fireEvent.submit(screen.getByRole('button', { name: '保存中…' }).closest('form'));
  expect(userAPI.updateGoalScenarios).toHaveBeenCalledTimes(1);
  expect(userAPI.updateGoalScenarios).toHaveBeenCalledWith(7, [{ title: '点餐', image_url: 'https://example.com/cover.png', tasks: ['询问今日推荐菜', '点一份主菜', '请求结账'] }]);
  const saved = { ...goal(), updated_at: 'later' };
  await act(async () => pending.resolve({ goal: saved }));
  expect(props.onSaved).toHaveBeenCalledWith(saved);
});

test('failed save retains the editor, edited content and server field errors', async () => {
  userAPI.updateGoalScenarios.mockRejectedValue(Object.assign(new Error('练习进度正在更新，请稍后重试保存'), { fields: [{ field: 'scenarios[0].title', message: '标题冲突' }] }));
  const { props } = await setup();
  fireEvent.change(screen.getByRole('textbox', { name: '场景标题' }), { target: { value: '咖啡店' } });
  fireEvent.click(screen.getByRole('button', { name: '保存场景' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox', { name: '场景标题' })).toHaveValue('咖啡店');
  expect(screen.getByText('标题冲突')).toBeInTheDocument();
  expect(props.onClose).not.toHaveBeenCalled(); expect(props.onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '保存场景' })).toBeEnabled();
});

test('validation prevents empty title and duplicate tasks before sending', async () => {
  await setup();
  fireEvent.change(screen.getByRole('textbox', { name: '场景标题' }), { target: { value: ' ' } });
  fireEvent.change(screen.getByRole('textbox', { name: '子任务 2' }), { target: { value: '询问菜单' } });
  fireEvent.click(screen.getByRole('button', { name: '保存场景' }));
  expect(screen.getByText('场景标题需为 1–100 个字符。')).toBeInTheDocument();
  expect(screen.getByText('同一场景的 3 条子任务不能重复。')).toBeInTheDocument();
  expect(userAPI.updateGoalScenarios).not.toHaveBeenCalled();
});

test('regeneration requires confirmation and uses goal metadata and exclusions', async () => {
  aiAPI.generateScenario.mockResolvedValue({ scenario: { title: '入住酒店', tasks: ['说明预订', '询问早餐', '请求房卡'] } });
  await setup();
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole('button', { name: 'AI 重新生成' }));
  expect(aiAPI.generateScenario).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'AI 重新生成' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: '场景标题' })).toHaveValue('入住酒店'));
  expect(aiAPI.generateScenario).toHaveBeenCalledWith({ target_language: 'English', target_level: 'Intermediate', type: 'travel_survival', interests: 'Food', native_language: 'zh', exclude_titles: ['点餐'] }, { signal: expect.any(AbortSignal) });
});

test('allows one generation at a time and aborts on close', async () => {
  const pending = deferred(); aiAPI.generateScenario.mockReturnValue(pending.promise);
  const { props, unmount } = await setup();
  fireEvent.click(screen.getByRole('button', { name: 'AI 添加场景' }));
  fireEvent.click(screen.getByRole('button', { name: 'AI 添加场景' }));
  expect(aiAPI.generateScenario).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '保存场景' })).toBeDisabled();
  const signal = aiAPI.generateScenario.mock.calls[0][1].signal;
  fireEvent.click(screen.getByRole('button', { name: '关闭编辑器' }));
  expect(signal.aborted).toBe(true); expect(props.onClose).toHaveBeenCalledTimes(1);
  unmount(); await act(async () => pending.resolve({ scenario: { title: '不会显示', tasks: ['一', '二', '三'] } }));
  expect(props.onSaved).not.toHaveBeenCalled();
});

test.each([
  new Error('生成失败'),
  { scenario: { title: '点餐', tasks: ['a', 'b', 'c'] } },
  { scenario: { title: '新场景', tasks: ['a'] } },
])('failed or invalid generation keeps existing edits', async value => {
  if (value instanceof Error) aiAPI.generateScenario.mockRejectedValue(value);
  else aiAPI.generateScenario.mockResolvedValue(value);
  await setup();
  fireEvent.click(screen.getByRole('button', { name: 'AI 添加场景' }));
  await screen.findByRole('alert');
  expect(screen.getAllByRole('group')).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: '场景标题' })).toHaveValue('点餐');
  expect(screen.getByRole('button', { name: '保存场景' })).toBeEnabled();
});

test('manual add/delete works and 12 scenarios disable both add actions', async () => {
  const { unmount } = await setup();
  fireEvent.click(screen.getByRole('button', { name: '手动添加' }));
  expect(screen.getAllByRole('group')).toHaveLength(2);
  fireEvent.click(within(screen.getByRole('group', { name: '场景 2' })).getByRole('button', { name: '删除场景' }));
  expect(screen.getAllByRole('group')).toHaveLength(1); unmount();
  await setup({ goal: { ...goal(), scenarios: Array.from({ length: 12 }, (_, i) => scene(`场景${i}`)) } });
  expect(screen.getByRole('button', { name: '手动添加' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'AI 添加场景' })).toBeDisabled();
});

test('progress warning only covers changed task identities; pure payload excludes IDs', () => {
  const original = [scene()];
  const payload = scenarioPayload(original);
  expect(changedProgressScenarios(original, payload)).toEqual([]);
  payload[0].tasks[1] = '换一个未练习任务';
  expect(changedProgressScenarios(original, payload)).toEqual([]);
  payload[0].title = '重命名';
  expect(changedProgressScenarios(original, payload)).toHaveLength(1);
  expect(validateGoalScenarios([], key => key)).toHaveProperty('scenarios');
  expect(validateGoalScenarios(Array.from({ length: 13 }, (_, i) => ({ title: String(i), tasks: ['a','b','c'] })), key => key)).toHaveProperty('scenarios');
});

test('cross-tab notifications match both user and goal and remove listeners', () => {
  const changed = jest.fn(); const stop = subscribeGoalScenariosUpdates('u1', () => 7, changed);
  publishGoalScenariosUpdate('u2', 7); publishGoalScenariosUpdate('u1', 8);
  expect(changed).not.toHaveBeenCalled();
  publishGoalScenariosUpdate('u1', 7); expect(changed).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new StorageEvent('storage', { key: 'goal_scenarios_updated:u1:7', newValue: JSON.stringify({ userId: 'u1', goalId: '7' }) }));
  expect(changed).toHaveBeenCalledTimes(2); stop(); publishGoalScenariosUpdate('u1', 7);
  expect(changed).toHaveBeenCalledTimes(2);
});

test('queues cross-tab updates until an in-flight goal snapshot resolves', () => {
  let goalId = null; const changed = jest.fn();
  const stop = subscribeGoalScenariosUpdates('u1', () => goalId, changed);
  publishGoalScenariosUpdate('u1', 7);
  expect(changed).not.toHaveBeenCalled();
  goalId = 7; stop.check();
  expect(changed).toHaveBeenCalledTimes(1);
  stop.check(); expect(changed).toHaveBeenCalledTimes(1); stop();
});
