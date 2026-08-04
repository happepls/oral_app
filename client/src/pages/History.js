import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChevronRight, RefreshCw, Search } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { historyAPI } from '../services/api';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 20;
const HISTORY_SCROLL_KEY = 'history_scroll_position';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getConversationDate(item) {
  return item?.startTime || item?.started_at || item?.createdAt || item?.created_at;
}

function getConversationTitle(item, fallback) {
  return item?.topic || item?.scenario_title || item?.summary || fallback;
}

function getDuration(item) {
  const minutes = Number(item?.durationMinutes || item?.duration_minutes || 0);
  if (minutes > 0) return minutes;
  const seconds = Number(item?.duration || item?.durationSeconds || item?.duration_seconds || 0);
  return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;
}

export default function History() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(sessionId ? null : []);
  const [state, setState] = useState('loading');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = async () => {
    setState('loading');
    try {
      const result = sessionId
        ? await historyAPI.getConversationDetail(sessionId)
        : await historyAPI.getUserHistory(user.id);
      setData(result);
      setState('ready');
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    if (user?.id) void load();
    // Authentication is enforced by the route guard; this dependency reloads after hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  useEffect(() => {
    if (state !== 'ready' || sessionId) return;
    const stored = Number(sessionStorage.getItem(HISTORY_SCROLL_KEY) || 0);
    if (stored > 0) requestAnimationFrame(() => window.scrollTo({ top: stored }));
  }, [state, sessionId]);

  const conversations = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  const normalizedQuery = query.trim().toLocaleLowerCase(i18n.language);
  const filteredConversations = useMemo(() => conversations.filter((item) => {
    if (!normalizedQuery) return true;
    return [item?.topic, item?.scenario_title, item?.summary, item?.target_language]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase(i18n.language).includes(normalizedQuery));
  }), [conversations, normalizedQuery, i18n.language]);
  const visibleConversations = filteredConversations.slice(0, visibleCount);

  const groupedConversations = useMemo(() => visibleConversations.reduce((groups, item) => {
    const date = parseDate(getConversationDate(item));
    const key = date ? new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'long' }).format(date) : t('qa_ui.time_unknown');
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {}), [visibleConversations, i18n.language, t]);

  const openConversation = (id) => {
    sessionStorage.setItem(HISTORY_SCROLL_KEY, String(window.scrollY));
    navigate(`/history/${encodeURIComponent(id)}`);
  };

  const detailTitle = getConversationTitle(data, t('qa_ui.history_practice'));
  const detailDate = parseDate(getConversationDate(data));
  const detailDuration = getDuration(data);
  const detailScore = data?.score ?? data?.overall_score;

  return (
    <div className="app-page app-page--with-nav flex min-h-[100dvh] max-w-[720px] flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 flex min-h-[56px] items-center border-b border-slate-200 bg-white/95 px-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <button
          type="button"
          aria-label={sessionId ? t('qa_ui.history_back_to_list') : t('qa_ui.back_profile')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          onClick={() => navigate(sessionId ? '/history' : '/profile')}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-slate-900 dark:text-white">{sessionId ? t('qa_ui.history_detail') : t('qa_ui.history_title')}</h1>
        <span aria-hidden="true" className="h-11 w-11" />
      </header>

      <main className="flex-1 p-4">
        {state === 'loading' && (
          <div role="status" aria-live="polite" className="py-16 text-center text-slate-600 dark:text-slate-300">
            <div aria-hidden="true" className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            {t('qa_ui.loading')}
          </div>
        )}

        {state === 'error' && (
          <div role="alert" className="py-16 text-center">
            <p className="mb-4 text-slate-700 dark:text-slate-200">{t('qa_ui.history_error')}</p>
            <button type="button" className="guaji-btn guaji-btn-secondary mx-auto" onClick={load}><RefreshCw aria-hidden="true" size={18} />{t('qa_ui.retry')}</button>
          </div>
        )}

        {state === 'ready' && !sessionId && (
          <>
            <div className="sticky top-[68px] z-10 mb-5 rounded-2xl bg-slate-50/95 pb-1 backdrop-blur dark:bg-slate-950/95">
              <label htmlFor="history-search" className="sr-only">{t('qa_ui.history_search_label')}</label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <input
                  id="history-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('qa_ui.history_search_placeholder')}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <p className="mt-2 px-1 text-sm text-slate-600 dark:text-slate-300">{t('qa_ui.history_result_count', { count: filteredConversations.length })}</p>
            </div>

            {conversations.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-slate-600 dark:bg-slate-900 dark:text-slate-300">{t('qa_ui.history_empty')}</p>}
            {conversations.length > 0 && filteredConversations.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-slate-600 dark:bg-slate-900 dark:text-slate-300">{t('qa_ui.history_filtered_empty')}</p>}

            {Object.entries(groupedConversations).map(([dateLabel, items]) => (
              <section key={dateLabel} aria-labelledby={`history-group-${dateLabel}`} className="mb-6">
                <h2 id={`history-group-${dateLabel}`} className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <CalendarDays aria-hidden="true" className="h-4 w-4" />{dateLabel}
                </h2>
                <div className="space-y-3">
                  {items.map((item) => {
                    const date = parseDate(getConversationDate(item));
                    const duration = getDuration(item);
                    const score = item?.score ?? item?.overall_score;
                    return (
                      <button
                        key={item.sessionId || item.id}
                        type="button"
                        onClick={() => openConversation(item.sessionId || item.id)}
                        className="flex min-h-[76px] w-full items-center rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-slate-800 dark:bg-slate-900"
                      >
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-slate-900 dark:text-white">{getConversationTitle(item, t('qa_ui.history_practice'))}</strong>
                          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                            {date && <span>{new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)}</span>}
                            {duration > 0 && <span>{t('qa_ui.history_duration', { count: duration })}</span>}
                            {score !== undefined && score !== null && <span>{t('qa_ui.history_score', { score })}</span>}
                            {item?.target_language && <span>{item.target_language}</span>}
                          </span>
                        </span>
                        <ChevronRight aria-hidden="true" className="ml-3 h-5 w-5 flex-shrink-0 text-slate-500" />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            {visibleCount < filteredConversations.length && (
              <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="mb-4 w-full rounded-xl border border-slate-300 bg-white py-3 font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-slate-700 dark:bg-slate-900">
                {t('qa_ui.history_load_more')}
              </button>
            )}
          </>
        )}

        {state === 'ready' && sessionId && (
          <>
            <section aria-labelledby="history-session-title" className="mb-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 id="history-session-title" className="text-lg font-bold text-slate-900 dark:text-white">{detailTitle}</h2>
              <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                {detailDate && <div><dt className="sr-only">{t('qa_ui.history_date')}</dt><dd>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(detailDate)}</dd></div>}
                {detailDuration > 0 && <div><dt className="sr-only">{t('qa_ui.history_duration_label')}</dt><dd>{t('qa_ui.history_duration', { count: detailDuration })}</dd></div>}
                {detailScore !== undefined && detailScore !== null && <div><dt className="sr-only">{t('qa_ui.history_score_label')}</dt><dd>{t('qa_ui.history_score', { score: detailScore })}</dd></div>}
              </dl>
            </section>

            {messages.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-slate-600 dark:bg-slate-900 dark:text-slate-300">{t('qa_ui.history_messages_empty')}</p>}
            <ol aria-label={t('qa_ui.history_transcript')} className="space-y-3">
              {messages.map((message, index) => {
                const isUser = message.role === 'user';
                const timestamp = parseDate(message.timestamp || message.createdAt || message.created_at);
                const audioUrl = message.audioUrl || message.audio_url;
                return (
                  <li key={message._id || message.id || index} className={`max-w-[88%] ${isUser ? 'ml-auto' : ''}`}>
                    <article className={`rounded-2xl p-3 ${isUser ? 'bg-primary text-white' : 'border border-slate-100 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'}`}>
                      <p className={`mb-1 text-xs font-bold ${isUser ? 'text-white/90' : 'text-primary dark:text-indigo-200'}`}>{isUser ? t('qa_ui.history_speaker_you') : t('qa_ui.history_speaker_ai')}</p>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {audioUrl && <audio controls preload="none" className="mt-3 w-full" aria-label={t('qa_ui.history_message_audio', { speaker: isUser ? t('qa_ui.history_speaker_you') : t('qa_ui.history_speaker_ai') })}><source src={audioUrl} /></audio>}
                      {timestamp && <time dateTime={timestamp.toISOString()} className="mt-1 block text-xs opacity-80">{new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(timestamp)}</time>}
                    </article>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </main>
      <BottomNav currentPage="profile" />
    </div>
  );
}
