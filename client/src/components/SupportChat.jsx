import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const VISIBLE_PATHS = ['/', '/login', '/register', '/welcome'];

function isVisiblePath(pathname) {
  return VISIBLE_PATHS.includes(pathname) || pathname.startsWith('/subscription');
}

function applyTawkVisibility(visible) {
  const api = window.Tawk_API;
  if (!api) return;

  try {
    if (visible && window.__tawkUserActivated) {
      api.showWidget?.();
    } else {
      api.hideWidget?.();
    }
  } catch (error) {
    console.warn('[SupportChat] Failed to update widget visibility:', error);
  }
}

function openTawkChat() {
  const api = window.Tawk_API;
  if (!api) return;

  try {
    // autoStart=false keeps Tawk disconnected until this explicit user action.
    api.start?.({ showWidget: true });
    api.showWidget?.();
    api.maximize?.();
  } catch (error) {
    console.warn('[SupportChat] Failed to open widget:', error);
  }
}

function protectDocumentTitle() {
  if (window.__tawkTitleObserver || typeof MutationObserver === 'undefined') return;

  const appTitle = document.title;
  const titleNode = document.querySelector('title');
  if (!titleNode) return;

  window.__tawkTitleObserver = new MutationObserver(() => {
    if (document.title !== appTitle) document.title = appTitle;
  });
  window.__tawkTitleObserver.observe(titleNode, { childList: true, characterData: true, subtree: true });
}

/**
 * Tawk is opt-in: before the visitor presses this first-party button, no Tawk
 * script, connection, iframe, or notification is created. Once activated, the
 * third-party widget remains available only on public and subscription routes.
 */
export default function SupportChat() {
  const propertyId = process.env.REACT_APP_TAWK_PROPERTY_ID;
  const widgetId = process.env.REACT_APP_TAWK_WIDGET_ID || 'default';
  const { pathname } = useLocation();
  const visible = isVisiblePath(pathname);
  const [activated, setActivated] = useState(() => window.__tawkUserActivated === true);

  useEffect(() => {
    window.__tawkVisible = visible;
    applyTawkVisibility(visible);
  }, [visible]);

  useEffect(() => {
    if (!propertyId || !activated) return;

    window.__tawkUserActivated = true;
    protectDocumentTitle();

    const existingScript = document.getElementById('tawk-to-script');
    if (existingScript) {
      openTawkChat();
      applyTawkVisibility(window.__tawkVisible === true);
      return;
    }

    window.Tawk_API = window.Tawk_API || {};
    // Official Tawk option: prevents its socket, proactive messages, and widget
    // from starting before our explicit start() call.
    window.Tawk_API.autoStart = false;
    window.Tawk_LoadStart = new Date();
    window.Tawk_API.onBeforeLoad = function () {
      applyTawkVisibility(false);
    };
    window.Tawk_API.onLoad = function () {
      if (window.__tawkVisible === true) openTawkChat();
      else applyTawkVisibility(false);
    };

    const script = document.createElement('script');
    script.id = 'tawk-to-script';
    script.async = true;
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    document.body.appendChild(script);
  }, [activated, propertyId, widgetId]);

  if (!propertyId || !visible || activated) return null;

  return (
    <button
      type="button"
      aria-label="打开在线客服"
      onClick={() => setActivated(true)}
      className="fixed right-4 bottom-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <span className="material-symbols-outlined" aria-hidden="true">support_agent</span>
    </button>
  );
}
