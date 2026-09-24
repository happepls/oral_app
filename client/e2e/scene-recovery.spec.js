const { test, expect } = require('@playwright/test');

async function setup(page, options = {}) {
  const state = { tickets: 0, resets: 0, phases: 0, sessions: 0, generation: 0, score: 3, scenario: 'Cafe', ...options };
  const user = { id: 'recovery-user', username: 'Practice', native_language: 'zh', target_language: 'en' };
  await page.addInitScript(({ user, flapConnections }) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('ui_language', 'zh');
    localStorage.setItem('theme', 'light');
    window.testSockets = [];
    window.sentMessages = [];
    window.microphoneStopped = 0;
    const stream = { getTracks: () => [{ stop() { window.microphoneStopped++; } }] };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true, value: { getUserMedia: async () => stream },
    });
    window.AudioContext = class {
      constructor() {
        this.currentTime = 0; this.state = 'running'; this.destination = {};
        this.audioWorklet = { addModule: async () => {} };
      }
      createAnalyser() {
        return { frequencyBinCount: 128, connect() {}, disconnect() {}, getByteFrequencyData(data) { data.fill(0); } };
      }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      close() { return Promise.resolve(); }
      resume() { return Promise.resolve(); }
    };
    window.AudioWorkletNode = class {
      constructor() { this.port = { onmessage: null }; }
      connect() {}
      disconnect() {}
    };
    class Socket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor(url) {
        this.url = url; this.readyState = 0; this.bufferedAmount = 0;
        window.testSockets.push(this);
        setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 20);
      }
      send(raw) {
        const data = JSON.parse(raw);
        window.sentMessages.push(data);
        if (data.type === 'session_start') {
          setTimeout(() => {
            const snapshot = JSON.parse(localStorage.getItem('test-task') || '{}');
            this.onmessage?.({ data: JSON.stringify({ type: 'session_restored', payload: {
              task_id: 371, scoring_generation: snapshot.generation || 0,
              score: snapshot.score ?? 3, interaction_count: snapshot.score === 0 ? 0 : 3,
            } }) });
            this.onmessage?.({ data: JSON.stringify({ type: 'connection_established', payload: {} }) });
            if (flapConnections) setTimeout(() => this.close(4002, 'Upstream timed out'), 100);
          }, 20);
        }
      }
      close(code = 1000, reason = '') {
        if (this.readyState >= 2) return;
        this.readyState = 2;
        setTimeout(() => { this.readyState = 3; this.onclose?.({ code, reason, wasClean: true }); }, 0);
      }
    }
    window.WebSocket = Socket;
  }, { user, flapConnections: Boolean(options.flapConnections) });
  await page.route(/tawk\.to|stripe\.com|dashscope|myqcloud|google/i, route => route.abort());
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const task = { id: 371, goal_id: 18, scenario_title: state.scenario, task_description: 'Order coffee', text: 'Order coffee',
      status: 'pending', score: state.score, interaction_count: state.score === 0 ? 0 : 3, scoring_generation: state.generation };
    const goal = { id: 18, target_language: 'en', status: 'active', scenarios: [{ title: state.scenario, tasks: [task] }] };
    let data = {};
    if (url.pathname.endsWith('/reset-task')) {
      state.resets++;
      state.generation++;
      state.score = 0;
      await page.evaluate(({ generation, score }) => localStorage.setItem('test-task', JSON.stringify({ generation, score })), state);
      data = { tasks: [{ task_id: 371, scoring_generation: state.generation }], scenario_title: state.scenario };
    } else if (url.pathname.endsWith('/reset-phase')) {
      state.phases++;
      if (state.failPhase && state.phases === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false }) });
    } else if (url.pathname.endsWith('/realtime/tickets')) {
      state.tickets++;
      const failure = state.ticketFailure?.(state.tickets);
      if (failure === 'network') return route.abort('failed');
      if (failure) return route.fulfill({ status: failure, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) });
      data = { ticket: `test-ticket-${state.tickets}` };
    } else if (url.pathname.includes('/users/profile')) data = { user };
    else if (url.pathname.includes('/v1/profile')) data = user;
    else if (url.pathname.includes('/goals/active')) data = { goal };
    else if (url.pathname.includes('/v1/goals')) data = [goal];
    else if (url.pathname.includes('/users/goals')) data = { goals: [goal] };
    else if (url.pathname.includes('/v1/tasks')) data = [task];
    else if (url.pathname.includes('/v1/conversations') && route.request().method() === 'POST') {
      state.sessions++; data = { sessionId: `new-session-${state.sessions}` };
    } else if (url.pathname.includes('/history/') || url.pathname.includes('/v1/conversations')) data = [];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.goto('/conversation?scenario=' + encodeURIComponent(state.scenario) + (options.historyUrl ? '&sessionId=old-session&session=old-session' : ''));
  await expect(page.getByRole('list', { name: '场景子任务' })).toContainText('Order coffee');
  await expect.poll(() => state.tickets).toBe(1);
  await expect(page.getByRole('progressbar', { name: '当前子任务进度', exact: true })).toHaveAttribute('aria-valuenow', String(Math.round(state.score / 9 * 100)));
  return state;
}

