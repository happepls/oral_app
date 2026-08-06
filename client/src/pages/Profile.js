import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle, ChevronRight, Crown, History as HistoryIcon,
  LogOut, MessageSquare, Palette, Pencil, RefreshCw
} from 'lucide-react';
import BottomNav from '../components/BottomNav';
import { AccessibleDialog } from '../components/AccessibleDialog';
import { useAuth } from '../contexts/AuthContext';
import { feedbackAPI, historyAPI, userAPI } from '../services/api';
import { LANGUAGES } from '../constants/languages';

const FEEDBACK_MAX_LENGTH = 500;

function ProfileAction({ icon: Icon, label, value, onClick, chevron = true, role, checked }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role={role}
      aria-checked={role === 'switch' ? checked : undefined}
      className="flex min-h-[64px] w-full items-center rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-brand transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
    >
      <Icon aria-hidden="true" className="mr-3 h-5 w-5 flex-shrink-0 text-primary" />
      <span className="flex-1 font-medium text-slate-900 dark:text-white">{label}</span>
      {value && <span className="mr-2 text-sm text-slate-600 dark:text-slate-300">{value}</span>}
      {role === 'switch' ? (
        <span
          aria-hidden="true"
          className={`relative h-7 w-12 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </span>
      ) : chevron ? <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-500" /> : null}
    </button>
  );
}

function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout, refreshProfile } = useAuth();
  const feedbackTriggerRef = useRef(null);

  const [stats, setStats] = useState({ totalSessions: 0, totalDurationMinutes: 0 });
  const [statsState, setStatsState] = useState('loading');
  const [subscription, setSubscription] = useState(null);
  const [subscriptionState, setSubscriptionState] = useState('loading');

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaveError, setNameSaveError] = useState('');

  const [editingLang, setEditingLang] = useState(false);
  const [savingLang, setSavingLang] = useState(false);
  const [langSaveError, setLangSaveError] = useState('');

  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState('功能建议');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const loadStats = async () => {
    if (!user?.id) return;
    setStatsState('loading');
    try {
      const result = await historyAPI.getStats(user.id);
      setStats({
        totalSessions: Number(result?.totalSessions || 0),
        totalDurationMinutes: Number(result?.totalDurationMinutes || 0),
      });
      setStatsState('ready');
    } catch {
      setStatsState('error');
    }
  };

  const loadSubscription = async () => {
    setSubscriptionState('loading');
    try {
      const result = await userAPI.getSubscription();
      setSubscription(result);
      setSubscriptionState(result === null ? 'error' : 'ready');
    } catch {
      setSubscriptionState('error');
    }
  };

  useEffect(() => {
    void refreshProfile?.();
  }, [refreshProfile]);

  useEffect(() => {
    void loadStats();
    void loadSubscription();
    // Calls are intentionally independent so one slow account service does not block another.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSaveUsername = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setNameSaveError(t('qa_ui.profile_name_required'));
      return;
    }
    if (trimmed.length > 30) {
      setNameSaveError(t('qa_ui.profile_name_too_long'));
      return;
    }
    if (trimmed === (user?.nickname || user?.username)) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setNameSaveError('');
    try {
      await userAPI.updateProfile({ nickname: trimmed });
      await refreshProfile?.();
      setEditingName(false);
    } catch {
      setNameSaveError(t('qa_ui.profile_save_error'));
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveNativeLang = async (value) => {
    setSavingLang(true);
    setLangSaveError('');
    try {
      await userAPI.updateProfile({ native_language: value });
      await refreshProfile?.();
      setEditingLang(false);
    } catch {
      setLangSaveError(t('qa_ui.profile_save_error'));
    } finally {
      setSavingLang(false);
    }
  };

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const handleFeedbackSubmit = async () => {
    const message = feedbackText.trim();
    if (!message) {
      setFeedbackError(t('qa_ui.feedback_required'));
      return;
    }
    setFeedbackError('');
    setFeedbackSubmitting(true);
    try {
      await feedbackAPI.submit({ category: feedbackCategory, message });
      setFeedbackSubmitted(true);
    } catch {
      setFeedbackError(t('qa_ui.feedback_submit_error'));
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleFeedbackClose = () => {
    setShowFeedbackModal(false);
    setFeedbackText('');
    setFeedbackCategory('功能建议');
    setFeedbackError('');
    setFeedbackSubmitted(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const selectedLanguage = LANGUAGES.find(
    (language) => language.value.toLowerCase() === (user?.native_language || '').toLowerCase(),
  );
  const isSubscribed = user?.subscription_status === 'active' || subscription?.status === 'active';
  const durationHours = stats.totalDurationMinutes > 0
    ? (stats.totalDurationMinutes / 60).toFixed(1)
    : null;
  const feedbackCategories = [
    { value: '功能建议', label: t('qa_ui.feedback_category_feature') },
    { value: '问题反馈', label: t('qa_ui.feedback_category_problem') },
    { value: '其他', label: t('qa_ui.feedback_category_other') },
  ];

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[720px] flex-col" style={{ background: 'var(--background)' }}>
      <header className="sticky top-0 z-20 flex min-h-[56px] items-center justify-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('qa_ui.profile_title')}</h1>
      </header>

      <main className="flex-1 space-y-6 px-4 pb-28 pt-5">
        <section aria-labelledby="profile-identity-title" className="rounded-3xl border border-slate-100 bg-white p-5 shadow-brand dark:border-slate-700 dark:bg-slate-800">
          <h2 id="profile-identity-title" className="sr-only">{t('qa_ui.profile_identity')}</h2>
          <div className="flex items-center gap-4">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={t('qa_ui.profile_avatar_alt')} className="h-20 w-20 rounded-full object-cover ring-4 ring-primary/20" />
            ) : (
              <div aria-hidden="true" className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#637FF1] to-[#a47af6] text-2xl font-bold text-white ring-4 ring-primary/20">
                {(user?.nickname || user?.username)?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="space-y-2">
                  <label htmlFor="profile-name" className="sr-only">{t('qa_ui.profile_name_label')}</label>
                  <input
                    id="profile-name"
                    value={nameValue}
                    onChange={(event) => setNameValue(event.target.value)}
                    maxLength={30}
                    autoFocus
                    disabled={savingName}
                    aria-describedby={nameSaveError ? 'profile-name-error' : undefined}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-lg font-bold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={handleSaveUsername} disabled={savingName} className="rounded-xl bg-primary px-4 text-sm font-medium text-white disabled:opacity-50">
                      {savingName ? t('qa_ui.saving') : t('qa_ui.save')}
                    </button>
                    <button type="button" onClick={() => { setEditingName(false); setNameSaveError(''); }} disabled={savingName} className="rounded-xl border border-slate-300 px-4 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200">
                      {t('qa_ui.cancel')}
                    </button>
                  </div>
                  {nameSaveError && <p id="profile-name-error" role="alert" className="text-sm text-red-700 dark:text-red-300">{nameSaveError}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setNameValue(user?.nickname || user?.username || ''); setEditingName(true); setNameSaveError(''); }}
                  aria-label={t('qa_ui.profile_edit_name', { name: user?.nickname || user?.username || t('qa_ui.learner') })}
                  className="flex min-h-[44px] max-w-full items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <span className="truncate text-xl font-bold text-slate-900 dark:text-white">{user?.nickname || user?.username || t('qa_ui.learner')}</span>
                  <Pencil aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-slate-500" />
                </button>
              )}
              <p className="truncate text-sm text-slate-600 dark:text-slate-300">{user?.email || ''}</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="profile-learning-summary">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="profile-learning-summary" className="text-base font-bold text-slate-900 dark:text-white">{t('qa_ui.profile_learning_summary')}</h2>
            {statsState === 'error' && (
              <button type="button" onClick={loadStats} className="flex items-center gap-1 rounded-lg px-2 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                <RefreshCw aria-hidden="true" className="h-4 w-4" />{t('qa_ui.retry')}
              </button>
            )}
          </div>
          {statsState === 'error' && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{t('qa_ui.profile_stats_error')}</p>}
          <div aria-busy={statsState === 'loading'} className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-brand dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-600 dark:text-slate-300">{t('qa_ui.sessions_label')}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{statsState === 'loading' ? '—' : t('qa_ui.session_count', { count: stats.totalSessions })}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-brand dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-600 dark:text-slate-300">{t('qa_ui.practice_time_label')}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{statsState === 'loading' ? '—' : durationHours ? t('qa_ui.practice_hours', { count: durationHours }) : t('qa_ui.no_data')}</p>
            </div>
          </div>
          {statsState === 'loading' && <p role="status" className="sr-only">{t('qa_ui.profile_stats_loading')}</p>}
        </section>

        <section aria-labelledby="profile-learning-links">
          <h2 id="profile-learning-links" className="mb-3 text-base font-bold text-slate-900 dark:text-white">{t('qa_ui.profile_learning_records')}</h2>
          <div className="space-y-2">
            <ProfileAction icon={HistoryIcon} label={t('qa_ui.menu_history')} onClick={() => navigate('/history')} />
            <ProfileAction icon={CheckCircle} label={t('qa_ui.daily_checkin_plain')} onClick={() => navigate('/checkin')} />
            <ProfileAction icon={Crown} label={t('qa_ui.achievements_plain')} onClick={() => navigate('/achievements')} />
          </div>
        </section>

        <section aria-labelledby="profile-account-settings">
          <h2 id="profile-account-settings" className="mb-3 text-base font-bold text-slate-900 dark:text-white">{t('qa_ui.profile_account_settings')}</h2>
          <div className="space-y-2">
            <ProfileAction
              icon={Crown}
              label={t('qa_ui.menu_subscription')}
              value={subscriptionState === 'loading' ? t('qa_ui.loading') : isSubscribed ? t('qa_ui.subscription_active_short') : t('qa_ui.subscription_free')}
              onClick={() => navigate('/subscription')}
            />
            {subscriptionState === 'error' && <p role="status" className="px-2 text-sm text-amber-800 dark:text-amber-300">{t('qa_ui.subscription_status_unavailable')}</p>}

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-brand dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white">{t('qa_ui.native_language')}</p>
                  {!editingLang && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{selectedLanguage ? `${selectedLanguage.flag} ${selectedLanguage.label}` : t('qa_ui.not_set')}</p>}
                </div>
                {!editingLang && (
                  <button type="button" onClick={() => { setEditingLang(true); setLangSaveError(''); }} className="flex items-center gap-1 rounded-xl bg-primary/10 px-3 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                    <Pencil aria-hidden="true" className="h-4 w-4" />{t('qa_ui.edit')}
                  </button>
                )}
              </div>
              {editingLang && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="native-language" className="sr-only">{t('qa_ui.native_language')}</label>
                  <select
                    id="native-language"
                    autoFocus
                    defaultValue={user?.native_language || ''}
                    onChange={(event) => handleSaveNativeLang(event.target.value)}
                    disabled={savingLang}
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  >
                    <option value="" disabled>{t('qa_ui.native_language_select')}</option>
                    {LANGUAGES.map((language) => <option key={language.value} value={language.value}>{language.flag} {language.label}</option>)}
                  </select>
                  <button type="button" onClick={() => setEditingLang(false)} disabled={savingLang} className="rounded-xl border border-slate-300 px-4 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200">{t('qa_ui.cancel')}</button>
                </div>
              )}
              {langSaveError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{langSaveError}</p>}
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{t('qa_ui.native_hint')}</p>
            </div>

            <ProfileAction icon={Palette} label={t('qa_ui.menu_theme')} value={isDarkMode ? t('qa_ui.theme_dark') : t('qa_ui.theme_light')} onClick={toggleTheme} chevron={false} role="switch" checked={isDarkMode} />
            <div ref={feedbackTriggerRef}>
              <ProfileAction icon={MessageSquare} label={t('qa_ui.menu_feedback')} onClick={() => setShowFeedbackModal(true)} />
            </div>
          </div>
        </section>

        <button type="button" onClick={handleLogout} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white font-bold text-red-700 shadow-brand transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 dark:border-red-900 dark:bg-slate-800 dark:text-red-300 dark:hover:bg-red-950/30">
          <LogOut aria-hidden="true" className="h-5 w-5" />{t('qa_ui.logout')}
        </button>
      </main>

      {showFeedbackModal && (
        <AccessibleDialog
          title={t('qa_ui.feedback_title')}
          description={t('qa_ui.feedback_dialog_description')}
          onClose={handleFeedbackClose}
          closeLabel={t('qa_ui.close_dialog')}
          panelClassName="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-3xl p-6"
          zIndex={300}
        >
          {feedbackSubmitted ? (
            <div className="flex flex-col items-center gap-4 py-5 text-center">
              <div aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40"><CheckCircle className="h-8 w-8 text-emerald-700 dark:text-emerald-300" /></div>
              <h3 className="text-lg font-bold">{t('qa_ui.feedback_thanks')}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{t('qa_ui.feedback_success_body')}</p>
              <button type="button" onClick={handleFeedbackClose} className="mt-2 w-full rounded-xl bg-primary py-3 font-medium text-white">{t('qa_ui.close')}</button>
            </div>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); void handleFeedbackSubmit(); }}>
              <h3 className="mb-5 pr-12 text-lg font-bold">{t('qa_ui.feedback_title')}</h3>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">{t('qa_ui.feedback_type')}</legend>
                <div className="grid grid-cols-3 gap-2">
                  {feedbackCategories.map((category) => (
                    <button
                      key={category.value}
                      type="button"
                      aria-pressed={feedbackCategory === category.value}
                      onClick={() => setFeedbackCategory(category.value)}
                      className={`rounded-xl border-2 px-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${feedbackCategory === category.value ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-700 dark:border-slate-600 dark:text-slate-200'}`}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="mt-4">
                <label htmlFor="feedback-message" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">{t('qa_ui.feedback_content')}</label>
                <textarea
                  id="feedback-message"
                  value={feedbackText}
                  onChange={(event) => setFeedbackText(event.target.value.slice(0, FEEDBACK_MAX_LENGTH))}
                  placeholder={t('qa_ui.feedback_placeholder')}
                  rows={5}
                  maxLength={FEEDBACK_MAX_LENGTH}
                  aria-describedby={`feedback-count${feedbackError ? ' feedback-error' : ''}`}
                  aria-invalid={Boolean(feedbackError)}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
                <p id="feedback-count" className="mt-1 text-right text-xs text-slate-600 dark:text-slate-300">{feedbackText.length}/{FEEDBACK_MAX_LENGTH}</p>
                {feedbackError && <p id="feedback-error" role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{feedbackError}</p>}
              </div>
              <button type="submit" disabled={feedbackSubmitting || !feedbackText.trim()} className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#637FF1] to-[#a47af6] py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                {feedbackSubmitting ? t('qa_ui.feedback_submitting') : t('qa_ui.feedback_submit')}
              </button>
            </form>
          )}
        </AccessibleDialog>
      )}

      <BottomNav currentPage="profile" />
    </div>
  );
}

export default Profile;
