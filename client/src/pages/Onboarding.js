import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronRight } from 'lucide-react';

// ── 母语选项 ──
const NATIVE_LANGUAGES = [
  { value: 'Chinese',    label: '中文',     flag: '🇨🇳' },
  { value: 'English',    label: 'English',   flag: '🇺🇸' },
  { value: 'Japanese',   label: '日本語',    flag: '🇯🇵' },
  { value: 'Korean',     label: '한국어',    flag: '🇰🇷' },
  { value: 'French',     label: 'Français',  flag: '🇫🇷' },
  { value: 'Spanish',    label: 'Español',   flag: '🇪🇸' },
  { value: 'German',     label: 'Deutsch',   flag: '🇩🇪' },
  { value: 'Portuguese', label: 'Português', flag: '🇧🇷' },
  { value: 'Russian',    label: 'Русский',   flag: '🇷🇺' },
];

const GENDER_OPTIONS = [
  { value: 'male',   label: '男 ♂' },
  { value: 'female', label: '女 ♀' },
  { value: 'other',  label: '其他' },
];

// ── 步骤配置 ──
const STEPS = ['基础信息'];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const { t } = useTranslation();

  // Step 0: 基础信息
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [nativeLanguage, setNativeLanguage] = useState(user?.native_language || 'Chinese');
  const [error, setError] = useState('');

  // 流程
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── 提交整体数据 ──
  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const genderMap = { '': null, male: 1, female: 0, other: 2 };
      const result = await updateProfile({
        nickname,
        gender: genderMap[gender] !== undefined ? genderMap[gender] : null,
        native_language: nativeLanguage,
      });
      if (result.success) {
        navigate('/goal-setting');
      } else {
        setError(result.message || t('err_onboarding_default'));
      }
    } catch (err) {
      setError(err.message || t('err_onboarding_default'));
    } finally {
      setSaving(false);
    }
  };

  // ── 进度条 ──
  const progressPct = 100;

  // ── 渲染 ──
  const variants = {
    enter:  { x: 40, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit:   { x: -40, opacity: 0 },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 flex flex-col items-center px-4 py-8">

      {/* Top bar */}
      <div className="w-full max-w-lg flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl" style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }} />
          <span className="font-bold text-slate-800 dark:text-white text-lg">Oral AI</span>
        </div>
        <LanguageSwitcher />
      </div>

      {/* 进度指示 */}
      <div className="w-full max-w-lg mb-6">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                i < step ? 'text-white' : i === step ? 'text-white' : 'text-slate-400 bg-slate-100 dark:bg-slate-700'
              }`} style={i <= step ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`hidden sm:block ${i === step ? 'text-primary font-semibold' : 'text-slate-400'}`}>{s}</span>
            </div>
          ))}
        </div>
        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #637FF1, #a47af6)' }}
            animate={{ width: `${progressPct}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
        </div>
      </div>

      {/* 内容卡片 */}
      <div className="w-full max-w-lg overflow-hidden">
        <AnimatePresence mode="wait">

          {/* ── Step 0: 基础信息 ── */}
          {step === 0 && (
            <motion.div key="step0" variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: 'easeOut' }}>

              <div className="text-center mb-6">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-5xl mb-3">🦜</motion.div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{t('onboarding_title')}</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{t('onboarding_subtitle')}</p>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-brand border border-slate-100 dark:border-slate-700 space-y-5">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
                )}

                {/* 昵称 */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    {t('nickname_label')}
                  </label>
                  <input type="text" value={nickname} onChange={e => setNickname(e.target.value)}
                    required placeholder={t('nickname_label')}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" />
                </div>

                {/* 性别 */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    {t('gender_label')}
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setGender('')}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                        gender === '' ? 'border-primary text-primary bg-primary/5' : 'border-slate-200 text-slate-500'}`}>
                      {t('gender_placeholder')}
                    </button>
                    {GENDER_OPTIONS.map(({ value, label }) => (
                      <button key={value} type="button" onClick={() => setGender(value)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                          gender === value ? 'text-white border-transparent' : 'border-slate-200 text-slate-600'}`}
                        style={gender === value ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 母语 */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    {t('native_language_label')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {NATIVE_LANGUAGES.map(({ value, label, flag }) => {
                      const sel = nativeLanguage === value;
                      return (
                        <motion.button key={value} type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          onClick={() => setNativeLanguage(value)}
                          className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition text-sm font-medium ${
                            sel ? 'border-transparent text-white shadow-brand' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}
                          style={sel ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}>
                          <span className="text-2xl">{flag}</span>
                          <span className="text-xs leading-tight text-center">{label}</span>
                          {sel && <Check className="w-3 h-3" />}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  type="button" disabled={!nickname.trim() || saving}
                  onClick={() => { if (nickname.trim()) handleSubmit(); }}
                  className="w-full py-3.5 flex items-center justify-center gap-2 rounded-xl text-white font-bold text-base shadow-brand disabled:opacity-40 disabled:cursor-not-allowed transition"
                  style={{ background: saving ? '#94A3B8' : 'linear-gradient(135deg, #637FF1, #a47af6)' }}>
                  {saving ? (
                    <><div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />保存中…</>
                  ) : (
                    <>开始设置学习目标 <ChevronRight className="w-5 h-5" /></>
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}


        </AnimatePresence>
      </div>
    </div>
  );
}
