import { normalizeConnectionError, shouldShowConnectionError } from './connectionErrorLogic';

describe('connection error presentation', () => {
  test('extracts readable messages and never exposes object coercion text', () => {
    expect(normalizeConnectionError({ message: '心跳超时' })).toBe('心跳超时');
    expect(normalizeConnectionError({ error: { detail: '连接已关闭' } })).toBe('连接已关闭');
    expect(normalizeConnectionError({ retryable: true })).toBe('连接异常，请稍后重试');
    expect(normalizeConnectionError('[object Object]')).toBe('连接异常，请稍后重试');
  });

  test('hides recoverable errors while the AI connection remains online', () => {
    expect(shouldShowConnectionError('心跳超时', true, false)).toBe(false);
    expect(shouldShowConnectionError('连接异常', false, false)).toBe(true);
    expect(shouldShowConnectionError('场景无效', true, true)).toBe(true);
    expect(shouldShowConnectionError(null, false, false)).toBe(false);
  });
});
