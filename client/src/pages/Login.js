import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import LanguageSwitcher from '../components/LanguageSwitcher';
import CountryCodeSelect, { COUNTRIES, DEFAULT_COUNTRY } from '../components/CountryCodeSelect';
import { motion } from 'motion/react';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';

function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedReturn = searchParams.get('return_to') || '';
  const loginDestination = requestedReturn.startsWith('/') && !requestedReturn.startsWith('//')
    ? requestedReturn
    : '/discovery';
  const { login, loginWithGoogle, loginWithPhone, loading } = useAuth();
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState('email'); // 'email' | 'phone'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // 手机登录状态
  // 分离式：country 存 iso2（区号由 COUNTRIES 查得），phone 只存本国号码数字。
  // 提交时拼接成 E.164：dialCode + localNumber。
  const [country, setCountry] = useState(DEFAULT_COUNTRY.iso2);
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const googleContainerRef = useRef(null);
  const emailSubmitRef = useRef(null);
  const [googleButtonWidth, setGoogleButtonWidth] = useState(360);

  useEffect(() => {
    const container = googleContainerRef.current;
    if (!container) return undefined;

    const updateWidth = () => {
      // Google adds roughly 20px around the configured button width.
      setGoogleButtonWidth(Math.max(200, Math.min(360, Math.floor(container.clientWidth - 20))));
    };
    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const googleLocale = {
    de: 'de',
    en: 'en',
    es: 'es',
    fr: 'fr',
    ja: 'ja',
    ko: 'ko',
    pt: 'pt_BR',
    ru: 'ru',
    zh: 'zh_CN',
  }[i18n.language?.split('-')[0]] || 'zh_CN';

  const handleGoogleSuccess = async (credentialResponse) => {
    const result = await loginWithGoogle(credentialResponse.credential);
    if (result.success) {
      navigate(loginDestination);
    } else {
      setError(result.message || t('login_google_fail'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const result = await login({ email, password });
    if (result.success) {
      navigate(loginDestination);
    } else if (result.code === 'invalid_credentials') {
      setError(t('login_invalid_credentials'));
    } else {
      setError(result.message || t('login_fail'));
    }
  };

  const startCooldown = () => {
    setCooldown(60);
    const timer = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(timer); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  // 拼接 E.164：区号 + 本国号码（去掉用户可能误输的前导 0 和非数字字符）。
  const buildE164 = () => {
    const dial = (COUNTRIES.find((c) => c.iso2 === country) || DEFAULT_COUNTRY).dial;
    const local = phone.replace(/\D/g, '').replace(/^0+/, '');
    return dial + local;
  };

  const handleSendCode = async () => {
    setError('');
    const full = buildE164();
    if (!/^\+[1-9]\d{1,14}$/.test(full)) {
      setError(t('phone_invalid'));
      return;
    }
    setSending(true);
    try {
      const res = await authAPI.sendPhoneCode(full);
      if (res && res.success) {
        setCodeSent(true);
        startCooldown();
      } else {
        setError((res && res.message) || t('phone_send_fail'));
      }
    } catch {
      setError(t('phone_send_fail'));
    } finally {
      setSending(false);
    }
  };

  const handlePhoneLogin = async (e) => {
    e.preventDefault();
    setError('');
    const result = await loginWithPhone(buildE164(), smsCode.trim());
    if (result.success) {
      navigate(loginDestination);
    } else {
      setError(result.message || t('phone_login_fail'));
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      {/* Logo top */}
      <div className="w-full max-w-md flex justify-center pt-4 pb-3 sm:pt-10 sm:pb-6">
        <img src="/guaji-logo.svg" alt="GuaJi" className="h-16 w-16" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-8 shadow-brand border border-slate-100 dark:border-slate-700">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <button
              type="button"
              onClick={() => navigate('/welcome')}
              className="flex min-h-11 items-center gap-1.5 text-slate-500 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">{t('back')}</span>
            </button>
            <LanguageSwitcher />
          </div>

          <h1 className="text-slate-900 dark:text-white text-2xl font-bold mb-1">{t('login_title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 sm:mb-6">{t('login_subtitle')}</p>

          {/* 登录方式切换：邮箱 / 手机号 */}
          <div className="flex gap-2 mb-4 p-1 bg-slate-100 dark:bg-slate-700 rounded-xl" role="tablist" aria-label={t('login_method_label')}>
            <button
              id="login-tab-email"
              type="button"
              role="tab"
              aria-selected={mode === 'email'}
              aria-controls="login-panel-email"
              onClick={() => { setMode('email'); setError(''); }}
              className={`flex-1 min-h-11 py-2 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition ${mode === 'email' ? 'bg-white dark:bg-slate-800 text-primary-dark dark:text-primary-light shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
            >
              {t('login_tab_email')}
            </button>
            <button
              id="login-tab-phone"
              type="button"
              role="tab"
              aria-selected={mode === 'phone'}
              aria-controls="login-panel-phone"
              onClick={() => { setMode('phone'); setError(''); }}
              className={`flex-1 min-h-11 py-2 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition ${mode === 'phone' ? 'bg-white dark:bg-slate-800 text-primary-dark dark:text-primary-light shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}
            >
              {t('login_tab_phone')}
            </button>
          </div>

          {error && (
            <div id="login-error" role="alert" aria-live="assertive" className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {mode === 'email' ? (
            <form id="login-panel-email" role="tabpanel" aria-labelledby="login-tab-email" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('email_label')}
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'login-error' : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 transition"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('password_label')}
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    onFocus={() => {
                      // With a software keyboard open, keep the primary action in
                      // the visual viewport instead of leaving it below the fold.
                      window.requestAnimationFrame(() => emailSubmitRef.current?.scrollIntoView({ block: 'nearest' }));
                    }}
                    className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 transition"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('password_hide') : t('password_show')}
                    className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div className="mt-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => navigate('/forgot-password')}
                    className="min-h-11 px-1 text-xs text-primary-dark dark:text-primary-light hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                  >
                    {t('login_forgot_password')}
                  </button>
                </div>
              </div>

              <motion.button
                ref={emailSubmitRef}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center rounded-xl h-12 px-5 text-white text-base font-bold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-brand"
                style={{ background: loading ? '#94A3B8' : 'linear-gradient(135deg, #637FF1, #a47af6)' }}
              >
                {loading ? t('login_loading') : t('login_submit')}
              </motion.button>
            </form>
          ) : (
            <form id="login-panel-phone" role="tabpanel" aria-labelledby="login-tab-phone" onSubmit={handlePhoneLogin} className="space-y-4">
              <div>
                <label htmlFor="login-phone" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('phone_label')}
                </label>
                <div className="flex">
                  <CountryCodeSelect
                    value={country}
                    onChange={setCountry}
                    disabled={loading}
                    t={t}
                  />
                  <input
                    id="login-phone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : 'phone-hint'}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    disabled={loading}
                    className="flex-1 min-w-0 px-4 py-3 rounded-r-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 transition"
                    placeholder={t('phone_local_placeholder')}
                  />
                </div>
                <p id="phone-hint" className="mt-1 text-xs text-slate-600 dark:text-slate-300">{t('phone_hint')}</p>
              </div>

              <div>
                <label htmlFor="login-sms-code" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('phone_code_label')}
                </label>
                <div className="flex gap-2">
                  <input
                    id="login-sms-code"
                    name="smsCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                    required
                    disabled={loading}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 transition"
                    placeholder={t('phone_code_placeholder')}
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={sending || cooldown > 0}
                    className="shrink-0 px-4 rounded-xl text-sm font-medium border border-primary text-primary disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {cooldown > 0 ? `${cooldown}s` : sending ? t('phone_sending') : (codeSent ? t('phone_resend') : t('phone_send_code'))}
                  </button>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center rounded-xl h-12 px-5 text-white text-base font-bold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-brand"
                style={{ background: loading ? '#94A3B8' : 'linear-gradient(135deg, #637FF1, #a47af6)' }}
              >
                {loading ? t('login_loading') : t('phone_login_submit')}
              </motion.button>
            </form>
          )}

          <div className="mt-6">
            <div className="flex items-center gap-3 mb-4">
              <hr className="flex-1 border-slate-200 dark:border-slate-700" />
              <span className="text-xs text-slate-600 dark:text-slate-300">{t('or_divider')}</span>
              <hr className="flex-1 border-slate-200 dark:border-slate-700" />
            </div>
            <div ref={googleContainerRef} className="flex w-full justify-center overflow-hidden">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError(t('login_google_fail'))}
                useOneTap={false}
                text="signin_with"
                shape="rectangular"
                logo_alignment="left"
                locale={googleLocale}
                width={String(googleButtonWidth)}
              />
            </div>
          </div>

          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-6">
            {t('login_no_account')}{' '}
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="min-h-11 px-1 text-primary-dark dark:text-primary-light font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
            >
              {t('login_register_link')}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default Login;
