const { test, expect } = require('@playwright/test');

test('@critical React preboot state does not expose the no-JavaScript fallback', async ({ page }, testInfo) => {
  // Keep JavaScript enabled but prevent the application bundle from starting.
  // This captures the exact interval that used to flash the static SEO copy.
  await page.route(/\/static\/js\/.*\.js(?:\?.*)?$/, (route) => route.abort('blockedbyclient'));

  await page.goto('/discovery', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#root')).toBeEmpty();
  await expect(page.getByText('GuaJi AI · AI 口语练习伙伴')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '常见问题' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('preboot.png'), fullPage: true });
});
