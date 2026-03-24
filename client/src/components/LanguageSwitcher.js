import React from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '../i18n';

const LANGUAGES = [
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
];

/**
 * LanguageSwitcher — compact select for switching the UI language.
 *
 * Props:
 *   className  — extra CSS classes for the <select> element
 *   variant    — 'light' (default) | 'dark'  controls text color
 */
export default function LanguageSwitcher({ className = '', variant = 'light' }) {
  const { i18n } = useTranslation();

  const handleChange = (e) => {
    const lang = e.target.value;
    i18n.changeLanguage(lang);
    localStorage.setItem('ui_language', lang);
  };

  // Normalize language code: "zh-CN" → "zh", fallback to 'zh' if unsupported
  const currentLang = i18n.language?.split('-')[0] || 'zh';
  const matched = SUPPORTED_LANGS.includes(currentLang) ? currentLang : 'zh';

  const colorClass = variant === 'dark'
    ? 'text-slate-300 border-slate-600 bg-slate-800 hover:border-slate-500'
    : 'text-slate-600 border-slate-300 bg-white hover:border-indigo-400 dark:text-slate-300 dark:border-slate-600 dark:bg-slate-800';

  return (
    <select
      value={matched}
      onChange={handleChange}
      className={`appearance-none rounded-lg border px-3 py-1.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition ${colorClass} ${className}`}
      title="Switch language / 切换语言"
    >
      {LANGUAGES.map(l => (
        <option key={l.code} value={l.code}>
          {l.flag} {l.label}
        </option>
      ))}
    </select>
  );
}
