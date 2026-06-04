import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { userAPI } from '../services/api';
import Spotlight from '../components/Spotlight';

const LS_KEY = 'onboarding_tour_completed';

// Step sequence (design §3). `anchor` matches data-tour="<anchor>" in pages.
export const TOUR_STEPS = [
  { id: 'scenario-card', route: '/discovery',    anchor: 'scenario-card',
    titleKey: 'tour_step1_title', bodyKey: 'tour_step1_body', placement: 'bottom' },
  { id: 'recall-streak', route: '/discovery',    anchor: 'recall-streak',
    titleKey: 'tour_step2_title', bodyKey: 'tour_step2_body', placement: 'top' },
  { id: 'mic',           route: '/conversation?mode=tour', anchor: 'mic', demoMode: true,
    titleKey: 'tour_step3_title', bodyKey: 'tour_step3_body', placement: 'top' },
];

// ── Pure logic (replicated verbatim in tour-logic.test.js — keep in sync) ──

// Returns the next step index, or null when already on the last step.
export function getNextStep(idx, total) {
  if (typeof idx !== 'number' || typeof total !== 'number') return null;
  const next = idx + 1;
  return next < total ? next : null;
}

// Tour starts only when not yet completed AND the start signal is present.
export function shouldStartTour(completed, startTourFlag) {
  return !completed && !!startTourFlag;
}

// ───────────────────────────────────────────────────────────────────────

const TourContext = createContext(null);

export function useTour() {
  return useContext(TourContext);
}

export function TourProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // Optimistic read from localStorage prevents a flash before the API responds.
  const [completed, setCompleted] = useState(
    () => localStorage.getItem(LS_KEY) === 'true'
  );
  const completedRef = useRef(completed);
  completedRef.current = completed;

  // Reconcile with backend-authoritative value on mount.
  useEffect(() => {
    let cancelled = false;
    userAPI
      .getOnboardingTour()
      .then((res) => {
        const done = !!(res?.data?.completed ?? res?.completed);
        if (!cancelled && done) {
          setCompleted(true);
          localStorage.setItem(LS_KEY, 'true');
        }
      })
      .catch(() => {/* offline / soft-fail: keep optimistic value */});
    return () => { cancelled = true; };
  }, []);

  const persistComplete = useCallback(() => {
    localStorage.setItem(LS_KEY, 'true');
    setCompleted(true);
    userAPI.markOnboardingTourComplete().catch(() => {/* localStorage covers it */});
  }, []);

  const start = useCallback(() => {
    if (completedRef.current) return; // never re-run for finished users
    setStepIndex(0);
    setActive(true);
    const step0 = TOUR_STEPS[0];
    if (step0 && location.pathname !== step0.route.split('?')[0]) navigate(step0.route);
  }, [navigate, location.pathname]);

  const finish = useCallback(() => {
    setActive(false);
    persistComplete();
    // The mic step lives on a demo /conversation?mode=tour page that never opens
    // a WebSocket — leave the user on a usable page after the tour ends.
    if (new URLSearchParams(location.search).get('mode') === 'tour') {
      navigate('/discovery');
    }
  }, [persistComplete, navigate, location.search]);

  const next = useCallback(() => {
    setStepIndex((idx) => {
      const ni = getNextStep(idx, TOUR_STEPS.length);
      if (ni === null) {
        finish();
        return idx;
      }
      const step = TOUR_STEPS[ni];
      if (step && location.pathname !== step.route.split('?')[0]) navigate(step.route);
      return ni;
    });
  }, [finish, navigate, location.pathname]);

  const skip = finish;

  const value = { active, stepIndex, completed, start, next, skip, TOUR_STEPS };

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourHost />
    </TourContext.Provider>
  );
}

// Renders the current step's Spotlight when the tour is active and the page
// matches the step's route (avoids drawing before a cross-page navigate lands).
function TourHost() {
  const ctx = useTour();
  const location = useLocation();
  const { t } = useTranslation();
  if (!ctx || !ctx.active) return null;

  const step = TOUR_STEPS[ctx.stepIndex];
  if (!step) return null;
  // step.route may carry a query (e.g. ?mode=tour); compare path only.
  if (location.pathname !== step.route.split('?')[0]) return null;

  return (
    <Spotlight
      anchor={step.anchor}
      title={t(step.titleKey)}
      body={t(step.bodyKey)}
      stepIndex={ctx.stepIndex}
      total={TOUR_STEPS.length}
      isLast={ctx.stepIndex === TOUR_STEPS.length - 1}
      prefer={step.placement}
      onNext={ctx.next}
      onSkip={ctx.skip}
      nextLabel={t('tour_next')}
      doneLabel={t('tour_done')}
      skipLabel={t('tour_skip')}
    />
  );
}

export default TourContext;
