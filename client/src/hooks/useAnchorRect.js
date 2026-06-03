import { useEffect, useState, useRef } from 'react';

/**
 * Measure a tour anchor element identified by `data-tour="<anchor>"`.
 *
 * Returns `{ rect, timedOut }`:
 *   - rect: latest getBoundingClientRect() of the anchor, or null until found.
 *   - timedOut: true if the anchor never appeared within `timeoutMs`.
 *
 * Handles the async-render case (element not yet in the DOM after a cross-page
 * navigate) via MutationObserver, and keeps the rect fresh on resize/scroll.
 * All observers/listeners/timers are cleaned up on unmount or anchor change.
 */
export function useAnchorRect(anchor, { timeoutMs = 3000 } = {}) {
  const [rect, setRect] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const elRef = useRef(null);

  useEffect(() => {
    if (!anchor) return undefined;

    let cancelled = false;
    setRect(null);
    setTimedOut(false);
    elRef.current = null;

    const selector = `[data-tour="${anchor}"]`;

    const measure = () => {
      const el = elRef.current;
      if (!el || cancelled) return;
      setRect(el.getBoundingClientRect());
    };

    const attach = (el) => {
      elRef.current = el;
      measure();
    };

    // Try immediately.
    const existing = document.querySelector(selector);
    if (existing) attach(existing);

    // Watch for the element appearing later (async data / route transition).
    const mo = new MutationObserver(() => {
      if (elRef.current) return;
      const el = document.querySelector(selector);
      if (el) attach(el);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Reposition on viewport changes.
    const onReflow = () => measure();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);

    // Timeout fallback: if the anchor never resolved, signal a skip.
    const timer = setTimeout(() => {
      if (!cancelled && !elRef.current) setTimedOut(true);
    }, timeoutMs);

    return () => {
      cancelled = true;
      mo.disconnect();
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
      clearTimeout(timer);
    };
  }, [anchor, timeoutMs]);

  return { rect, timedOut };
}

export default useAnchorRect;
