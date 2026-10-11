import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { aiAPI } from '../services/api';
import { MessageBubble } from './MessageBubble';

// Results belong to a message, its source text and the server profile language.
// Never write through an array index: question changes can reuse that position.
export default function TranslatableMessage({ message, content, nativeLanguage, ...bubbleProps }) {
  const { t } = useTranslation();
  const identity = message.responseId || message.id || message.turn_id || message;
  const current = useRef(null);
  current.current = { identity, content, nativeLanguage };
  const request = useRef(null);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setPending(false);
    setFailed(false);
    return () => { request.current?.abort(); request.current = null; };
  }, [identity, content, nativeLanguage]);

  const translation = result?.identity === identity && result?.content === content
    && result?.nativeLanguage === nativeLanguage ? result.translation
    : message.translation_language === nativeLanguage ? message.translation : undefined;
  const translate = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const key = current.current;
    const isCurrent = () => request.current === controller && !controller.signal.aborted
      && current.current.identity === key.identity && current.current.content === key.content
      && current.current.nativeLanguage === key.nativeLanguage;
    setPending(true);
    setFailed(false);
    try {
      const response = await aiAPI.translate(content, nativeLanguage, { signal: controller.signal });
      if (isCurrent()) setResult({ ...key, translation: response.translation });
    } catch (err) {
      if (isCurrent()) setFailed(true);
    } finally {
      if (isCurrent()) setPending(false);
    }
  };
  return <>
    <MessageBubble {...bubbleProps} message={content} translation={translation} />
    {bubbleProps.type === 'ai' && (message.audioUrl || message.audioPlayed === true) && !translation && (
      <div className="flex justify-start px-4 py-1">
        <button onClick={translate} disabled={pending || !nativeLanguage}
          aria-label={t('message_translate')}
          className="text-xs text-slate-600 hover:text-slate-800 flex items-center gap-1 transition disabled:opacity-50">
          <span aria-hidden="true">🌐</span> {pending ? t('qa_ui.loading') : failed ? t('message_translate_retry') : t('message_translate')}
        </button>
        {failed && <span role="alert" className="ml-2 text-xs text-red-700">{t('message_translate_failed')}</span>}
      </div>
    )}
  </>;
}
