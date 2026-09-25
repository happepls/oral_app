import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function ExpressionFeedback({ feedback, disabled = false, onSend }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const alternatives = Array.isArray(feedback?.alternatives)
    ? feedback.alternatives.filter(item => typeof item === 'string' && item.trim()) : [];
  if (!feedback || alternatives.length < 2 || !onSend) return null;
  const errors = Array.isArray(feedback.errors) ? feedback.errors : [];
  const unavailable = disabled || sent;
  const send = value => {
    if (unavailable || !value.trim()) return;
    setText(value);
    const accepted = onSend(value.trim(), feedback);
    setSent(accepted !== false);
    setFailed(accepted === false);
  };
  return (
    <aside aria-label={t('expression_feedback_title')} className="mx-4 my-3 p-4 rounded-2xl border border-border bg-card text-foreground text-sm break-words">
      <p className="font-semibold">{t(`expression_feedback_${feedback.off_topic ? 'off_topic' : feedback.teaching_mode}`)}</p>
      {errors.map((error, index) => (
        <div key={index} className="mt-2">
          <p><span className="line-through text-muted-foreground">{error.original}</span>{' → '}<span className="font-medium">{error.corrected}</span></p>
          <p className="mt-1 text-muted-foreground">{error.explanation_l1}</p>
        </div>
      ))}
      <p className="mt-3 text-muted-foreground">{t('expression_feedback_choose')}</p>
      <div className="flex flex-col gap-2 mt-2">
        {alternatives.map(item => (
          <button key={item} type="button" disabled={unavailable} onClick={() => send(item)}
            className="min-h-11 px-3 py-2 rounded-xl border border-primary/30 text-primary text-left whitespace-normal break-words hover:bg-primary/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {item}
          </button>
        ))}
      </div>
      <form className="mt-3" onSubmit={event => { event.preventDefault(); send(text); }}>
        <label className="block text-muted-foreground">
          {t('expression_feedback_edit')}
          <textarea rows={2} maxLength={1000} value={text} disabled={unavailable}
            onChange={event => setText(event.target.value)}
            className="block w-full mt-1 p-2 rounded-lg border border-border bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </label>
        <button type="submit" disabled={unavailable || !text.trim()}
          className="mt-2 min-h-11 px-3 rounded-lg bg-primary text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          {t(sent ? 'expression_feedback_sent' : 'expression_feedback_send')}
        </button>
        {failed && <p role="status" className="mt-2">{t('expression_feedback_retry')}</p>}
        {disabled && !sent && <p className="mt-2 text-muted-foreground">{t('expression_feedback_disabled')}</p>}
      </form>
    </aside>
  );
}
