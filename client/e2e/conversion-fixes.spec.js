const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    localStorage.clear(); localStorage.setItem('ui_language', 'zh');
    sessionStorage.setItem('hasSeenSplash', 'true');
  });
});

test('pricing fallback stays useful and recovers on retry @critical', async ({ page }, testInfo) => {
  let fail = true;
  await page.route('**/api/stripe/products-with-prices', route => route.fulfill({
    status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ data: [
      { id: 'weekly', metadata: { tier: 'weekly' }, prices: [{ id: 'pw', unit_amount: 499, currency: 'usd', recurring: { interval: 'week' } }] },
      { id: 'annual', metadata: { tier: 'annual' }, prices: [{ id: 'pa', unit_amount: 9900, currency: 'usd', recurring: { interval: 'year' } }] },
    ] }),
  }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const pricing = page.locator('#pricing');
  await pricing.scrollIntoViewIfNeeded();
  await expect(pricing.getByRole('button', { name: '即将开放' })).toHaveCount(2);
  await expect(pricing.getByRole('button', { name: '即将开放' }).first()).toBeDisabled();
  await expect(pricing).toContainText('4.99');
  await expect(pricing).not.toContainText('Live price unavailable');
  await page.screenshot({ path: testInfo.outputPath('pricing-fallback.png'), fullPage: true });
  fail = false;
  await pricing.getByRole('button', { name: '重新加载价格' }).click();
  await expect(pricing.getByRole('button', { name: '即将开放' })).toHaveCount(0);
  await expect(pricing).toContainText('61%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test('quick interview reaches evidence feedback and profile without a goal @critical', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('user', JSON.stringify({ id: 'quick-test', native_language: null })));
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: 'test-ticket', data: {} }) }));
  await page.routeWebSocket('**/api/v1/realtime?*', ws => {
    const answers = [];
    const snapshot = () => ws.send(JSON.stringify({ type: 'quick_state', payload: {
      answers, question: answers.length < 3 ? ['Please introduce yourself.', 'Describe a challenge.', 'Why this role?'][answers.length] : null,
      report: answers.length === 3 ? { strengths: 'You explained your motivation.', improvements: 'Give a concrete example.', example: 'I enjoy helping customers solve problems.' } : null,
    } }));
    snapshot();
    ws.onMessage(raw => { const message = JSON.parse(raw); if (message.type === 'quick_answer') { answers.push(message.payload.text); snapshot(); } });
  });
  await page.goto('/quick-experience', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '快速体验', exact: true }).click();
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('textbox').fill('I enjoy helping customers solve problems.');
    await page.getByRole('button', { name: '提交回答' }).click();
    await expect(page.getByRole('status')).toContainText(`${i + 1} / 3`);
  }
  await expect(page.getByText('You explained your motivation.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('quick-report.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(v => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  await page.getByRole('button', { name: '完善个人信息与目标' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});
