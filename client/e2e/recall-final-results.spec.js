const { test, expect } = require('@playwright/test');
const { installManualRecorder } = require('./fixtures/manual-recall-recorder');

const target = 'この結果は、主にスケジュール調整の遅れによるものです。';
async function setup(page, fallback = false) {
  await installManualRecorder(page);
  const user = { id: 'recall-final-fixture', nickname: 'Recall', native_language: 'Chinese', target_language: 'jp' };
  await page.addInitScript(({ user }) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('ui_language', 'zh');
  }, { user });
  await page.route(/tawk\.to|stripe\.com|dashscope|myqcloud|google/i, route => route.abort());
  let translations = 0;
  let tts = 0;
  let transcriptions = 0;
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    let data = {};
    if (url.includes('/recall-transcribe')) {
      transcriptions++;
      expect(route.request().headers()['content-type']).toBe('audio/wav');
      // WebKit's protocol omits Blob postData; verify bytes at the fetch boundary.
      expect(await page.evaluate(() => window.recallUpload)).toEqual({ signature: 'RIFF', size: 32044 });
      expect(new URL(url).searchParams.get('language')).toBe('ja');
      return route.fulfill({ json: { text: target } });
    }
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
  return { translations: () => translations, tts: () => tts, transcriptions: () => transcriptions };
}

test('Japanese recording submits only on stop then enables memory step @critical', async ({ page }) => {
  const counts = await setup(page);
  await page.getByRole('button', { name: /点击说话（跟读）/ }).click();
  await expect.poll(() => page.evaluate(() => window.recallRecorders[0]?.state)).toBe('recording');
  expect(counts.transcriptions()).toBe(0);
  await page.getByRole('button', { name: /点击结束/ }).click();
  await expect(page.getByRole('button', { name: /点击说话（背诵）/ })).toBeVisible();
  await expect(page.getByText('识别 100%')).toBeVisible();
  await expect(page.getByText(target, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /点击说话（背诵）/ }).click();
  await expect.poll(() => page.evaluate(() => window.recallRecorders[1]?.state)).toBe('recording');
  await page.getByRole('button', { name: /点击结束/ }).click();
  await expect(page.getByRole('button', { name: /本句已完成/ })).toBeDisabled();
  await expect(page.getByText('识别 100%')).toHaveCount(2);
  await page.getByRole('button', { name: /下一句/ }).click();
  await expect(page.getByText('次の文です。', { exact: true })).toBeVisible();
});

test('Android pauses do not submit or end recording @critical', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', {
    configurable: true, get: () => 'Mozilla/5.0 (Linux; Android 17; Pixel 10a)',
  }));
  const counts = await setup(page);
  await expect(page.getByText(/停顿不会结束录音/)).toBeVisible();
  await page.clock.install();
  for (const step of ['跟读', '背诵']) {
    await page.getByRole('button', { name: `🎙️ 点击说话（${step}）` }).click();
    await expect.poll(() => page.evaluate(() => window.recallRecorders.at(-1)?.state)).toBe('recording');
    await page.clock.fastForward(10000);
    await expect(page.getByRole('button', { name: /点击结束/ })).toBeEnabled();
    expect(counts.transcriptions()).toBe(step === '跟读' ? 0 : 1);
    await page.getByRole('button', { name: /点击结束/ }).click();
    await expect(page.getByRole('button', { name: step === '跟读' ? /点击说话（背诵）/ : /本句已完成/ })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /本句已完成/ })).toBeDisabled();
  await expect(page.getByText('识别 100%')).toHaveCount(2);
  expect(counts.transcriptions()).toBe(2);
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
