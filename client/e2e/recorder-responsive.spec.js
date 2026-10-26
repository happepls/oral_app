const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'recorder_quality_user',
  nickname: 'Recorder Quality User',
  native_language: 'zh',
  target_language: 'en',
};

const activeGoal = {
  id: 1,
  target_language: 'en',
  target_level: 'Beginner',
  current_proficiency: 10,
  status: 'active',
  scenarios: [{
    title: 'Ordering Coffee',
    tasks: [{ id: 1, text: 'Order a latte', status: 'pending', score: 0, interaction_count: 0, scoring_generation: 3 }],
  }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ seededUser }) => {
    localStorage.setItem('user', JSON.stringify(seededUser));
    localStorage.setItem('ui_language', 'zh');
    localStorage.setItem('theme', 'light');
    window.recorderEvents = [];
    window.recordingWorklets = [];
    window.recorderSockets = [];
    const NativeWebSocket = window.WebSocket;

    class FakeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url, protocols) {
        // CRA opens /ws for hot reload in CI. Keep it real and separate from
        // business sockets, so counts and injected server events target the app.
        if (new URL(url, location.href).pathname === '/ws') {
          return new NativeWebSocket(url, protocols);
        }
        window.recorderSockets.push(this);
        this.url = url;
        this.readyState = FakeWebSocket.CONNECTING;
        this.bufferedAmount = 0;
        setTimeout(() => {
          this.readyState = FakeWebSocket.OPEN;
          this.onopen?.({ type: 'open' });
        }, 20);
      }

      send(raw) {
        const event = JSON.parse(raw);
        window.recorderEvents.push(event);
        if (event.type === 'ping') queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'pong', timestamp: event.timestamp }) }));
        if (event.type === 'user_audio_ended' && !window.deferSubmissionAck) queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'user_audio_received', payload: { input_id: event.payload.input_id } }) }));
      }

      close(code = 1000, reason = '') {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.({ code, reason, wasClean: true });
      }
    }

    const stream = { getTracks: () => [{ stop() {} }] };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => stream },
    });

    class FakeAudioContext {
      constructor() {
        this.currentTime = 0;
        this.state = 'running';
        this.destination = {};
        this.audioWorklet = { addModule: async () => {} };
      }

      createAnalyser() {
        return {
          fftSize: 256,
          smoothingTimeConstant: 0.75,
          frequencyBinCount: 128,
          connect() {},
          disconnect() {},
          getByteFrequencyData(data) { data.fill(32); },
        };
      }

      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      close() { return Promise.resolve(); }
      resume() { return Promise.resolve(); }
    }

    window.WebSocket = FakeWebSocket;
    window.AudioContext = FakeAudioContext;
    window.webkitAudioContext = FakeAudioContext;
    window.AudioWorkletNode = class {
      constructor() {
        window.recordingWorklets.push(this);
        this.port = { onmessage: null, postMessage: () => queueMicrotask(() => this.port.onmessage?.({ data: { type: 'flushed' } })) };
      }
      connect() {}
      disconnect() {}
    };
  }, { seededUser: user });

  await page.route(/tawk\.to|stripe\.com|dashscope|myqcloud|google/i, (route) => route.abort('blockedbyclient'));
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    let data = {};
    if (url.includes('/v1/profile')) data = user;
    else if (url.includes('/users/profile')) data = { user };
    else if (url.includes('/v1/goals/active')) data = { goal: activeGoal };
    else if (url.includes('/v1/goals')) data = [activeGoal];
    else if (url.includes('/goals/active')) data = { goal: activeGoal };
    else if (url.includes('/users/goals')) data = { goals: [activeGoal] };
    else if (url.includes('/v1/tasks')) data = [];
    else if (url.includes('/v1/conversations') && route.request().method() === 'POST') data = { sessionId: 'recorder-test-session' };
    else if (url.includes('/v1/conversations')) data = [];
    else if (url.includes('/v1/realtime/tickets')) data = { ticket: 'recorder-test-ticket' };
    else if (url.includes('/history/')) data = [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data }),
    });
  });
});

