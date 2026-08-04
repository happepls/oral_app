import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const VISIBLE_PATHS = ['/', '/login', '/register', '/welcome'];
const LOAD_TIMEOUT_MS = 15000;

function isVisiblePath(pathname) {
  return VISIBLE_PATHS.includes(pathname) || pathname.startsWith('/subscription');
}

function applyTawkVisibility(visible) {
  const api = window.Tawk_API;
  if (!api || window.__tawkLoadState !== 'ready') return;
  try {
    if (visible) api.showWidget?.();
    else api.hideWidget?.();
  } catch (error) {
    console.warn('[SupportChat] Failed to update widget visibility:', error.message);
  }
}

function openTawkChat() {
  try {
    window.Tawk_API?.showWidget?.();
    window.Tawk_API?.maximize?.();
  } catch (error) {
    console.warn('[SupportChat] Failed to open widget:', error.message);
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

function clearBrokenTawk() {
  window.clearTimeout(window.__tawkLoadTimer);
  delete window.__tawkLoadTimer;
  document.getElementById('tawk-to-script')?.remove();
  document.querySelectorAll('iframe[src*="tawk.to"], [id^="tawk_"], #tawkchat-container')
    .forEach(node => node.remove());
  delete window.Tawk_API;
  delete window.Tawk_LoadStart;
  delete window.$_Tawk;
}

/**
 * Tawk remains opt-in: the third-party script is injected only after a click.
 * The global load state survives SPA remounts so route changes never initialize
 * the vendor twice.
 */
export default function SupportChat() {
  const { t } = useTranslation();
  const propertyId = process.env.REACT_APP_TAWK_PROPERTY_ID;
  const widgetId = process.env.REACT_APP_TAWK_WIDGET_ID || 'default';
  const { pathname } = useLocation();
  const visible = isVisiblePath(pathname);
  const [loadState, setLoadState] = useState(() => window.__tawkLoadState || 'idle');

  useEffect(() => {
    const syncGlobalState = (event) => setLoadState(event.detail);
    window.addEventListener('tawk-load-state', syncGlobalState);
    return () => window.removeEventListener('tawk-load-state', syncGlobalState);
  }, []);

  useEffect(() => {
    window.__tawkVisible = visible;
    applyTawkVisibility(visible);
  }, [visible]);

  useEffect(() => {
    if (!propertyId || loadState !== 'loading') return undefined;
    if (document.getElementById('tawk-to-script')) return undefined;

    window.__tawkUserActivated = true;
    window.__tawkLoadState = 'loading';
    protectDocumentTitle();
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    const finish = (state) => {
      window.clearTimeout(window.__tawkLoadTimer);
      delete window.__tawkLoadTimer;
      window.__tawkLoadState = state;
      setLoadState(state);
      window.dispatchEvent(new CustomEvent('tawk-load-state', { detail: state }));
    };
    const fail = () => {
      clearBrokenTawk();
      finish('error');
    };

    window.Tawk_API.onLoad = () => {
      finish('ready');
      if (window.__tawkVisible) openTawkChat();
      else applyTawkVisibility(false);
    };

    const script = document.createElement('script');
    script.id = 'tawk-to-script';
    script.async = true;
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    script.charset = 'UTF-8';
    script.onerror = fail;
    document.body.appendChild(script);
    window.__tawkLoadTimer = window.setTimeout(fail, LOAD_TIMEOUT_MS);

    // Do not remove a healthy script on unmount; it is shared across SPA routes.
    return undefined;
  }, [loadState, propertyId, widgetId]);

  if (!propertyId || !visible || loadState === 'ready') return null;

  const retry = () => {
    clearBrokenTawk();
    window.__tawkLoadState = 'loading';
    setLoadState('loading');
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2 max-sm:absolute max-sm:top-3 max-sm:bottom-auto">
      {loadState === 'error' && (
        <p role="alert" className="max-w-64 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 shadow-lg dark:bg-red-900/30 dark:text-red-200">
          {t('support_chat_load_failed', '客服连接失败，请重试')}
        </p>
      )}
      <button
        type="button"
        aria-label={loadState === 'error'
          ? t('support_chat_retry', '重试在线客服')
          : t('support_chat_open', '打开在线客服')}
        disabled={loadState === 'loading'}
        onClick={loadState === 'error' ? retry : () => {
          window.__tawkLoadState = 'loading';
          setLoadState('loading');
        }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-70 max-sm:h-11 max-sm:w-11"
      >
        <span className={`material-symbols-outlined ${loadState === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true">
          {loadState === 'loading' ? 'progress_activity' : 'support_agent'}
        </span>
      </button>
    </div>
  );
}
