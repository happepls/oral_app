import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';

jest.mock('../services/api', () => ({ userAPI: { getProfile: jest.fn() }, authAPI: {} }));
function Profile() {
  const auth = useAuth();
  return <div>{auth.loading ? 'restoring' : auth.user?.native_language || 'anonymous'}</div>;
}
beforeEach(() => { jest.restoreAllMocks(); localStorage.clear(); userAPI.getProfile.mockReset(); });

test.each([true, false])('restores fresh server profile with stale cache=%s', async cached => {
  if (cached) localStorage.setItem('user', JSON.stringify({ id: 'test', native_language: 'Japanese' }));
  let resolve;
  userAPI.getProfile.mockReturnValue(new Promise(r => { resolve = r; }));
  render(<AuthProvider><Profile /></AuthProvider>);
  expect(screen.getByText('restoring')).toBeInTheDocument();
  expect(screen.queryByText('Japanese')).not.toBeInTheDocument();
  resolve({ id: 'test', native_language: 'Chinese', target_language: 'Japanese' });
  await screen.findByText('Chinese');
  expect(JSON.parse(localStorage.getItem('user')).native_language).toBe('Chinese');
  expect(userAPI.getProfile).toHaveBeenCalledWith(expect.objectContaining({ redirectOnUnauthorized: false }));
});

test('expired session cannot authenticate using cached user', async () => {
  localStorage.setItem('user', JSON.stringify({ id: 'test', native_language: 'Japanese' }));
  userAPI.getProfile.mockRejectedValue(Object.assign(new Error('expired'), { status: 401 }));
  render(<AuthProvider><Profile /></AuthProvider>);
  await screen.findByText('anonymous');
  expect(localStorage.getItem('user')).toBeNull();
});

test('legacy migration still reads the current server profile', async () => {
  localStorage.setItem('authToken', 'test-legacy');
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  userAPI.getProfile.mockResolvedValue({ id: 'test', native_language: 'Chinese' });
  render(<AuthProvider><Profile /></AuthProvider>);
  await screen.findByText('Chinese');
  await waitFor(() => expect(localStorage.getItem('authToken')).toBeNull());
  expect(fetch).toHaveBeenCalledWith('/api/users/token-migrate', expect.objectContaining({ credentials: 'include' }));
});

test('restored prepaid profile expires in the open tab', async () => {
  jest.useFakeTimers();
  userAPI.getProfile.mockResolvedValue({ id: 'test', native_language: 'Chinese', subscription_status: 'active',
    stripe_subscription_status: 'free', billing_source: 'prepaid', prepaid_expires_at: new Date(Date.now() + 1000).toISOString() });
  function Membership() {
    const { user } = useAuth();
    return <div>{user?.subscription_status}</div>;
  }
  const view = render(<AuthProvider><Membership /></AuthProvider>);
  await act(async () => {});
  expect(screen.getByText('active')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1010));
  expect(screen.getByText('free')).toBeInTheDocument();
  view.unmount();
  jest.useRealTimers();
});
