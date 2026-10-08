const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const user = { id: 'audio-prepaid-test', username: 'Practice', native_language: 'zh', target_language: 'en',
  subscription_status: 'free', stripe_subscription_status: 'free' };
const task = { id: 42, text: 'Order steak', status: 'pending', score: 3, interaction_count: 3, scoring_generation: 3 };

async function setup(page, blocked = false) {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(({ user, blocked }) => {
    localStorage.clear(); localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('ui_language', 'zh'); sessionStorage.setItem('hasSeenSplash', 'true');
    window.testSockets = []; window.pcmSamples = []; window.allowAudio = !blocked;
    const native = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      const data = native.call(this);
      return this.delay ? new Promise(resolve => setTimeout(() => resolve(data), this.delay)) : data;
    };
    window.AudioContext = class {
      constructor() { this.state = blocked ? 'suspended' : 'running'; this.destination = {}; this.origin = performance.now(); }
      get currentTime() { return this.state === 'running' ? (performance.now() - this.origin) / 1000 : 0; }
      createBuffer(_channels, length, rate) {
        const samples = new Float32Array(length);
        return { duration: length / rate, getChannelData: () => samples, samples };
      }
      createBufferSource() {
        return { connect() {}, stop() {}, start() { window.pcmSamples.push(...Array.from(this.buffer.samples, n => Math.round(n * 32768))); } };
      }
      close() { this.state = 'closed'; return Promise.resolve(); }
      resume() {
        if (!window.allowAudio) return Promise.reject(new Error('NotAllowedError'));
        this.state = 'running'; return Promise.resolve();
      }
    };
    class Socket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; window.testSockets.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 20); }
      send() {}
      close() { this.readyState = 3; }
    }
    window.WebSocket = Socket;
  }, { user, blocked });
  await page.route('**/api/**', async route => {
    const url = route.request().url(); let data = {};
    const goal = { id: 7, target_language: 'en', status: 'active', scenarios: [{ title: 'Restaurant', tasks: [task] }] };
    if (url.includes('/users/profile')) data = { user };
    else if (url.includes('/v1/profile')) data = user;
    else if (url.includes('/goals/active')) data = { goal };
    else if (url.includes('/v1/goals')) data = [goal];
    else if (url.includes('/users/goals')) data = { goals: [goal] };
    else if (url.includes('/v1/tasks')) data = [{ ...task, goal_id: 7, scenario_title: 'Restaurant', task_description: task.text }];
    else if (url.includes('/v1/conversations') && route.request().method() === 'POST') data = { sessionId: 'audio-session', id: 'audio-session' };
    else if (url.includes('/history/') || url.includes('/v1/conversations')) data = [];
    else if (url.includes('/v1/realtime/tickets')) data = { ticket: 'test-ticket' };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
}

async function emit(page, type, payload) {
  await page.evaluate(({ type, payload }) => window.testSockets.filter(s => s.readyState === 1 && s.url.includes('/realtime'))
    .forEach(s => s.onmessage?.({ data: JSON.stringify({ type, payload }) })), { type, payload });
}
async function pcm(page, responseId, sample, count, delay = null) {
  await page.evaluate(({ responseId, sample, count, delay }) => {
    const id = new TextEncoder().encode(responseId);
    const packet = new Uint8Array(4 + id.length + count * 2);
    packet.set([0x47, 0x4a, 0x01, id.length]); packet.set(id, 4);
    const view = new DataView(packet.buffer);
    for (let i = 0; i < count; i++) view.setInt16(4 + id.length + i * 2, sample, true);
    const data = delay === null ? packet.buffer : Object.assign(new Blob([packet]), { delay });
    window.testSockets.filter(s => s.readyState === 1 && s.url.includes('/realtime')).forEach(s => s.onmessage?.({ data }));
  }, { responseId, sample, count, delay });
}
async function openScene(page) {
  await page.goto('/conversation?scenario=Restaurant');
  await expect.poll(() => page.evaluate(() => window.testSockets.some(s => s.readyState === 1 && s.url.includes('/realtime')))).toBe(true);
  await emit(page, 'session_restored', { task_id: 42, score: 3, interaction_count: 3, scoring_generation: 3 });
}

test('PCM prefix, reordered Blob conversions and done preserve every sample in the real page @critical', async ({ page }) => {
  await setup(page); await openScene(page);
  await pcm(page, 'a1', 100, 3840, 80);
  await emit(page, 'ai_message', { content: 'Please tell me your order.', responseId: 'a1' });
  await pcm(page, 'a1', 200, 3840, 0);
  await pcm(page, 'a1', 300, 1000);
  await emit(page, 'response.audio.done', { responseId: 'a1' });
  await expect.poll(() => page.evaluate(() => window.pcmSamples.length)).toBe(8680);
  expect(await page.evaluate(() => [window.pcmSamples[0], window.pcmSamples[3839], window.pcmSamples[3840], window.pcmSamples[7679], window.pcmSamples[7680], window.pcmSamples[8679]]))
    .toEqual([100, 100, 200, 200, 300, 300]);
  await pcm(page, 'a2', 400, 1000); // Future response waits for text.
  await emit(page, 'ai_message', { content: 'Would you like a drink?', responseId: 'a2' });
  await emit(page, 'response.audio.done', { responseId: 'a1' });
  await emit(page, 'response.audio.done', { responseId: 'a2' });
  await expect.poll(() => page.evaluate(() => window.pcmSamples.length)).toBe(9680);
  await pcm(page, 'a1', 999, 1000);
  expect(await page.evaluate(() => window.pcmSamples.includes(999))).toBe(false);
  expect(await page.evaluate(() => window.testSockets.filter(s => s.readyState === 1 && s.url.includes('/realtime')).length)).toBe(1);
});

test('Safari autoplay rejection preserves complete short PCM for the explicit unlock gesture @critical', async ({ page }, testInfo) => {
  await setup(page, true); await openScene(page);
  await emit(page, 'ai_message', { content: 'Welcome to your practice.', responseId: 'a1' });
  await pcm(page, 'a1', 321, 1000);
  await emit(page, 'response.audio.done', { responseId: 'a1' });
  const unlock = page.getByRole('button', { name: '点击恢复语音播放' });
  await expect(unlock).toBeVisible();
  expect(await page.evaluate(() => window.pcmSamples.length)).toBe(0);
  await page.evaluate(() => { window.allowAudio = true; });
  await unlock.click();
  await expect.poll(() => page.evaluate(() => window.pcmSamples.length)).toBe(1000);
  expect(await page.evaluate(() => window.pcmSamples.every(n => n === 321))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('audio-unlocked.png') });
});

