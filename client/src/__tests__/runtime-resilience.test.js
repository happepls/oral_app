import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

import { GuajiAvatar } from '../components/GuajiAvatar';
import { NotificationProvider, getSSEReconnectDelay } from '../contexts/NotificationContext';

class MockEventSource {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.listeners = new Map();
    this.close = jest.fn();
    MockEventSource.instances.push(this);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

describe('runtime resilience', () => {
  const RealEventSource = global.EventSource;

  beforeEach(() => {
    jest.useFakeTimers();
    MockEventSource.instances = [];
    global.EventSource = MockEventSource;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    global.EventSource = RealEventSource;
    jest.restoreAllMocks();
  });

  test('SSE uses controlled exponential reconnect and reports one warning per outage', () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { unmount } = render(<NotificationProvider><div>Ready</div></NotificationProvider>);

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/users/sse');
    expect(MockEventSource.instances[0].options).toEqual({ withCredentials: true });

    act(() => MockEventSource.instances[0].onerror());
    expect(MockEventSource.instances[0].close).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(getSSEReconnectDelay(1)));
    expect(MockEventSource.instances).toHaveLength(2);
    act(() => MockEventSource.instances[1].onerror());
    act(() => jest.advanceTimersByTime(getSSEReconnectDelay(2)));
    expect(MockEventSource.instances).toHaveLength(3);
    expect(warning).toHaveBeenCalledTimes(1);

    act(() => MockEventSource.instances[2].onopen());
    act(() => MockEventSource.instances[2].onerror());
    act(() => jest.advanceTimersByTime(getSSEReconnectDelay(1)));
    expect(MockEventSource.instances).toHaveLength(4);
    expect(warning).toHaveBeenCalledTimes(2);

    unmount();
    expect(MockEventSource.instances[3].close).toHaveBeenCalledTimes(1);
  });

  test('mascot replaces a failed image with a stable fallback', () => {
    render(<GuajiAvatar mood="calm" />);
    const image = screen.getByRole('presentation');
    fireEvent.error(image);

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    expect(screen.getByText('🐦')).toBeInTheDocument();
  });
});
