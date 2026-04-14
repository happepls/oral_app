import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';

function Register() {
  const navigate = useNavigate();
  const { register, loading } = useAuth();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError(t('err_password_mismatch'));
      return;
    }
    if (formData.password.length < 8) {
      setError(t('err_password_min'));
      return;
    }
    if (!/[a-z]/.test(formData.password)) {
      setError(t('err_password_lower'));
      return;
    }
    if (!/[A-Z]/.test(formData.password)) {
      setError(t('err_password_upper'));
      return;
    }
    if (!/[0-9]/.test(formData.password)) {
      setError(t('err_password_digit'));
      return;
    }

    const result = await register({
      username: formData.name,
      email: formData.email,
      password: formData.password
    });

    if (result.success) {
      navigate('/discovery');
    } else {
      setError(result.message || t('err_register_default'));
    }
  };

  const inputClass = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 transition";

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      {/* Logo */}
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
          {/* Header */}
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

          <h1 className="text-slate-900 dark:text-white text-2xl font-bold mb-1">{t('register_title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{t('register_subtitle')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('username_label')}
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                disabled={loading}
                className={inputClass}
                placeholder={t('username_placeholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('email_label')}
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={loading}
                className={inputClass}
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('password_label')}
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
                minLength={8}
                className={inputClass}
                placeholder={t('password_placeholder')}
              />
              <p className="text-xs text-slate-400 mt-1">{t('password_hint')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('confirm_password_label')}
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={loading}
                minLength={8}
                className={inputClass}
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
              {loading ? t('register_loading') : t('register_submit')}
            </motion.button>
          </form>

          <p className="text-center text-slate-500 text-sm mt-6">
            {t('register_has_account')}{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-primary font-semibold hover:underline"
            >
              {t('register_login_link')}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default Register;
