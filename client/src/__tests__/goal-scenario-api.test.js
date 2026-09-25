import { aiAPI, userAPI } from '../services/api';

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { jest.restoreAllMocks(); });

test('goal list uses the complete hydrated snapshot, including paused task progress', async () => {
  const goals = [{ id: 7, status: 'paused', scenarios: [{ title: '点餐', tasks: [{ id: 42, text: '询问菜单', status: 'completed', score: 9, interaction_count: 12, scoring_generation: 3 }] }] }];
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, goals }) });
  expect(await userAPI.getUserGoals()).toEqual({ success: true, goals });
  expect(global.fetch).toHaveBeenCalledWith('/api/users/goals', expect.objectContaining({ credentials: 'include' }));
});

test('scenario PATCH includes cookie credentials, full array and encoded goal ID', async () => {
  const goal = { id: 7, scenarios: [] };
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, goal }) });
  const scenarios = [{ title: '点餐', tasks: ['一', '二', '三'] }];
  expect(await userAPI.updateGoalScenarios(7, scenarios)).toEqual({ success: true, goal });
  expect(global.fetch).toHaveBeenCalledWith('/api/users/goals/7/scenarios', expect.objectContaining({ method: 'PATCH', credentials: 'include', body: JSON.stringify({ scenarios }), headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }) }));
});

test('single generation unwraps proxy response and forwards cancellation signal', async () => {
  const scenario = { title: '问路', tasks: ['一', '二', '三'] };
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { scenario } }) });
  const controller = new AbortController();
  expect(await aiAPI.generateScenario({ exclude_titles: ['点餐'] }, { signal: controller.signal })).toEqual({ scenario });
  expect(global.fetch).toHaveBeenCalledWith('/api/v1/ai/scenario', expect.objectContaining({ method: 'POST', credentials: 'include', signal: controller.signal }));
});

test('PATCH keeps server status, code and field errors for editor recovery', async () => {
  const fields = [{ field: 'scenarios[0].title', message: '标题不能重复' }];
  global.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: '参数错误', data: { errors: fields } }) });
  await expect(userAPI.updateGoalScenarios(7, [])).rejects.toMatchObject({ status: 400, fields, message: '参数错误' });
});
