/**
 * API Tests
 *
 * Task #7: api.js resetTask() 测试
 */

import { userAPI, aiAPI, conversationAPI, historyAPI } from '../services/api';

// Mock fetch globally
global.fetch = jest.fn();

describe('userAPI.resetTask()', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('should call resetTask endpoint with correct URL', async () => {
    const taskId = 'task-123';
    const scenario = 'daily_conversation';

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { taskId, status: 'reset' },
      }),
    });

    // Call resetTask
    const result = await userAPI.resetTask(taskId, scenario);

    expect(fetch).toHaveBeenCalled();
    expect(fetch.mock.calls[0][0]).toContain('/api/users/goals/reset-task');
  });

  test('should reset all tasks in a scenario when taskId is null', async () => {
    const scenario = 'daily_conversation';

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { scenario, allTasksReset: true },
      }),
    });

    const result = await userAPI.resetTask(null, scenario);

    expect(fetch).toHaveBeenCalled();
  });

  test('should include credentials in the request', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    await userAPI.resetTask('task-1', 'scenario-1');

    const fetchCall = fetch.mock.calls[0];
    expect(fetchCall[1]).toHaveProperty('credentials', 'include');
  });

  test('should handle reset errors gracefully', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        message: 'Failed to reset task',
      }),
    });

    await expect(userAPI.resetTask('task-1', 'scenario-1')).rejects.toThrow();
  });

  test('should support AbortSignal for cancellation', async () => {
    const controller = new AbortController();
    const signal = controller.signal;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    // Call with signal
    const result = await userAPI.resetTask('task-1', 'scenario-1', { signal });

    expect(fetch).toHaveBeenCalled();
  });

  test('should abort request when signal is triggered', async () => {
    const controller = new AbortController();

    fetch.mockImplementationOnce(() => {
      // Simulate fetch being aborted
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });

    try {
      const result = await userAPI.resetTask('task-1', 'scenario-1', {
        signal: controller.signal,
      });
    } catch (err) {
      expect(err.name).toBe('AbortError');
    }

    controller.abort();
  });

  test('should reset task progress correctly', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          taskId: 'task-1',
          completedCount: 0,
          totalCount: 10,
          progress: 0,
        },
      }),
    });

    const result = await userAPI.resetTask('task-1', 'scenario-1');

    expect(result.completedCount).toBe(0);
    expect(result.progress).toBe(0);
  });

  test('should preserve task metadata after reset', async () => {
    const mockTask = {
      id: 'task-1',
      title: 'Order at coffee shop',
      scenario: 'daily_conversation',
      difficulty: 'medium',
      completedCount: 0,
      score: 0,
      status: 'reset',
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockTask,
      }),
    });

    const result = await userAPI.resetTask(mockTask.id, mockTask.scenario);

    expect(result.title).toBe('Order at coffee shop');
    expect(result.scenario).toBe('daily_conversation');
    expect(result.difficulty).toBe('medium');
  });
});

describe('API Request Headers', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('should include Content-Type header in requests', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    await userAPI.resetTask('task-1', 'scenario-1');

    const headers = fetch.mock.calls[0][1].headers;
    expect(headers['Content-Type']).toBe('application/json');
  });

  test('should NOT include token in headers (cookie-based auth)', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    await userAPI.resetTask('task-1', 'scenario-1');

    const headers = fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('API Error Handling', () => {
  beforeEach(() => {
    fetch.mockClear();
    localStorage.removeItem.mockClear();
  });

  test('should handle 401 Unauthorized', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        message: 'Unauthorized',
      }),
    });

    await expect(userAPI.resetTask('task-1', 'scenario-1')).rejects.toThrow();
    expect(localStorage.removeItem).toHaveBeenCalledWith('user');
  });

  test('history 401 does not clear the primary login session', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        message: 'History service unauthorized',
      }),
    });

    await expect(historyAPI.getStats('user-1')).rejects.toThrow('History service unauthorized');
    expect(localStorage.removeItem).not.toHaveBeenCalledWith('user');
  });

  test('should handle network errors', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(userAPI.resetTask('task-1', 'scenario-1')).rejects.toThrow('Network error');
  });

  test('should handle JSON parse errors', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    await expect(userAPI.resetTask('task-1', 'scenario-1')).rejects.toThrow();
  });
});

