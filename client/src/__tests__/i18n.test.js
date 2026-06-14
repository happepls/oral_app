/**
 * i18n Test Suite
 * Tests for internationalization configuration and language switching
 */

import i18n from '../i18n/index.js';
import { SUPPORTED_LANGS } from '../i18n/index.js';
import zh from '../i18n/locales/zh.json';
import en from '../i18n/locales/en.json';
import ja from '../i18n/locales/ja.json';
import es from '../i18n/locales/es.json';
import fr from '../i18n/locales/fr.json';
import ko from '../i18n/locales/ko.json';
import de from '../i18n/locales/de.json';
import pt from '../i18n/locales/pt.json';
import ru from '../i18n/locales/ru.json';

// All locale objects keyed by language code — the single source of truth for
// every consistency check below. Adding a language? Add it here (and to
// SUPPORTED_LANGS) and the consistency/non-empty tests cover it automatically.
const LOCALES = { zh, en, ja, es, fr, ko, de, pt, ru };

describe('i18n Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should export SUPPORTED_LANGS array with 9 languages', () => {
    expect(SUPPORTED_LANGS).toEqual(['zh', 'en', 'ja', 'es', 'fr', 'ko', 'de', 'pt', 'ru']);
    expect(SUPPORTED_LANGS).toHaveLength(9);
  });

  test('should initialize i18n with default language', () => {
    expect(i18n.language).toBeDefined();
    expect(SUPPORTED_LANGS.includes(i18n.language)).toBe(true);
  });

  test('should have translation resources loaded', () => {
    const resources = i18n.options.resources;
    expect(resources).toBeDefined();
    expect(Object.keys(resources)).toHaveLength(9);
  });

  test('should load all language files correctly', () => {
    // Check that each language has translations
    expect(zh).toBeDefined();
    expect(en).toBeDefined();
    expect(ja).toBeDefined();

    // Check that each language file is an object with translation keys
    expect(typeof zh).toBe('object');
    expect(typeof en).toBe('object');
    expect(typeof ja).toBe('object');

    // Verify sample translation keys exist
    expect(zh.nav_login).toBe('登录');
    expect(en.nav_login).toBe('Sign In');
    expect(ja.nav_login).toBe('ログイン');
  });

  test('should maintain consistency between all language files', () => {
    // ROOT-CAUSE GUARD: every supported locale must have EXACTLY the same key
    // set as en.json (the source of truth). Previously this only compared
    // zh vs en, which let 77 keys go missing in 7 other locales undetected
    // (fallbackLng:'en' masked the gap at runtime). Loop over all locales so
    // any future missing/extra key fails CI immediately.
    const enKeys = Object.keys(en).sort();
    SUPPORTED_LANGS.forEach((lang) => {
      const langKeys = Object.keys(LOCALES[lang]).sort();
      // Surface the actual diff in the failure message for fast debugging.
      const missing = enKeys.filter((k) => !langKeys.includes(k));
      const extra = langKeys.filter((k) => !enKeys.includes(k));
      expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] });
    });
  });

  test('should preserve {{limit}} interpolation in daily-limit keys across all locales', () => {
    // These billing-critical paywall strings use {{limit}} interpolation;
    // a translator dropping the placeholder would render a broken sentence.
    const interpolatedKeys = ['daily_limit_paywall_desc', 'daily_limit_reached_desc'];
    SUPPORTED_LANGS.forEach((lang) => {
      interpolatedKeys.forEach((key) => {
        expect(LOCALES[lang][key]).toBeDefined();
        expect(LOCALES[lang][key]).toContain('{{limit}}');
      });
    });
  });

  test('should handle language change', async () => {
    const originalLang = i18n.language;

    // Change language
    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');

    // Change back
    await i18n.changeLanguage(originalLang);
    expect(i18n.language).toBe(originalLang);
  });

  test('should use fallback language when translation is missing', async () => {
    await i18n.changeLanguage('en');
    expect([].concat(i18n.options.fallbackLng)).toContain('en');
  });

  test('should preserve translation values for critical keys', () => {
    const criticalKeys = [
      'nav_login',
      'login_title',
      'register_title',
      'email_label',
      'password_label',
      'onboarding_title',
    ];

    criticalKeys.forEach(key => {
      // Check that the key exists in Chinese
      expect(zh[key]).toBeDefined();
      expect(typeof zh[key]).toBe('string');
      expect(zh[key].length).toBeGreaterThan(0);

      // Check that the key exists in English
      expect(en[key]).toBeDefined();
      expect(typeof en[key]).toBe('string');
      expect(en[key].length).toBeGreaterThan(0);
    });
  });

  test('should interpolation work correctly', async () => {
    await i18n.changeLanguage('en');

    // Test that interpolation options are set
    const interpolationOptions = i18n.options.interpolation;
    expect(interpolationOptions.escapeValue).toBe(false);
  });
});

describe('i18n Language Detection', () => {
  beforeEach(() => {
    localStorage.getItem.mockClear();
    localStorage.getItem.mockReturnValue(null);
  });

  test('should detect language from localStorage if set', () => {
    localStorage.getItem.mockReturnValueOnce('ja');

    // Note: This test checks the behavior of getInitialLanguage function
    // Since we can't directly test the function, we verify i18n is initialized
    expect(i18n).toBeDefined();
    expect(i18n.language).toBeDefined();
  });

  test('should have all translation strings non-empty', () => {
    SUPPORTED_LANGS.forEach((lang) => {
      Object.entries(LOCALES[lang]).forEach(([key, value]) => {
        expect(value).toBeDefined();
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('i18n Modularization', () => {
  test('translation files should be separate JSON modules', () => {
    // Verify that each language file is a valid JSON object
    SUPPORTED_LANGS.forEach((lang) => {
      const obj = LOCALES[lang];
      expect(obj).toEqual(expect.any(Object));
      // Each file should contain at least 50 translation keys
      expect(Object.keys(obj).length).toBeGreaterThanOrEqual(50);
    });
  });

  test('should support dynamic language imports in the future', () => {
    // This test verifies the structure supports lazy loading
    const resources = i18n.options.resources;

    Object.entries(resources).forEach(([lang, config]) => {
      expect(config.translation).toBeDefined();
      expect(typeof config.translation).toBe('object');
    });
  });
});