import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';

function Onboarding() {
  const navigate = useNavigate();
  const { user, loading, updateProfile } = useAuth();
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [nativeLanguage, setNativeLanguage] = useState(user?.native_language || 'Chinese');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Convert gender string to integer for database
      const genderMap = {
        '': null,
        'male': 1,
        'female': 0,
        'other': 2
      };

      const result = await updateProfile({
        nickname,
        gender: genderMap[gender] !== undefined ? genderMap[gender] : null,
        native_language: nativeLanguage
      });

      if (result.success) {
        setSuccess(t('onboarding_success'));
        setTimeout(() => navigate('/goal-setting'), 1000);
      } else {
        setError(result.message || t('err_onboarding_default'));
      }
    } catch (err) {
      console.error(err);
      setError(err.message || t('err_onboarding_default'));
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      <div className="flex w-full max-w-md flex-col items-center justify-center flex-grow">
        <div className="w-full px-4">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>

          <h1 className="text-slate-900 dark:text-white text-3xl font-bold mb-2">{t('onboarding_title')}</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-8">{t('onboarding_subtitle')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-500/10 border border-green-500/50 text-green-500 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            <div>
              <label htmlFor="nickname" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('nickname_label')}
              </label>
              <input
                type="text"
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('gender_label')}
              </label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
              >
                <option value="">{t('gender_placeholder')}</option>
                <option value="male">{t('gender_male')}</option>
                <option value="female">{t('gender_female')}</option>
                <option value="other">{t('gender_other')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="nativeLanguage" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('native_language_label')}
              </label>
              <select
                id="nativeLanguage"
                value={nativeLanguage}
                onChange={(e) => setNativeLanguage(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
              >
                <option value="Chinese">中文</option>
                <option value="English">English</option>
                <option value="Japanese">日本語</option>
                <option value="French">Français</option>
                <option value="Spanish">Español</option>
                <option value="Korean">한국어</option>
                <option value="German">Deutsch</option>
                <option value="Portuguese">Português</option>
                <option value="Russian">Русский</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? t('onboarding_loading') : t('onboarding_submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