test('recording pauses keep one socket and submit only on explicit send @critical', async ({ page }) => {
  await page.clock.install();
  await page.goto('/conversation?scenario=Ordering%20Coffee');
  await expect(page.getByText(/在线|online/i).first()).toBeVisible();
  await page.getByRole('button', { name: /点击说话|tap to speak/i }).click();
  await expect(page.getByTestId('recording-controls')).toBeVisible();
  for (const pause of [5000, 15000, 30000]) {
    await page.evaluate(() => window.recordingWorklets[0].port.onmessage({ data: { type: 'audio_data', buffer: new Int16Array(800) } }));
    await page.clock.fastForward(pause);
    await expect(page.getByTestId('recording-controls')).toBeVisible();
    expect(await page.evaluate(() => window.recorderEvents.filter(e => e.type === 'user_audio_ended').length)).toBe(0);
  }
  expect(await page.evaluate(() => window.recorderSockets.length)).toBe(1);
  await page.clock.resume();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  // Assert the submitted protocol directly; animation exit uses a separate
  // motion timeline after the clock jumps. Normal UI exit is covered below.
  await expect.poll(() => page.evaluate(() => window.recorderEvents.filter(e => e.type === 'user_audio_ended').length)).toBe(1);
  expect(await page.evaluate(() => window.recorderEvents.filter(e => e.type === 'audio_stream').length)).toBe(1);
});

test('uncertain submission remains visible while socket is online @critical', async ({ page }) => {
  await page.goto('/conversation?scenario=Ordering%20Coffee');
  await expect(page.getByText(/在线|online/i).first()).toBeVisible();
  await page.evaluate(() => { window.deferSubmissionAck = true; });
  expect(await page.evaluate(() => window.recorderSockets.map(socket => new URL(socket.url).pathname))).toEqual(['/api/v1/realtime']);
  await page.getByRole('button', { name: /点击说话|tap to speak/i }).click();
  await expect(page.getByTestId('recording-controls')).toBeVisible();
  await page.evaluate(() => window.recordingWorklets[0].port.onmessage({ data: { type: 'audio_data', buffer: new Int16Array(800) } }));
  await page.getByRole('button', { name: '发送', exact: true }).dblclick();
  await expect.poll(() => page.evaluate(() => window.recorderEvents.filter(e => e.type === 'user_audio_ended').length)).toBe(1);
  await page.evaluate(() => window.recorderSockets[0].onmessage({ data: JSON.stringify({
    type: 'error', payload: { code: 'input_submission_pending' },
  }) }));
  await expect(page.getByRole('alert')).toContainText('录音提交状态待确认');
  await expect(page.getByText(/在线|online/i).first()).toBeVisible();
  await page.getByRole('button', { name: '放弃本次录音', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('recording waveform remains visible across mobile widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Run the responsive matrix once in Chrome.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/conversation?scenario=Ordering%20Coffee');
  await expect(page.getByText(/在线|online/i).first()).toBeVisible();
  await page.getByRole('button', { name: /点击说话|tap to speak/i }).click();
  await expect(page.getByTestId('recording-controls')).toBeVisible();

  const artifactDir = path.resolve(
    testInfo.config.rootDir,
    '../../quality/artifacts/ui-candidates/recorder-responsive',
  );
  fs.mkdirSync(artifactDir, { recursive: true });

  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: Math.max(568, Math.round(width * 2.16)) });
    const waveform = page.getByTestId('recording-waveform');
    await expect(waveform).toBeVisible();
    expect((await waveform.boundingBox())?.width).toBeGreaterThan(40);

    const visibleBars = waveform.locator('[data-waveform-bar="true"]:visible');
    await expect(visibleBars).toHaveCount(16);
    const barWidths = await visibleBars.evaluateAll((bars) => bars.map((bar) => bar.getBoundingClientRect().width));
    expect(Math.min(...barWidths)).toBeGreaterThan(1);

    await expect(page.getByRole('button', { name: /进入 CC|enter CC/i })).toBeHidden();
    await expect(page.getByRole('button', { name: /重新练习当前场景|restart current scenario/i })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);

    await page.locator('footer').screenshot({
      path: path.join(artifactDir, `recording-${width}.png`),
      animations: 'disabled',
    });
  }

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByTestId('recording-waveform').locator('[data-waveform-bar="true"]:visible')).toHaveCount(32);
  await expect(page.getByRole('button', { name: /进入 CC|enter CC/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /重新练习当前场景|restart current scenario/i })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /取消|cancel/i }).click();
  await expect(page.getByTestId('recording-controls')).toBeHidden();
  await expect(page.getByRole('button', { name: /点击说话|tap to speak/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /进入 CC|enter CC/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /重新练习当前场景|restart current scenario/i })).toBeVisible();
});
