import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { historyAPI } from '../services/api';
import { useTranslation } from 'react-i18next';

function formatDate(value, t) {
  if (!value) return t('qa_ui.time_unknown');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t('qa_ui.time_unknown') : date.toLocaleString();
}

export default function History() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [data, setData] = useState(sessionId ? null : []);
  const [state, setState] = useState('loading');

  const load = async () => {
    setState('loading');
    try {
      const result = sessionId
        ? await historyAPI.getConversationDetail(sessionId)
        : await historyAPI.getUserHistory(user?.id);
      setData(result);
      setState('ready');
    } catch {
      setState('error');
    }
  };

  useEffect(() => { if (sessionId || user?.id) load(); }, [sessionId, user?.id]);

  const conversations = Array.isArray(data) ? data : [];
  const messages = Array.isArray(data?.messages) ? data.messages : [];

  return (
    <div className="app-page app-page--with-nav flex flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 flex min-h-[56px] items-center border-b border-slate-200 bg-white/95 px-2 dark:border-slate-700 dark:bg-slate-900/95">
        <button aria-label={t('qa_ui.history_back')} className="flex min-h-[44px] min-w-[44px] items-center justify-center" onClick={() => sessionId ? navigate('/history') : navigate('/discovery')}><ArrowLeft /></button>
        <h1 className="flex-1 text-center text-lg font-bold text-slate-900 dark:text-white">{sessionId ? t('qa_ui.history_detail') : t('qa_ui.history_title')}</h1>
        <span className="h-11 w-11" />
      </header>
      <main className="app-scroll-region flex-1 p-4">
        {state === 'loading' && <p className="py-16 text-center text-slate-500">{t('qa_ui.loading')}</p>}
        {state === 'error' && <div className="py-16 text-center"><p className="mb-4 text-slate-600">{t('qa_ui.history_error')}</p><button className="guaji-btn guaji-btn-secondary" onClick={load}><RefreshCw size={18} />{t('qa_ui.retry')}</button></div>}
        {state === 'ready' && !sessionId && conversations.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-slate-500 dark:bg-slate-900">{t('qa_ui.history_empty')}</p>}
        {state === 'ready' && !sessionId && conversations.map((item) => (
          <button key={item.sessionId} onClick={() => navigate(`/history/${encodeURIComponent(item.sessionId)}`)} className="mb-3 flex min-h-[64px] w-full items-center rounded-2xl bg-white p-4 text-left shadow-sm dark:bg-slate-900">
            <span className="min-w-0 flex-1"><strong className="block truncate text-slate-900 dark:text-white">{item.topic || item.summary || t('qa_ui.history_practice')}</strong><small className="text-slate-500">{formatDate(item.startTime, t)}</small></span><ChevronRight className="text-slate-400" />
          </button>
        ))}
        {state === 'ready' && sessionId && messages.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-slate-500 dark:bg-slate-900">{t('qa_ui.history_messages_empty')}</p>}
        {state === 'ready' && sessionId && messages.map((message, index) => (
          <article key={message._id || index} className={`mb-3 max-w-[85%] rounded-2xl p-3 ${message.role === 'user' ? 'ml-auto bg-primary text-white' : 'bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100'}`}><p className="whitespace-pre-wrap">{message.content}</p><small className="mt-1 block opacity-60">{formatDate(message.timestamp, t)}</small></article>
        ))}
      </main>
      <BottomNav currentPage="profile" />
    </div>
  );
}
