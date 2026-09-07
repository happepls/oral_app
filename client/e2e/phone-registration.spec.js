const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }) => {
  // Registration does not depend on Google/Tawk. Keep third-party script
  // availability out of this test's page-load lifecycle (notably WebKit).
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    localStorage.clear(); localStorage.setItem('ui_language', 'zh');
    sessionStorage.setItem('hasSeenSplash', 'true');
  });
  await page.route('**/api/**', route => {
    const url = route.request().url();
    const user = { id: '00000000-0000-4000-8000-000000000001', username: 'phone_learner', native_language: null, phone: '+8613800138000' };
    let body = { success: true, data: {} };
    if (url.includes('/phone/send-code')) body = { success: true, retryAfter: 60 };
    else if (url.includes('/phone/login') || url.includes('/users/profile')) body = { success: true, data: { user } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
});

test('phone registration sends a code and reaches quick experience @critical', async ({ page }, testInfo) => {
  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '手机号注册' }).click();
  await expect(page.getByRole('tabpanel')).toBeVisible();
  await expect(page.locator('input[type=email]')).toHaveCount(0);
  await page.getByLabel('手机号', { exact: true }).fill('13800138000');
  const send = page.waitForRequest('**/api/users/phone/send-code');
  await page.getByRole('button', { name: '获取验证码', exact: true }).click();
  expect((await send).postDataJSON()).toEqual({ phone: '+8613800138000' });
  await expect(page.getByRole('status')).toContainText('验证码已发送');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('phone-register.png'), fullPage: true, animations: 'disabled' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(v => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  await page.getByLabel('短信验证码', { exact: true }).fill('123456');
  const login = page.waitForRequest('**/api/users/phone/login');
  await page.getByRole('button', { name: '注册并登录', exact: true }).click();
  expect((await login).postDataJSON()).toEqual({ phone: '+8613800138000', code: '123456' });
  await expect(page).toHaveURL(/\/quick-experience$/);
  await expect(page.getByRole('button', { name: '快速体验', exact: true })).toBeVisible();
});

test('phone registration reports wrong codes and supports country selection @critical', async ({ page }, testInfo) => {
  await page.route('**/api/users/phone/login', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Invalid code' }) }));
  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '手机号注册' }).click();
  await page.getByRole('button', { name: /搜索国家/ }).click();
  await page.getByRole('textbox', { name: /搜索国家/ }).fill('Japan');
  await page.getByRole('option', { name: /81/ }).click();
  await page.getByLabel('手机号', { exact: true }).fill('09012345678');
  await page.getByLabel('短信验证码', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '注册并登录', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('登录失败');
  await expect(page).toHaveURL(/\/register$/);
  await page.getByRole('button', { name: /搜索国家/ }).click();
  await page.screenshot({ path: testInfo.outputPath('phone-country-error.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});
