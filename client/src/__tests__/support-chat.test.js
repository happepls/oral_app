import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockPathname = '/';
jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname }),
}), { virtual: true });

import SupportChat from '../components/SupportChat';

function renderAt(pathname) {
  mockPathname = pathname;
  return render(<SupportChat />);
}

describe('SupportChat opt-in loading', () => {
  const originalPropertyId = process.env.REACT_APP_TAWK_PROPERTY_ID;
  const originalWidgetId = process.env.REACT_APP_TAWK_WIDGET_ID;

  beforeEach(() => {
    process.env.REACT_APP_TAWK_PROPERTY_ID = 'property-id';
    process.env.REACT_APP_TAWK_WIDGET_ID = 'widget-id';
    delete window.Tawk_API;
    delete window.Tawk_LoadStart;
    delete window.__tawkUserActivated;
    delete window.__tawkVisible;
    window.__tawkTitleObserver?.disconnect();
    delete window.__tawkTitleObserver;
    document.title = 'GuaJi';
    document.getElementById('tawk-to-script')?.remove();
  });

  afterAll(() => {
    process.env.REACT_APP_TAWK_PROPERTY_ID = originalPropertyId;
    process.env.REACT_APP_TAWK_WIDGET_ID = originalWidgetId;
  });

  test('does not inject Tawk until click and prevents notification title changes', async () => {
    renderAt('/welcome');

    const button = screen.getByRole('button', { name: '打开在线客服' });
    expect(button).toHaveClass('h-14', 'w-14');
    expect(document.getElementById('tawk-to-script')).toBeNull();

    fireEvent.click(button);

    expect(document.getElementById('tawk-to-script')).toHaveAttribute(
      'src',
      'https://embed.tawk.to/property-id/widget-id'
    );
    expect(window.Tawk_API.autoStart).toBe(false);
    expect(window.__tawkUserActivated).toBe(true);

    document.title = '1 new message';
    await waitFor(() => expect(document.title).toBe('GuaJi'));
  });

  test('is absent and does not load Tawk on an application route', () => {
    renderAt('/conversation');

    expect(screen.queryByRole('button', { name: '打开在线客服' })).not.toBeInTheDocument();
    expect(document.getElementById('tawk-to-script')).toBeNull();
  });

  test('opens only after activation and hides when the active route is not public', () => {
    renderAt('/subscription');
    fireEvent.click(screen.getByRole('button', { name: '打开在线客服' }));

    const start = jest.fn();
    const showWidget = jest.fn();
    const hideWidget = jest.fn();
    const maximize = jest.fn();
    Object.assign(window.Tawk_API, { start, showWidget, hideWidget, maximize });

    window.Tawk_API.onLoad();
    expect(start).toHaveBeenCalledWith({ showWidget: true });
    expect(showWidget).toHaveBeenCalled();
    expect(maximize).toHaveBeenCalled();

    window.__tawkVisible = false;
    window.Tawk_API.onLoad();
    expect(hideWidget).toHaveBeenCalled();
  });
});
