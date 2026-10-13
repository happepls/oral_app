const { defineConfig } = require('@playwright/test');
const base = require('./playwright.config');

module.exports = defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ['**/seo-production.spec.js', '**/pre-react-fallback.spec.js'],
  outputDir: '../quality/artifacts/seo-playwright-results',
  reporter: [['list'], ['json', { outputFile: '../quality/artifacts/seo-playwright-results.json' }]],
  projects: base.projects.filter(project => ['chromium-320', 'chromium-desktop', 'chromium-320-dark-en'].includes(project.name)),
  use: { ...base.use, baseURL: process.env.SEO_BASE_URL || 'http://localhost:4173' },
  webServer: process.env.SEO_BASE_URL ? undefined : {
    command: 'node scripts/seo-preview.cjs',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
