const { test, expect } = require('@playwright/test');

test('daily QA translates greeting and later replies using fresh native language @critical', async ({ page }) => {
  const user = { id: 'translation-test-user', username: 'Practice', native_language: 'Chinese', target_language: 'Japanese' };
  const translations = [];
  await page.addInitScript(user => {
    localStorage.setItem('user', JSON.stringify({ ...user, native_language: 'Japanese' }));
    localStorage.setItem('ui_language', 'en');
    localStorage.setItem('onboarding_tour_completed', 'true');
    window.testSockets = [];
    window.WebSocket = class {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor(url) {
        this.url = url; this.readyState = 0; this.bufferedAmount = 0;
        window.testSockets.push(this);
        setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 20);
      }
      send(raw) {
        if (JSON.parse(raw).type === 'session_start') {
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify({ type: 'connection_established', payload: {} }) });
            this.reply('greeting', 'こんにちは');
          }, 20);
        }
      }
      reply(responseId, content) {
        this.onmessage?.({ data: JSON.stringify({ type: 'ai_message', payload: { responseId, content } }) });
        this.onmessage?.({ data: JSON.stringify({ type: 'audio_url', payload: { responseId, role: 'assistant', url: '/synthetic-audio.wav' } }) });
      }
      close() { this.readyState = 3; }
    };
  }, user);
  await page.route(/tawk\.to|stripe\.com|dashscope|myqcloud|google/i, route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith('/profile')) data = user;
    else if (path.endsWith('/daily-question')) data = { question_text: '日本語で挨拶してください', lang: 'Japanese' };
    else if (path.endsWith('/realtime/tickets')) data = { ticket: 'synthetic-ticket' };
    else if (path.endsWith('/conversations')) data = route.request().method() === 'POST' ? { sessionId: 'translation-session' } : [];
    else if (path.endsWith('/translate')) {
      translations.push(route.request().postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ translation: translations.length === 1 ? '你好' : '谢谢' }) });
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.goto('/conversation?mode=daily_qa');
  await page.getByRole('button', { name: 'Translate this AI reply', exact: true }).click();
  await expect(page.getByText('你好', { exact: true })).toBeVisible();
  await page.evaluate(() => window.testSockets.find(s => s.url.includes('/realtime') && s.readyState === 1).reply('follow-up', 'ありがとう'));
  await page.getByRole('button', { name: 'Translate this AI reply', exact: true }).click();
  await expect(page.getByText('谢谢', { exact: true })).toBeVisible();
  expect(translations).toEqual([{ text: 'こんにちは', target_lang: 'Chinese' }, { text: 'ありがとう', target_lang: 'Chinese' }]);
  expect(await page.evaluate(() => window.testSockets.filter(s => s.url.includes('/realtime') && s.readyState === 1).length)).toBe(1);
});
