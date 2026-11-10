import React from 'react';
import { act, render } from '@testing-library/react';
import { AuthProvider } from '../contexts/AuthContext';
import { userAPI } from '../services/api';

jest.mock('../services/api', () => ({ authAPI: {}, userAPI: { getProfile: jest.fn() } }));

describe('cookie session heartbeat', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    localStorage.clear();
    userAPI.getProfile.mockResolvedValue({ id: 'heartbeat-user', username: 'Test' });
    global.fetch = jest.fn().mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  test('polls the authority with JSON content type and cookies, and cleans up on unmount', async () => {
    let view;
    await act(async () => { view = render(<AuthProvider><div>Application</div></AuthProvider>); });
    await act(async () => { jest.advanceTimersByTime(10000); });
    expect(global.fetch).toHaveBeenCalledWith('/api/users/verify', expect.objectContaining({
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    }));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
