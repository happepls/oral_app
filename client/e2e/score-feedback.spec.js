const { test, expect } = require('@playwright/test');

async function openScene(page) {
  const user = { id: 'score-feedback-fixture', nickname: 'Practice', native_language: 'zh', target_language: 'en' };
  await page.addInitScript(({ user }) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('ui_language', 'zh');
    window.testSockets = [];
    class Socket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor(url) {
        this.url = url; this.readyState = 0; this.bufferedAmount = 0;
        window.testSockets.push(this);
        setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 20);
      }
      send() {}
      close() { this.readyState = 3; }
    }
    window.WebSocket = Socket;
  }, { user });
  await page.route(/tawk\.to|stripe\.com|dashscope|myqcloud|google/i, route => route.abort());
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    const task = { id: 372, text: 'Order a drink', status: 'pending', score: 0, interaction_count: 0, scoring_generation: 3 };
    const goal = { id: 1, target_language: 'en', status: 'active', scenarios: [{ title: 'Ordering Coffee', tasks: [task] }] };
    let data = {};
    if (url.includes('/users/profile')) data = { user };
    else if (url.includes('/v1/profile')) data = user;
    else if (url.includes('/goals/active')) data = { goal };
    else if (url.includes('/v1/goals')) data = [goal];
    else if (url.includes('/users/goals')) data = { goals: [goal] };
    else if (url.includes('/v1/tasks')) data = [{ ...task, goal_id: 1, scenario_title: 'Ordering Coffee', task_description: task.text }];
    else if (url.includes('/v1/conversations') && route.request().method() === 'POST') data = { sessionId: 'feedback-session', id: 'feedback-session' };
    else if (url.includes('/history/') || url.includes('/v1/conversations')) data = [];
    else if (url.includes('/v1/realtime/tickets')) data = { ticket: 'test-ticket' };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/conversation?scenario=Ordering%20Coffee');
  await expect(page.getByRole('list', { name: '场景子任务' })).toContainText('Order a drink');
  await expect.poll(() => page.evaluate(() => window.testSockets.some(s => s.readyState === 1 && s.url.includes('/realtime')))).toBe(true);
  const emit = (type, payload) => page.evaluate(({ type, payload }) => {
    window.testSockets.filter(s => s.readyState === 1 && s.url.includes('/realtime')).forEach(s => s.onmessage?.({ data: JSON.stringify({ type, payload }) }));
  }, { type, payload });
  await emit('session_restored', { task_id: 372, score: 0, interaction_count: 0, scoring_generation: 3 });
  return emit;
}
const feedback = {
  task_id: 372, scoring_generation: 3, evaluation_status: 'completed',
  evaluation_id: 'window-1', score: 3, interaction_count: 3, delta: 3, total: 68,
  message: '表达清晰，已说明饮品和口味偏好。', quality: 'satisfactory',
};

test('Rive feedback enters, persists and only explicitly hidden card fades out @critical', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const wasmRequests = [];
  page.on('request', request => { if (request.url().includes('.wasm')) wasmRequests.push(request.url()); });
  const emit = await openScene(page);
  await emit('proficiency_update', feedback);
  const cards = page.getByTestId('score-feedback');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('+3 熟练度');
  await expect(cards.first()).toContainText('总分 68');
  await expect(page.locator('[data-rive-state="ready"]')).toHaveCount(1);
  await expect(cards.first()).toHaveCSS('opacity', '1');
  expect(wasmRequests.length).toBeGreaterThan(0);
  expect(wasmRequests.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  await page.waitForTimeout(3800);
  await expect(cards).toHaveCount(1);
  await emit('proficiency_update', { ...feedback, evaluation_id: 'window-2', score: 5, interaction_count: 6, delta: 2, total: 70, message: '第二轮反馈。' });
  await expect(cards).toHaveCount(2);
  await expect(page.locator('[data-rive-state="ready"]')).toHaveCount(2);
  await emit('proficiency_update', { ...feedback, evaluation_id: 'window-2', score: 5, interaction_count: 6, delta: 2, total: 70 });
  await expect(cards).toHaveCount(2);
  await emit('proficiency_update', { ...feedback, evaluation_id: 'stale', scoring_generation: 2 });
  await emit('proficiency_update', { ...feedback, evaluation_id: 'pending', evaluation_status: 'pending', interaction_count: 9 });
  await emit('proficiency_update', { ...feedback, evaluation_id: 'zero', delta: 0, score: 5, interaction_count: 9 });
  await expect(cards).toHaveCount(2);
  await emit('ai_message', { text: 'Your order is ready.', responseId: 'reply-after-feedback' });
  await expect(cards).toHaveCount(2);
  await cards.first().scrollIntoViewIfNeeded();
  await expect(cards.last()).toHaveCSS('opacity', '1');
  await page.waitForTimeout(1800); // Capture after the one-shot Rive accent settles.
  await page.screenshot({ path: testInfo.outputPath('score-feedback-persistent.png') });
  const first = cards.filter({ hasText: '总分 68' });
  await first.getByRole('button', { name: '隐藏本条反馈' }).focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveCount(0);
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('总分 70');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width + 1);
  expect(errors).toEqual([]);
});

test('reduced motion leaves accessible static feedback and no Rive canvas @critical', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const emit = await openScene(page);
  await emit('proficiency_update', feedback);
  const card = page.getByTestId('score-feedback');
  await expect(card.getByRole('status')).toContainText('表达清晰');
  await expect(card.locator('canvas')).toHaveCount(0);
  await card.getByRole('button', { name: '隐藏本条反馈' }).click();
  await expect(card).toHaveCount(0);
});

test('missing Rive asset does not hide feedback or block dismissal @critical', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/*.riv', route => route.abort());
  const emit = await openScene(page);
  await emit('proficiency_update', feedback);
  const card = page.getByTestId('score-feedback');
  await expect(card).toContainText('总分 68');
  await expect(page.locator('[data-rive-state="fallback"]')).toHaveCount(1);
  await card.getByRole('button', { name: '隐藏本条反馈' }).click();
  await expect(card).toHaveCount(0);
});