async function emit(page, type, payload) {
  await page.evaluate(({ type, payload }) => {
    const socket = window.testSockets.filter(s => s.readyState === 1 && s.url.includes('/realtime')).at(-1);
    if (!socket) throw new Error('No active realtime socket');
    socket.onmessage?.({ data: JSON.stringify({ type, payload }) });
  }, { type, payload });
}

async function disconnect(page) {
  await emit(page, 'connection_closed', { code: 1007, message: 'Response stream timeout' });
}

test('工作面试 restores and advances generation 3 progress @critical', async ({ page }) => {
  await setup(page, { scenario: '工作面试', score: 1, generation: 3 });
  const progress = page.getByRole('progressbar', { name: '当前子任务进度', exact: true });
  await expect(page).toHaveURL(/scenario=%E5%B7%A5%E4%BD%9C%E9%9D%A2%E8%AF%95/);
  await expect(progress).toHaveAttribute('aria-valuenow', '11');
  await emit(page, 'proficiency_update', { task_id: 371, scoring_generation: 3,
    score: 3, interaction_count: 6, delta: 2, completed_window_count: 2,
    evaluation_status: 'completed', evaluation_id: 'interview-current' });
  await expect(progress).toHaveAttribute('aria-valuenow', '33');
  await emit(page, 'proficiency_update', { task_id: 371, scoring_generation: 2,
    score: 6, interaction_count: 9, delta: 3, completed_window_count: 3,
    evaluation_status: 'completed', evaluation_id: 'interview-before-reset' });
  await expect(progress).toHaveAttribute('aria-valuenow', '33');
});

for (const failure of ['network', 503]) {
  test(`upstream timeout recovers after a failed ticket (${failure}) @critical`, async ({ page }) => {
    const state = await setup(page, { ticketFailure: count => count === 2 ? failure : null });
    await disconnect(page);
    await expect.poll(() => state.tickets, { timeout: 10000 }).toBe(3);
    // CRA's development server also opens a hot-reload socket. Count only
    // realtime conversation sockets, in both dev CI and the production bundle.
    await expect.poll(() => page.evaluate(() => window.testSockets.filter(
      s => s.readyState === 1 && s.url.includes('/realtime')
    ).length)).toBe(1);
    await emit(page, 'proficiency_update', { task_id: 371, scoring_generation: 0, task_score: 5, interaction_count: 6,
      delta: 2, completed_window_count: 2, evaluation_status: 'completed', evaluation_id: 'recovered-window' });
    await expect(page.getByRole('progressbar', { name: '当前子任务进度', exact: true })).toHaveAttribute('aria-valuenow', '56');
    await expect(page.getByRole('button', { name: '点击说话', exact: true })).toBeEnabled();
  });
}

for (const status of [401, 403]) test(`ticket authentication rejection ${status} stops automatic retries`, async ({ page }) => {
  const state = await setup(page, { ticketFailure: count => count > 1 ? status : null });
  await disconnect(page);
  await expect.poll(() => state.tickets).toBe(2);
  await expect(page.getByText('无法建立安全连接，请稍后重试。')).toBeVisible();
  await page.waitForTimeout(2500);
  expect(state.tickets).toBe(2);
});

test('manual retry supersedes a scheduled retry', async ({ page }) => {
  const state = await setup(page, { ticketFailure: count => count === 2 ? 'network' : null });
  await disconnect(page);
  await expect.poll(() => state.tickets).toBe(2);
  await page.getByRole('button', { name: /重试/ }).last().click();
  await expect.poll(() => state.tickets).toBe(3);
  await expect(page.getByRole('button', { name: '点击说话', exact: true })).toBeEnabled();
  await page.waitForTimeout(2500);
  expect(state.tickets).toBe(3);
});

