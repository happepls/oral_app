import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import zh from './locales/zh.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ko from './locales/ko.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';

// ──────────────────────────────────────────────
// Country code → UI language mapping
// ──────────────────────────────────────────────
const COUNTRY_LANG_MAP = {
  CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh',
  JP: 'ja',
  KR: 'ko',
  DE: 'de', AT: 'de', LI: 'de',
  FR: 'fr', BE: 'fr', MC: 'fr', LU: 'fr',
  BR: 'pt', PT: 'pt', MZ: 'pt', AO: 'pt', CV: 'pt', GW: 'pt', ST: 'pt', TL: 'pt',
  RU: 'ru', KZ: 'ru', BY: 'ru',
  ES: 'es', MX: 'es', CO: 'es', AR: 'es', CL: 'es', PE: 'es',
  VE: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es',
  HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', GQ: 'es',
};

const SUPPORTED_LANGS = ['zh', 'en', 'ja', 'es', 'fr', 'ko', 'de', 'pt', 'ru'];

// Synchronous: pick best language before first render
function getInitialLanguage() {
  const cached = localStorage.getItem('ui_language');
  if (cached && SUPPORTED_LANGS.includes(cached)) return cached;

  const browserLang = navigator.language?.split('-')[0]?.toLowerCase();
  if (SUPPORTED_LANGS.includes(browserLang)) return browserLang;

  return 'zh';
}

// ──────────────────────────────────────────────
// Translations - Load from separate JSON files
// ──────────────────────────────────────────────
const resources = {
  zh: { translation: zh },
  en: { translation: en },
  ja: { translation: ja },
  es: { translation: es },
  fr: { translation: fr },
  ko: { translation: ko },
  de: { translation: de },
  pt: { translation: pt },
  ru: { translation: ru },
};

// ──────────────────────────────────────────────
// Initialize i18next
// ──────────────────────────────────────────────
i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// ──────────────────────────────────────────────
// Cache the detected language on first visit
// Uses navigator.language (browser/OS locale) which already reflects
// the user's region preference — privacy-safe, no external requests.
// ──────────────────────────────────────────────
if (!localStorage.getItem('ui_language')) {
  const detected = getInitialLanguage();
  localStorage.setItem('ui_language', detected);
}

export { SUPPORTED_LANGS };
export default i18n;