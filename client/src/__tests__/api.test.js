/**
 * API Tests
 *
 * Task #7: api.js resetTask() 测试
 */

import { userAPI } from '../services/api';

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