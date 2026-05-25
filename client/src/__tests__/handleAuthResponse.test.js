/**
 * handleAuthResponse 单元测试
 *
 * 验证认证流程的响应处理：
 * - 401 不触发 window.location 跳转（vs handleResponse 会跳转）
 * - 错误消息透传给调用方
 * - 正常响应返回 data 字段
 */

import { authAPI } from '../services/api';

global.fetch = jest.fn();

const originalLocation = window.location;

beforeAll(() => {
  delete window.location;
  window.location = { href: '' };
});

afterAll(() => {
  window.location = originalLocation;
});

beforeEach(() => {
  fetch.mockClear();
  window.location.href = '';
  localStorage.clear();
});

describe('handleAuthResponse — 401 不跳转', () => {
  test('login 401 应抛出错误但不重定向到 /login', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ success: false, message: '邮箱或密码错误' }),
    });

    await expect(
      authAPI.login({ email: 'test@test.com', password: 'wrong' })
    ).rejects.toThrow('邮箱或密码错误');

    expect(window.location.href).not.toBe('/login');
    expect(localStorage.getItem('authToken')).toBeFalsy();
  });

  test('register 401 应抛出错误但不重定向', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ success: false, message: 'Unauthorized' }),
    });

    await expect(
      authAPI.register({ email: 'a@b.com', password: '123', username: 'u' })
    ).rejects.toThrow('Unauthorized');

    expect(window.location.href).not.toBe('/login');
  });

  test('googleSignIn 401 应抛出错误但不重定向', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ success: false, message: 'Invalid Google token' }),
    });

    await expect(
      authAPI.googleSignIn('invalid-token')
    ).rejects.toThrow('Invalid Google token');

    expect(window.location.href).not.toBe('/login');
  });
});

describe('handleAuthResponse — 错误消息透传', () => {
  test('服务端自定义错误消息应原样透传', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ success: false, message: '该邮箱已被注册' }),
    });

    await expect(
      authAPI.register({ email: 'dup@test.com', password: '123', username: 'u' })
    ).rejects.toThrow('该邮箱已被注册');
  });

  test('无 message 字段时应回退到状态码提示', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false }),
    });

    await expect(
      authAPI.login({ email: 'a@b.com', password: '123' })
    ).rejects.toThrow('请求失败 (状态码: 500)');
  });

  test('JSON 解析失败应提示无法解析', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => { throw new Error('invalid json'); },
    });

    await expect(
      authAPI.login({ email: 'a@b.com', password: '123' })
    ).rejects.toThrow('无法解析服务器响应 (状态码: 502)');
  });
});

describe('handleAuthResponse — 正常响应', () => {
  test('login 成功应返回 data 字段内容', async () => {
    const userData = { id: 1, email: 'test@test.com', nickname: 'tester' };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: userData }),
    });

    const result = await authAPI.login({ email: 'test@test.com', password: 'correct' });
    expect(result).toEqual(userData);
  });

  test('register 成功应返回 data 字段内容', async () => {
    const userData = { id: 2, email: 'new@test.com' };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: userData }),
    });

    const result = await authAPI.register({ email: 'new@test.com', password: '123', username: 'newuser' });
    expect(result).toEqual(userData);
  });

  test('响应无 data 字段时应返回整个响应体', async () => {
    const rawResponse = { success: true, id: 3, email: 'g@test.com' };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => rawResponse,
    });

    const result = await authAPI.googleSignIn('valid-token');
    expect(result).toEqual(rawResponse);
  });
});

describe('handleAuthResponse — 请求配置', () => {
  test('login 应使用 credentials: include', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    await authAPI.login({ email: 'a@b.com', password: '123' });

    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });

  test('register 应使用 credentials: include', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    await authAPI.register({ email: 'a@b.com', password: '123', username: 'u' });

    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });

  test('googleSignIn 应使用 credentials: include', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    await authAPI.googleSignIn('token');

    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });

  test('auth 请求不应包含 Authorization header', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    await authAPI.login({ email: 'a@b.com', password: '123' });

    const headers = fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });
});
