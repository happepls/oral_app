const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  outputDir: '../quality/artifacts/playwright-results',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: '../quality/artifacts/playwright-results.json' }], ['html', { outputFolder: '../quality/artifacts/playwright-report', open: 'never' }]],
  snapshotPathTemplate: '../quality/baselines/ui/{projectName}/{arg}{ext}',
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'light', reducedMotion: 'reduce', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: 'npm start', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: 'chromium-320', use: { browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 320, height: 568 } } },
    { name: 'chromium-375', use: { browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 375, height: 667 } } },
    { name: 'chromium-390', use: { browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 390, height: 844 } } },
    { name: 'chromium-tablet', use: { browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 768, height: 1024 } } },
    { name: 'chromium-desktop', use: { browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-320-dark-en', use: { browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 320, height: 568 }, colorScheme: 'dark', locale: 'en-US' } },
    { name: 'chromium-375-dark-en', use: { browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 375, height: 667 }, colorScheme: 'dark', locale: 'en-US' } },
    { name: 'chromium-390-dark-en', use: { browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'en-US' } },
    { name: 'chromium-tablet-dark-en', use: { browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 768, height: 1024 }, colorScheme: 'dark', locale: 'en-US' } },
    { name: 'chromium-desktop-dark-en', use: { browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 1440, height: 900 }, colorScheme: 'dark', locale: 'en-US' } },
    { name: 'webkit-mobile', use: { browserName: 'webkit', viewport: { width: 390, height: 844 } }, grep: /@critical/ },
  ],
});
