const { test, expect } = require('@playwright/test');

test('recall click recording survives release and ASR silence @critical', async ({ page }, testInfo) => {
  const user = { id: 'recall-recording-user', nickname: 'Recall', native_language: 'Chinese', target_language: 'English' };
  await page.addInitScript(({ user }) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('ui_language', 'zh');
    window.recognizers = [];
    window.SpeechRecognition = class {
      constructor() { window.recognizers.push(this); }
      start() {}
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    };
  }, { user });
  await page.route(/tawk\.to|stripe\.com|dashscope|myqcloud|google/i, route => route.abort());
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    let data = {};
    if (url.includes('/profile')) data = url.includes('/v1/') ? user : { user };
    else if (url.includes('/goals/active')) data = { goal: { id: 1, target_language: 'English', scenarios: [] } };
    else if (url.includes('/daily-state')) data = { completed: false, switch_count: 0 };
    else if (url.includes('/daily-recall')) data = { topic: 'Coffee', sentences: ['I would like a coffee please.', 'Could I have some milk please?'] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.goto('/recall');
  const button = page.getByRole('button', { name: /点击说话（跟读）/ });
  await expect(button).toBeVisible();
  await button.focus();
  await button.press('Space');
  await page.mouse.move(0, 0);
  await expect(page.getByRole('button', { name: /点击结束/ })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    window.recognizers[0].onresult({ results: [[{ transcript: 'I would like' }]] });
    window.recognizers[0].onend(); // Browser ASR timeout, not a user stop.
    window.recognizers[1].onresult({ results: [[{ transcript: 'a coffee please.' }]] });
  });
  await expect(page.getByRole('button', { name: /点击结束/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.recognizers.length)).toBe(2);
  await page.getByRole('button', { name: /点击结束/ }).click();
  await expect(page.getByRole('button', { name: /点击说话（背诵）/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(testInfo.project.use.viewport.width + 1);
  await page.screenshot({ path: testInfo.outputPath('recall-click.png') });
});
