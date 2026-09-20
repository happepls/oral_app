import React, { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';
import ProductAnalytics from './ProductAnalytics';
import { trackPage, endAnalyticsConversation } from '../utils/productAnalytics';
jest.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/conversation', search: '?scenario=private' }) }), { virtual: true });
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) }));
});
afterEach(() => jest.restoreAllMocks());

test('StrictMode tracks a sanitized page once without cookies or query secrets', async () => {
  render(<StrictMode><ProductAnalytics /></StrictMode>);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const [, options] = fetch.mock.calls[1];
  expect(options.credentials).toBe('omit');
  expect(JSON.parse(options.body).path).toBe('/conversation');
  expect(options.body).not.toContain('private');
});
test('opt out prevents even configuration requests', async () => {
  localStorage.setItem('analytics_opt_out', 'true');
  await trackPage('/');
  expect(fetch).not.toHaveBeenCalled();
});
test('disabled config and failures leave navigation unaffected', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) });
  await trackPage('/');
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockRejectedValue(new Error('offline'));
  await expect(trackPage('/')).resolves.toBeUndefined();
});
test('end sends only session reference with cookie auth, never claimed completion', async () => {
  await endAnalyticsConversation('session-1', null, 'server-proof');
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include', keepalive: true });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ sessionId: 'session-1', endProof: 'server-proof' });
});
