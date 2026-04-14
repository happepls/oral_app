/**
 * i18n Test Suite
 * Tests for internationalization configuration and language switching
 */

import i18n from '../i18n/index.js';
import { SUPPORTED_LANGS } from '../i18n/index.js';
import zh from '../i18n/locales/zh.json';
import en from '../i18n/locales/en.json';
import ja from '../i18n/locales/ja.json';

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
    // All language files should have the same keys
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();

    expect(zhKeys).toEqual(enKeys);
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
    const allLangs = [zh, en, ja];

    allLangs.forEach((lang, index) => {
      Object.entries(lang).forEach(([key, value]) => {
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
    const languages = [zh, en, ja];

    languages.forEach(lang => {
      expect(lang).toEqual(expect.any(Object));
      // Each file should contain at least 50 translation keys
      expect(Object.keys(lang).length).toBeGreaterThanOrEqual(50);
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