test('active prepaid membership is clear and renewal requires an explicit action @critical', async ({ page }, testInfo) => {
  await setup(page);
  const prepaidUser = { ...user, subscription_status: 'active', billing_source: 'prepaid', prepaid_expires_at: '2030-01-01T00:00:00Z' };
  await page.route('**/api/users/profile', route => route.fulfill({ json: { success: true, data: { user: prepaidUser } } }));
  await page.route('**/api/stripe/subscription', route => route.fulfill({ json: { subscription: null, status: 'active', billingSource: 'prepaid', prepaidExpiresAt: prepaidUser.prepaid_expires_at } }));
  await page.route('**/api/stripe/products-with-prices', route => route.fulfill({ json: {
    data: ['weekly', 'annual'].map(tier => ({ id: tier, metadata: { tier }, prices: [{ id: `price_${tier}`, unit_amount: tier === 'weekly' ? 499 : 9900, currency: 'usd', active: true, recurring: { interval: tier === 'weekly' ? 'week' : 'year' } }] })),
    prepaidOffers: [{ tier: 'weekly', priceId: 'price_weekly' }, { tier: 'annual', priceId: 'price_annual' }],
  } }));
  const purchases = [];
  await page.route('**/api/stripe/checkout', route => {
    purchases.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: 'transient' } });
  });
  await page.goto('/subscription');
  await expect(page.getByText('会员有效期至', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '管理订阅', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /支付宝/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '立即订阅', exact: true })).toHaveCount(0);
  for (const button of await page.getByRole('button', { name: '已订阅', exact: true }).all()) await expect(button).toBeDisabled();
  await page.getByRole('button', { name: '续购会员', exact: true }).click();
  const buy = page.getByRole('button', { name: '续购会员', exact: true }).first();
  await expect(buy).toBeEnabled();
  await buy.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await buy.click();
  expect(purchases).toHaveLength(2);
  expect(purchases[0]).toMatchObject({ priceId: 'price_weekly', billingMode: 'prepaid' });
  expect(purchases[0].requestKey).toBe(purchases[1].requestKey);
  await page.screenshot({ path: testInfo.outputPath('prepaid-renewal.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(v => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  let fulfilled = false;
  await page.route('**/api/stripe/checkout/cs_test/status', route => route.fulfill({ json: {
    status: fulfilled ? 'fulfilled' : 'pending',
    membership: { status: 'active', billingSource: 'prepaid', prepaidExpiresAt: prepaidUser.prepaid_expires_at },
  } }));
  await page.goto('/subscription/success?session_id=cs_test');
  await expect(page.getByText('付款已提交，正在确认会员开通。')).toBeVisible();
  await expect(page.getByText('支付成功', { exact: false })).toHaveCount(0);
  fulfilled = true;
  await expect(page.getByText('订阅成功！感谢你的支持')).toBeVisible();
  await expect(page).toHaveURL(/\/subscription\/success/);
  await expect(page.getByRole('button', { name: '立即订阅', exact: true })).toHaveCount(0);
});

test('subscribe directly requests multi-method one-time Checkout without a payment dialog @critical', async ({ page }, testInfo) => {
  await setup(page);
  await page.route('**/api/stripe/subscription', route => route.fulfill({ json: { status: 'free' } }));
  await page.route('**/api/stripe/products-with-prices', route => route.fulfill({ json: {
    data: [{ id: 'weekly', metadata: { tier: 'weekly' }, prices: [{ id: 'price_weekly', unit_amount: 499, currency: 'usd', active: true, recurring: { interval: 'week' } }] }],
    prepaidOffers: [{ tier: 'weekly', priceId: 'price_weekly' }],
  } }));
  const purchases = [];
  await page.route('**/api/stripe/checkout', route => {
    purchases.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { code: 'CHECKOUT_PROCESSING' } });
  });
  await page.goto('/subscription');
  const opener = page.getByRole('button', { name: '立即订阅', exact: true });
  await expect(opener).toBeEnabled();
  await expect(page.getByRole('button', { name: /支付宝/ })).toHaveCount(0);
  await opener.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveText('已有订单正在处理，请等待付款确认后再试。');
  await opener.click();
  expect(purchases.map(p => p.billingMode)).toEqual(['prepaid', 'prepaid']);
  expect(purchases.every(p => p.replacePending === true)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('payment-choice.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ['serious', 'critical'].includes(v.impact))).toEqual([]);
});

test('fulfillment snapshot overrides stale auth and slow membership reads @critical', async ({ page }, testInfo) => {
  await setup(page);
  let reads = 0;
  await page.route('**/api/stripe/subscription', async route => {
    const stale = ++reads === 1;
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.fulfill({ json: stale ? { status: 'free', billingSource: null }
      : { status: 'active', billingSource: 'prepaid', prepaidExpiresAt: '2030-01-01T00:00:00Z' } });
  });
  await page.route('**/api/stripe/products-with-prices', route => route.fulfill({ json: {
    data: [{ id: 'annual', metadata: { tier: 'annual' }, prices: [{ id: 'price_annual', unit_amount: 9900, currency: 'usd', active: true, recurring: { interval: 'year' } }] }],
    prepaidOffers: [{ tier: 'annual', priceId: 'price_annual' }],
  } }));
  await page.route('**/api/stripe/checkout/cs_paid/status', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ json: {
      status: 'fulfilled', membership: { status: 'active', billingSource: 'prepaid', prepaidExpiresAt: '2030-01-01T00:00:00Z' },
    } });
  });
  await page.goto('/subscription/success?session_id=cs_paid');
  await expect(page.getByText('订阅成功！感谢你的支持')).toBeVisible();
  await expect(page.getByText('会员有效期至', { exact: false })).toBeVisible();
  const subscribed = page.getByRole('button', { name: '已订阅', exact: true });
  await expect(subscribed).toBeDisabled();
  await page.waitForTimeout(1500);
  await expect(subscribed).toBeDisabled();
  await expect(page.getByRole('button', { name: '立即订阅', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('fulfilled-membership.png'), fullPage: true });
});
