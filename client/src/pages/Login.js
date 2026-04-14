import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';

function Login() {
  const navigate = useNavigate();
  const { login, loginWithGoogle, loading } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleGoogleSuccess = async (credentialResponse) => {
    const result = await loginWithGoogle(credentialResponse.credential);
    if (result.success) {
      navigate('/discovery');
    } else {
      setError(result.message || t('login_google_fail'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const result = await login({ email, password });
    if (result.success) {
      navigate('/discovery');
    } else {
      setError(result.message || t('login_fail'));
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      {/* Logo top */}
      <div className="w-full max-w-md flex justify-center pt-10 pb-6">
        <div
          className="w-12 h-12 rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-brand border border-slate-100 dark:border-slate-700">
          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-slate-500 hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">{t('back')}</span>
            </button>
            <LanguageSwitcher />
          </div>

          <h1 className="text-slate-900 dark:text-white text-2xl font-bold mb-1">{t('login_title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{t('login_subtitle')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('email_label')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 transition"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('password_label')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 transition"
                placeholder="••••••••"
              />
            </div>

            <motion.button
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

          <div className="mt-6">
            <div className="flex items-center gap-3 mb-4">
              <hr className="flex-1 border-slate-200 dark:border-slate-700" />
              <span className="text-xs text-slate-400">{t('or_divider')}</span>
              <hr className="flex-1 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError(t('login_google_fail'))}
                useOneTap={false}
                width="360"
              />
            </div>
          </div>

          <p className="text-center text-slate-500 dark:text-slate-400 text-sm mt-6">
            {t('login_no_account')}{' '}
            <button
              onClick={() => navigate('/register')}
              className="text-primary font-semibold hover:underline"
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