test('two restart clicks commit only one reset', async ({ page }) => {
  const state = await setup(page);
  await page.evaluate(() => {
    window.confirm = () => true;
    const button = document.querySelector('[aria-label="重新练习当前场景"]');
    button.click(); button.click();
  });
  await expect.poll(() => state.phases).toBe(1);
  await expect.poll(() => state.tickets).toBe(2);
  await expect(page.getByRole('progressbar', { name: '当前子任务进度', exact: true })).toHaveAttribute('aria-valuenow', '0');
  expect(state.resets).toBe(1);
  expect(state.generation).toBe(1);
});

test('ticket outages stop after five retries', async ({ page }) => {
  const state = await setup(page, { ticketFailure: count => count > 1 ? 503 : null });
  await disconnect(page);
  await expect(page.getByText('自动重连已达到上限，请点击重试。')).toBeVisible({ timeout: 32000 });
  expect(state.tickets).toBe(6);
  await page.waitForTimeout(1500);
  expect(state.tickets).toBe(6);
});

test('connections that repeatedly become ready then fail exhaust the retry budget', async ({ page }) => {
  const state = await setup(page, { flapConnections: true });
  await expect(page.getByText('自动重连已达到上限，请点击重试。')).toBeVisible({ timeout: 32000 });
  expect(state.tickets).toBe(6);
  await page.waitForTimeout(1500);
  expect(state.tickets).toBe(6);
});

test('leaving during retry cancels future tickets', async ({ page }) => {
  const state = await setup(page, { ticketFailure: count => count > 1 ? 503 : null });
  await disconnect(page);
  await expect.poll(() => state.tickets).toBe(2);
  await page.goto('/discovery');
  await page.waitForTimeout(2500);
  expect(state.tickets).toBe(2);
});

test('partial reset retries only phase and clears a history URL @critical', async ({ page }) => {
  const state = await setup(page, { failPhase: true, historyUrl: true });
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '重新练习当前场景', exact: true }).click();
  await expect(page.getByText('进度已重置，但会话恢复失败。请点击重试继续。').last()).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '当前子任务进度', exact: true })).toHaveAttribute('aria-valuenow', '0');
  expect(state.resets).toBe(1);
  await page.getByRole('button', { name: /重试连接|重新连接|重试/ }).last().click();
  await expect.poll(() => state.phases).toBe(2);
  await expect(page).not.toHaveURL(/sessionId=|session=/);
  await expect.poll(() => state.sessions).toBe(1);
  await expect.poll(() => state.tickets).toBe(2);
  expect(state.resets).toBe(1);
  expect(state.generation).toBe(1);
  await expect(page.getByRole('progressbar', { name: '当前子任务进度', exact: true })).toHaveAttribute('aria-valuenow', '0');
  const update = { task_id: 371, task_score: 3, interaction_count: 3, delta: 3, completed_window_count: 1, evaluation_status: 'completed' };
  await emit(page, 'proficiency_update', { ...update, scoring_generation: 0, evaluation_id: 'late-old-window' });
  await expect(page.getByRole('progressbar', { name: '当前子任务进度', exact: true })).toHaveAttribute('aria-valuenow', '0');
  await emit(page, 'proficiency_update', { ...update, scoring_generation: 1, evaluation_id: 'new-window' });
  await expect(page.getByRole('progressbar', { name: '当前子任务进度', exact: true })).toHaveAttribute('aria-valuenow', '33');
});

test('partial reset cancels an active microphone', async ({ page, viewport }) => {
  test.skip(viewport.width < 640, 'The restart action is only visible on desktop while recording');
  await setup(page, { failPhase: true });
  await page.getByRole('button', { name: '点击说话', exact: true }).click();
  await expect(page.getByTestId('recording-controls')).toBeVisible();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '重新练习当前场景', exact: true }).click();
  await expect(page.getByText('进度已重置，但会话恢复失败。请点击重试继续。').last()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.microphoneStopped)).toBe(1);
  await expect(page.getByTestId('recording-controls')).toHaveCount(0);
  expect(await page.evaluate(() => window.sentMessages.filter(m => m.type === 'audio_stream').length)).toBe(0);
});
