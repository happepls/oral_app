const { test, expect } = require('@playwright/test');

const target = 'この結果は、主にスケジュール調整の遅れによるものです。';
async function setup(page, fallback = false) {
  const user = { id: 'recall-final-fixture', nickname: 'Recall', native_language: 'Chinese', target_language: 'jp' };
  await page.addInitScript(({ user }) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('ui_language', 'zh');
    window.recognizers = [];
    window.SpeechRecognition = class {
      constructor() { window.recognizers.push(this); }
      start() {}
      stop() {}
      abort() {}
    };
    window.emitResult = (text, isFinal) => window.recognizers.at(-1).onresult?.({
      resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })],
    });
  }, { user });
  await page.route(/tawk\.to|stripe\.com|dashscope|myqcloud|google/i, route => route.abort());
  let translations = 0;
  let tts = 0;
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    let data = {};
    if (url.includes('/translate')) {
      translations++;
      expect(route.request().postDataJSON().target_lang).toBe('ja');
      return route.fulfill({ status: translations === 1 ? 500 : 200, json: translations === 1 ? { detail: 'Translation failed' } : { translation: target } });
    }
    if (url.includes('/tts')) {
      tts++;
      return route.fulfill({ status: 503, json: { error: { code: 'upstream_unavailable', message: 'retry' } } });
    }
    if (url.includes('/profile')) data = url.includes('/v1/') ? user : { user };
    else if (url.includes('/goals/active')) data = { goal: { id: 1, target_language: 'jp', scenarios: [{ title: 'Synthetic', tasks: ['Hello.'] }] } };
    else if (url.includes('/daily-state')) data = { completed: false, switch_count: 0 };
    else if (url.includes('/daily-recall')) {
      if (fallback) return route.fulfill({ status: 503, json: { detail: 'unavailable' } });
      data = { topic: 'Synthetic Japanese', sentences: [target, '次の文です。'] };
    }
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/recall');
  return { translations: () => translations, tts: () => tts };
}

test('Japanese revisions wait for final result, then enable memory step @critical', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /点击说话（跟读）/ }).click();
  expect(await page.evaluate(() => window.recognizers[0].lang)).toBe('ja-JP');
  await page.evaluate(target => {
    for (let i = 1; i <= target.length; i++) window.emitResult(target.slice(0, i), false);
  }, target);
  await page.getByRole('button', { name: /点击结束/ }).click();
  await expect(page.getByRole('button', { name: /识别中/ })).toBeDisabled();
  await page.evaluate(target => {
    window.emitResult(target, true);
    window.recognizers[0].onend();
  }, target);
  await expect(page.getByRole('button', { name: /点击说话（背诵）/ })).toBeVisible();
  await expect(page.getByText('识别 100%')).toBeVisible();
  await expect(page.getByText(target, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /点击说话（背诵）/ }).click();
  await page.getByRole('button', { name: /点击结束/ }).click();
  await page.evaluate(target => {
    window.emitResult(target, true);
    window.recognizers[1].onend();
  }, target);
  await expect(page.getByRole('button', { name: /本句已完成/ })).toBeDisabled();
  await expect(page.getByText('识别 100%')).toHaveCount(2);
  await page.getByRole('button', { name: /下一句/ }).click();
  await expect(page.getByText('次の文です。', { exact: true })).toBeVisible();
});

test('translation failure is uncached and retryable; TTS 503 remains retryable @critical', async ({ page }) => {
  const counts = await setup(page, true);
  await expect(page.getByRole('alert')).toContainText('翻译');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('recall_translated')))).toHaveLength(0);
  await page.getByRole('button', { name: '重试加载台词' }).click();
  await expect(page.getByText(target, { exact: true })).toBeVisible();
  expect(counts.translations()).toBe(2);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('recall_translated_v3')))).toHaveLength(1);
  await page.getByTitle('试听').click();
  await page.getByRole('button', { name: '语音合成或播放失败，请重试' }).click();
  await expect.poll(() => counts.tts()).toBe(2);
  await expect(page.getByRole('button', { name: '语音合成或播放失败，请重试' })).toBeVisible();
});
