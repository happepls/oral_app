import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { authAPI } from '../services/api';
import LanguageSwitcher from '../components/LanguageSwitcher';

function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError(t('reset_no_token'));
      return;
    }
    if (password.length < 6) {
      setError(t('reset_too_short'));
      return;
    }
    if (password !== confirm) {
      setError(t('reset_mismatch'));
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.resetPassword(token, password);
      if (res && res.success) {
        setDone(true);
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError((res && res.message) || t('reset_failed'));
      }
    } catch (err) {
      setError(t('reset_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      <div className="w-full max-w-md flex justify-center pt-10 pb-6">
        <div className="w-12 h-12 rounded-2xl" style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-brand border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-end mb-6">
            <LanguageSwitcher />
          </div>

          <h1 className="text-slate-900 dark:text-white text-2xl font-bold mb-1">{t('reset_title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{t('reset_subtitle')}</p>

          {done ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm">
              {t('reset_success')}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('reset_new_password')}
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
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('reset_confirm_password')}
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                {loading ? t('reset_submitting') : t('reset_submit')}
              </motion.button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default ResetPassword;
