import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { userAPI } from '../services/api';
import { useAuth } from './AuthContext';
import Spotlight from '../components/Spotlight';

// Per-user localStorage key — a global key leaks one account's "completed"
// state into the next account on the same browser (test5 done → test6 skipped).
const LS_PREFIX = 'onboarding_tour_completed';
const lsKey = (userId) => (userId ? `${LS_PREFIX}_${userId}` : LS_PREFIX);

// Step sequence (design §11). `anchor` matches data-tour="<anchor>" in pages.
export const TOUR_STEPS = [
  { id: 'today-tasks',   route: '/discovery',              anchor: 'today-tasks',
    titleKey: 'tour_step_tasks_title',  bodyKey: 'tour_step_tasks_body',  placement: 'bottom' },
  { id: 'recall-streak', route: '/discovery',              anchor: 'recall-streak',
    titleKey: 'tour_step_streak_title', bodyKey: 'tour_step_streak_body', placement: 'bottom' },
  { id: 'stats',         route: '/discovery',              anchor: 'stats',
    titleKey: 'tour_step_stats_title',  bodyKey: 'tour_step_stats_body',  placement: 'top' },
  { id: 'scenario-card', route: '/discovery',              anchor: 'scenario-card',
    titleKey: 'tour_step_scenario_title', bodyKey: 'tour_step_scenario_body', placement: 'top' },
  { id: 'mic',           route: '/conversation?mode=tour', anchor: 'mic', demoMode: true,
    titleKey: 'tour_step_mic_title',    bodyKey: 'tour_step_mic_body',    placement: 'top' },
  { id: 'cc-mode',       route: '/conversation?mode=tour', anchor: 'cc-mode', demoMode: true,
    titleKey: 'tour_step_cc_title',     bodyKey: 'tour_step_cc_body',     placement: 'top' },
];

// ── Pure logic (replicated verbatim in tour-logic.test.js — keep in sync) ──

// Returns the next step index, or null when already on the last step.
export function getNextStep(idx, total) {
  if (typeof idx !== 'number' || typeof total !== 'number') return null;
  const next = idx + 1;
  return next < total ? next : null;
}

// Returns the previous step index, or null when already on the first step.
export function getPrevStep(idx) {
  if (typeof idx !== 'number') return null;
  return idx > 0 ? idx - 1 : null;
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
  const { user } = useAuth();
  const userId = user?.id;

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // Optimistic read from this user's localStorage key prevents a flash before
  // the API responds. Falls back to the base key only when userId is unknown.
  const [completed, setCompleted] = useState(
    () => localStorage.getItem(lsKey(userId)) === 'true'
  );
  const completedRef = useRef(completed);
  completedRef.current = completed;

  // Reconcile with backend-authoritative value whenever the logged-in user
  // changes. Backend is the source of truth: it OVERRIDES the optimistic
  // localStorage value in BOTH directions, so a stale "true" from a previous
  // account on this browser cannot suppress a new user's tour.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    // Re-seed optimistic value from this user's own key on account switch.
    setCompleted(localStorage.getItem(lsKey(userId)) === 'true');
    userAPI
      .getOnboardingTour()
      .then((res) => {
        if (cancelled) return;
        const done = !!(res?.data?.completed ?? res?.completed);
        setCompleted(done);
        localStorage.setItem(lsKey(userId), done ? 'true' : 'false');
      })
      .catch(() => {/* offline / soft-fail: keep optimistic value */});
    return () => { cancelled = true; };
  }, [userId]);

  const persistComplete = useCallback(() => {
    localStorage.setItem(lsKey(userId), 'true');
    setCompleted(true);
    userAPI.markOnboardingTourComplete().catch(() => {/* localStorage covers it */});
  }, [userId]);

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

  const prev = useCallback(() => {
    setStepIndex((idx) => {
      const pi = getPrevStep(idx);
      if (pi === null) return idx; // first step: no-op (button is disabled in UI)
      const step = TOUR_STEPS[pi];
      if (step && location.pathname !== step.route.split('?')[0]) navigate(step.route);
      return pi;
    });
  }, [navigate, location.pathname]);

  const skip = finish;

  const value = { active, stepIndex, completed, start, next, prev, skip, TOUR_STEPS };

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
      isFirst={ctx.stepIndex === 0}
      prefer={step.placement}
      onNext={ctx.next}
      onPrev={ctx.prev}
      onSkip={ctx.skip}
      nextLabel={t('tour_next')}
      doneLabel={t('tour_done')}
      skipLabel={t('tour_skip')}
      prevLabel={t('tour_prev')}
    />
  );
}

export default TourContext;
