import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
const Accent = lazy(() => import('./PracticeTransitionAccent'));

// Kept outside route suspense: navigating starts immediately, never waits for Rive.
export default function PracticeTransition() {
  const location = useLocation();
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (location.pathname !== '/conversation' || !location.state?.practiceTransition) { setVisible(false); return; }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 400);
    return () => clearTimeout(timer);
  }, [location.key, location.pathname, location.state]);
  if (!visible) return null;
  return <div aria-hidden="true" data-testid="practice-transition" className="pointer-events-none fixed right-5 top-5 z-50 h-20 w-20 overflow-hidden rounded-2xl bg-slate-50 shadow-sm">
    {reduced ? <span className="flex h-full items-center justify-center text-3xl">✨</span> : <Suspense fallback={<span>✨</span>}><Accent /></Suspense>}
  </div>;
}
