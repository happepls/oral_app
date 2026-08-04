import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function AccessibleDialog({
  children,
  title,
  description,
  onClose,
  closeLabel,
  placement = 'center',
  overlayClassName = '',
  panelClassName = '',
  showCloseButton = true,
  zIndex = 300,
}) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = description ? `${generatedId}-description` : undefined;
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const appRoot = document.getElementById('root');
    const rootWasInert = appRoot?.inert;
    const rootAriaHidden = appRoot?.getAttribute('aria-hidden');
    document.body.style.overflow = 'hidden';
    if (appRoot) {
      appRoot.inert = true;
      appRoot.setAttribute('aria-hidden', 'true');
    }

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector(FOCUSABLE_SELECTOR);
    (firstFocusable || panel)?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const focusable = [...panel.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (appRoot) {
        appRoot.inert = Boolean(rootWasInert);
        if (rootAriaHidden === null) appRoot.removeAttribute('aria-hidden');
        else appRoot.setAttribute('aria-hidden', rootAriaHidden);
      }
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const overlayAlignment = placement === 'bottom'
    ? 'items-end'
    : 'items-center';

  return createPortal(
    <div
      className={`fixed inset-0 flex ${overlayAlignment} justify-center bg-black/60 p-4 ${overlayClassName}`}
      style={{ zIndex }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`relative w-full bg-white text-slate-900 shadow-xl dark:bg-slate-800 dark:text-white ${panelClassName}`}
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-xl text-xl text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
        <h2 id={titleId} className="sr-only">{title}</h2>
        {description && <p id={descriptionId} className="sr-only">{description}</p>}
        {children}
      </section>
    </div>,
    document.body,
  );
}
