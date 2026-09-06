import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import CountryCodeSelect, { COUNTRIES, DEFAULT_COUNTRY } from './CountryCodeSelect';

// Preserve significant leading zeroes (e.g. Italy). A pasted international
// number is accepted only when it matches the selected calling code.
export function buildPhoneNumber(country, input) {
  const dial = (COUNTRIES.find(c => c.iso2 === country) || DEFAULT_COUNTRY).dial;
  const compact = input.trim().replace(/[\s()-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  let local = compact;
  if (compact.startsWith('+')) {
    if (!compact.startsWith(dial)) return null;
    local = compact.slice(dial.length);
  } else if (country !== 'IT') {
    local = compact.replace(/^0+/, '');
  }
  const phone = dial + local;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return null;
  if (country === 'CN' && !/^1[3-9]\d{9}$/.test(local)) return null;
  return phone;
}

export default function PhoneAuthForm({ idPrefix, onSuccess, registration = false }) {
  const { t } = useTranslation();
  const { loginWithPhone, loading } = useAuth();
  const [country, setCountry] = useState(DEFAULT_COUNTRY.iso2);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const requestRef = useRef(null);
  const submitRef = useRef(false);
  const mountedRef = useRef(true);
  const deadlinesRef = useRef(new Map());
  const number = buildPhoneNumber(country, phone);
  const busy = loading || submitting;
  const fieldClass = 'min-w-0 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 transition';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const tick = () => setCooldown(Math.max(0, Math.ceil(((deadlinesRef.current.get(number) || 0) - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [number]);

  const changeNumber = (setter, value) => {
    requestRef.current?.abort();
    requestRef.current = null;
    setSending(false);
    setCode('');
    setSent(false);
    setError('');
    setter(value);
  };

  const sendCode = async () => {
    if (requestRef.current || busy || cooldown > 0) return;
    setError('');
    if (!number) { setError(t('phone_invalid')); return; }
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setSending(true);
    // Retain the cooldown if the user edits a number while delivery is pending.
    deadlinesRef.current.set(number, Date.now() + 60000);
    try {
      const response = await authAPI.sendPhoneCode(number, { signal: controller.signal });
      if (!mountedRef.current || requestRef.current !== controller) return;
      if (!response?.success) throw new Error(t('phone_send_fail'));
      setSent(true);
      deadlinesRef.current.set(number, Date.now() + 60000);
      setCooldown(60);
    } catch (err) {
      if (!mountedRef.current || requestRef.current !== controller) return;
      const seconds = Number.isFinite(err.retryAfter) && err.retryAfter > 0 ? err.retryAfter : 60;
      deadlinesRef.current.set(number, Date.now() + seconds * 1000);
      setCooldown(seconds);
      setError(t(err.status === 429 ? 'phone_rate_limited' : 'phone_send_fail'));
    } finally {
      clearTimeout(timeout);
      if (mountedRef.current && requestRef.current === controller) {
        requestRef.current = null;
        setSending(false);
      }
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitRef.current || busy || sending) return;
    setError('');
    if (!number) { setError(t('phone_invalid')); return; }
    if (!/^\d{6}$/.test(code.trim())) { setError(t('phone_code_invalid')); return; }
    submitRef.current = true;
    setSubmitting(true);
    try {
      const result = await loginWithPhone(number, code.trim());
      if (!mountedRef.current) return;
      if (result.success) onSuccess(result.user);
      else setError(t(result.status === 429 ? 'phone_rate_limited' : 'phone_login_fail'));
    } catch {
      if (mountedRef.current) setError(t('phone_login_fail'));
    } finally {
      submitRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <form id={`${idPrefix}-panel-phone`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-phone`} onSubmit={submit} className="space-y-4">
      {registration && <p className="text-sm text-slate-600 dark:text-slate-300">{t('phone_register_hint')}</p>}
      {error && <div id={`${idPrefix}-phone-error`} role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      <div>
        <label htmlFor={`${idPrefix}-phone`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('phone_label')}</label>
        <div className="flex">
          <CountryCodeSelect value={country} onChange={value => changeNumber(setCountry, value)} disabled={busy} t={t} />
          <input id={`${idPrefix}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel-national"
            value={phone} onChange={e => changeNumber(setPhone, e.target.value)} required disabled={busy} maxLength={32}
            aria-describedby={`${idPrefix}-phone-hint`} className={`${fieldClass} !rounded-l-none`} placeholder={t('phone_local_placeholder')} />
        </div>
        <p id={`${idPrefix}-phone-hint`} className="mt-1 text-xs text-slate-600 dark:text-slate-300">{t('phone_hint')}</p>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-sms-code`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('phone_code_label')}</label>
        <div className="flex flex-wrap gap-2">
          <input id={`${idPrefix}-sms-code`} name="smsCode" type="text" inputMode="numeric" autoComplete="one-time-code"
            value={code} onChange={e => setCode(e.target.value)} required disabled={busy} maxLength={6} pattern="[0-9]{6}"
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${idPrefix}-phone-error` : undefined}
            className={`${fieldClass} flex-1 basis-28`} placeholder={t('phone_code_placeholder')} />
          <button type="button" onClick={sendCode} disabled={sending || busy || cooldown > 0}
            className="min-h-12 px-3 rounded-xl text-sm font-medium border border-primary text-primary-dark dark:text-primary-light disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition">
            {sending ? t('phone_sending') : cooldown > 0 ? t('phone_retry_in', { seconds: cooldown }) : t(sent ? 'phone_resend' : 'phone_send_code')}
          </button>
        </div>
        {sent && <p role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-300">{t('phone_code_sent')}</p>}
      </div>
      <button type="submit" disabled={busy || sending}
        className="w-full min-h-12 py-3 px-5 rounded-xl bg-primary-dark text-white font-bold shadow-brand disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        {busy ? t('register_loading') : t(registration ? 'phone_register_submit' : 'phone_login_submit')}
      </button>
    </form>
  );
}