describe('daily recall material API', () => {
  beforeEach(() => fetch.mockClear());

  test('requests a stable server-side variant with cookie auth', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { topic: 'Weekend', sentences: ['One', 'Two', 'Three'], variant: 2 },
      }),
    });

    await expect(aiAPI.getDailyRecall(2)).resolves.toMatchObject({
      sentences: ['One', 'Two', 'Three'],
      variant: 2,
    });
    expect(fetch.mock.calls[0][0]).toBe('/api/ai/daily-recall?variant=2');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });
});

describe('v1 learning contract', () => {
  beforeEach(() => fetch.mockClear());

  const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ data, meta: { request_id: '00000000-0000-4000-8000-000000000001' } }) });

  test('profile and goal reads use the first-party cookie v1 façade', async () => {
    fetch.mockResolvedValueOnce(response({ id: 'user-1', nickname: 'Gua' }));
    await userAPI.getProfile();
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/profile');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');

    fetch.mockResolvedValueOnce(response([{ id: 1, status: 'active' }]));
    fetch.mockResolvedValueOnce(response([]));
    await expect(userAPI.getActiveGoal()).resolves.toEqual({ goal: { id: 1, status: 'active' } });
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/goals?limit=100');
    expect(fetch.mock.calls[2][0]).toBe('/api/v1/tasks?limit=100');
  });

  test('subscription reads preserve an unavailable state instead of imitating a free plan', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ message: 'Unavailable' }),
    });

    await expect(userAPI.getSubscription()).rejects.toMatchObject({ status: 503 });
    expect(fetch.mock.calls[0][0]).toBe('/api/stripe/subscription');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });

  test('active goals merge current task status from the task endpoint', async () => {
    fetch.mockResolvedValueOnce(response([{ id: 7, status: 'active', scenarios: [{ title: 'Cafe', tasks: ['Order coffee'] }] }]));
    fetch.mockResolvedValueOnce(response([{ id: 9, goal_id: 7, scenario_title: 'Cafe', task_description: 'Order coffee', status: 'completed', score: 9, interaction_count: 3, feedback: 'Great', completed_at: '2026-08-02T00:00:00Z' }]));

    const result = await userAPI.getActiveGoal();

    expect(result.goal.scenarios[0].tasks[0]).toEqual(expect.objectContaining({
      id: 9,
      text: 'Order coffee',
      status: 'completed',
      score: 9,
      interaction_count: 3,
      feedback: 'Great',
      completed_at: '2026-08-02T00:00:00Z',
      progress: 100,
    }));
  });

  test('writes and generation carry unique idempotency keys', async () => {
    fetch.mockResolvedValueOnce(response({ id: 1 }, 201));
    await userAPI.createGoal({ target_language: 'en', target_level: 'A1', scenarios: [] });
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/goals');
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBeTruthy();

    fetch.mockResolvedValueOnce(response({ scenarios: [] }));
    await aiAPI.generateScenarios({ target_language: 'en' });
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/ai/scenarios');
    expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBeTruthy();
  });

  test('conversation history and realtime tickets use v1 without client userId', async () => {
    fetch.mockResolvedValueOnce(response([]));
    await historyAPI.getUserHistory('attacker-controlled-id');
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/conversations?limit=100');
    expect(fetch.mock.calls[0][0]).not.toContain('attacker-controlled-id');

    fetch.mockResolvedValueOnce(response({ ticket: 'short-lived', expires_in: 60 }));
    await expect(conversationAPI.createRealtimeTicket()).resolves.toMatchObject({ ticket: 'short-lived' });
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/realtime/tickets');
    expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBeTruthy();
  });

  test('conversation history save returns explicit success and 404 lookup stays falsy', async () => {
    fetch.mockResolvedValueOnce(response({ message: 'Messages saved successfully.' }, 201));
    await expect(conversationAPI.saveHistory('session-1', [{ role: 'user', content: 'hi' }], 'user-1')).resolves.toMatchObject({ success: true });
    expect(fetch.mock.calls[0][0]).toBe('/api/conversation/history/session-1');

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Conversation not found' }),
    });
    await expect(conversationAPI.getHistory('missing-session')).resolves.toMatchObject({ success: false, status: 404 });
    expect(fetch.mock.calls[1][0]).toBe('/api/history/session/missing-session');
  });
});
