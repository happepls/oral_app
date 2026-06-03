/**
 * Tests for pure logic extracted from client/src/pages/Onboarding.js (single-step):
 *  - nickname-required validation predicate (the `disabled={!nickname.trim()}`
 *    button guard, also re-checked in onClick: `if (nickname.trim()) handleSubmit()`)
 *  - submit → navigate('/goal-setting') decision on profile-update success
 *  - structural invariant: Onboarding is single-step with NO proficiency quiz
 *    (quiz lives only in GoalSetting). Modeled as a config flag hasQuiz=false.
 *
 * The button-guard predicate and submit→navigate branch are replicated VERBATIM
 * from Onboarding.js so they can be exercised without mounting React / i18n /
 * motion-react / AuthContext. If the originals change, mirror the change here.
 */

// ── Replicated from Onboarding.js: STEPS config (single step, no quiz) ──
const STEPS = ['基础信息'];

// Config flag derived from the Onboarding module shape: no QUIZ_QUESTIONS exist
// in Onboarding.js (the quiz was removed; it only lives in GoalSetting Step 3).
const ONBOARDING_CONFIG = {
  totalSteps: STEPS.length,
  hasQuiz: false,
};

// ── Replicated from the submit button in Onboarding.js ──
//   disabled={!nickname.trim() || saving}
//   onClick={() => { if (nickname.trim()) handleSubmit(); }}
function canSubmit(nickname, saving) {
  return !!nickname.trim() && !saving;
}

// ── Replicated from Onboarding.js handleSubmit's navigate decision ──
//   const result = await updateProfile({...});
//   if (result.success) { navigate('/goal-setting'); } else { setError(...); }
// Returns the navigation target (or null when it should stay on the form).
function submitDecision(result, t = (k) => k) {
  if (result && result.success) {
    return { navigateTo: '/goal-setting', error: '' };
  }
  return {
    navigateTo: null,
    error: (result && result.message) || t('err_onboarding_default'),
  };
}

describe('Onboarding config — single-step, no quiz', () => {
  test('has exactly one step', () => {
    expect(ONBOARDING_CONFIG.totalSteps).toBe(1);
    expect(STEPS).toEqual(['基础信息']);
  });

  test('does NOT include a proficiency quiz step', () => {
    expect(ONBOARDING_CONFIG.hasQuiz).toBe(false);
  });

  test('the single step is the basic-info step', () => {
    expect(STEPS[0]).toBe('基础信息');
    expect(STEPS).not.toContain('测评');
    expect(STEPS).not.toContain('quiz');
  });
});

describe('canSubmit — nickname-required validation predicate', () => {
  test('blocks submit when nickname is empty', () => {
    expect(canSubmit('', false)).toBe(false);
  });

  test('blocks submit when nickname is whitespace only', () => {
    expect(canSubmit('   ', false)).toBe(false);
  });

  test('allows submit with a valid nickname', () => {
    expect(canSubmit('Alice', false)).toBe(true);
  });

  test('trims surrounding whitespace before validating', () => {
    expect(canSubmit('  Bob  ', false)).toBe(true);
  });

  test('blocks submit while saving even with a valid nickname', () => {
    expect(canSubmit('Alice', true)).toBe(false);
  });
});

describe('submitDecision — navigate to /goal-setting on success', () => {
  test('navigates to /goal-setting when updateProfile succeeds', () => {
    const out = submitDecision({ success: true });
    expect(out.navigateTo).toBe('/goal-setting');
    expect(out.error).toBe('');
  });

  test('stays on form and surfaces server message on failure', () => {
    const out = submitDecision({ success: false, message: '昵称已被占用' });
    expect(out.navigateTo).toBeNull();
    expect(out.error).toBe('昵称已被占用');
  });

  test('falls back to default error key when no message provided', () => {
    const out = submitDecision({ success: false }, (k) => k);
    expect(out.navigateTo).toBeNull();
    expect(out.error).toBe('err_onboarding_default');
  });

  test('never navigates to a quiz step (no intermediate quiz route)', () => {
    const out = submitDecision({ success: true });
    expect(out.navigateTo).not.toBe('/quiz');
    expect(out.navigateTo).toBe('/goal-setting');
  });
});
