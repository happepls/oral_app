const { test, expect } = require('@playwright/test');

test('analytics privacy control stops SPA pageviews @critical', async ({ page }, testInfo) => {
  const events = [];
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('ui_language', 'zh');
    sessionStorage.setItem('hasSeenSplash', 'true');
  });
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/users/analytics/config', route => route.fulfill({ contentType: 'application/json', body: '{"enabled":true}' }));
  await page.route('**/api/users/analytics/pageview', route => {
    events.push(route.request().postDataJSON());
    return route.fulfill({ status: 204 });
  });
  await page.goto('/?private=never-send', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => events.length).toBe(1);
  expect(events[0].path).toBe('/');
  expect(JSON.stringify(events)).not.toContain('never-send');
  await page.getByRole('button', { name: '隐私政策', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: /允许匿名访问统计/ });
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('analytics-privacy.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto('/login');
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(events).toHaveLength(1);
});
