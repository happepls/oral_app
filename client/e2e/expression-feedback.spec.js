const { test, expect } = require('@playwright/test');

test('scene expressions send student text once and preserve task progress @critical', async ({ page }, testInfo) => {
  const user = { id: 'expression-test', username: 'Practice', native_language: 'zh', target_language: 'en' };
  const task = { id: 42, text: 'Order steak', status: 'pending', score: 3, interaction_count: 3, scoring_generation: 3 };
  const historySaves = [];
  await page.addInitScript(({ user }) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('ui_language', 'zh');
    window.testSockets = [];
    window.sentMessages = [];
    window.pcmStarts = 0;
    window.AudioContext = class {
      constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
      createBuffer(_channels, length, rate) {
        return { duration: length / rate, getChannelData: () => new Float32Array(length) };
      }
      createBufferSource() {
        return { connect() {}, disconnect() {}, stop() {}, start() { window.pcmStarts++; } };
      }
      close() { return Promise.resolve(); }
      resume() { return Promise.resolve(); }
    };
    class Socket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor(url) {
        this.url = url; this.readyState = 0; this.bufferedAmount = 0;
        window.testSockets.push(this);
        setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 20);
      }
      send(data) { if (typeof data === 'string') window.sentMessages.push(JSON.parse(data)); }
      close() { this.readyState = 3; }
    }
    window.WebSocket = Socket;
  }, { user });
  await page.route(/tawk\.to|stripe\.com|dashscope|myqcloud|google/i, route => route.abort());
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    const goal = { id: 7, target_language: 'en', status: 'active', scenarios: [{ title: 'Restaurant', tasks: [task] }] };
    let data = {};
    if (url.endsWith('/reset-task')) {
      task.scoring_generation = 4;
      task.score = 0;
      task.interaction_count = 0;
      data = { tasks: [{ task_id: 42, scoring_generation: 4 }], scenario_title: 'Restaurant' };
    } else if (url.includes('/users/profile')) data = { user };
    else if (url.includes('/v1/profile')) data = user;
    else if (url.includes('/goals/active')) data = { goal };
    else if (url.includes('/v1/goals')) data = [goal];
    else if (url.includes('/users/goals')) data = { goals: [goal] };
    else if (url.includes('/v1/tasks')) data = [{ ...task, goal_id: 7, scenario_title: 'Restaurant', task_description: task.text }];
    else if (url.includes('/v1/conversations') && route.request().method() === 'POST') data = { sessionId: 'expression-session', id: 'expression-session' };
    else if (url.includes('/history/') && route.request().method() === 'POST') {
      const snapshot = route.request().postDataJSON().messages;
      historySaves.push(snapshot);
      if (snapshot.some(message => !message.role || (!message.content && !message.audioUrl))) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Each message requires role and content or audioUrl.' }) });
        return;
      }
      data = [];
    } else if (url.includes('/history/') || url.includes('/v1/conversations')) data = [];
    else if (url.includes('/v1/realtime/tickets')) data = { ticket: 'test-ticket' };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.goto('/conversation?scenario=Restaurant');
  await expect(page.getByRole('list', { name: '场景子任务' })).toContainText('Order steak');
  await expect.poll(() => page.evaluate(() => window.testSockets.some(s => s.readyState === 1 && s.url.includes('/realtime')))).toBe(true);
  const emit = (type, payload) => page.evaluate(({ type, payload }) => {
    window.testSockets.filter(s => s.readyState === 1 && s.url.includes('/realtime')).forEach(s => s.onmessage?.({ data: JSON.stringify({ type, payload }) }));
  }, { type, payload });
  await emit('session_restored', { task_id: 42, score: 3, interaction_count: 3, scoring_generation: 3 });
  await emit('user_transcript', { text: 'I want eat steak.', messageId: 'u1', turn_id: 'u1' });
  // Let autosave fire while only the AI loading bubble exists. The backend
  // rejects the entire snapshot if that empty bubble is sent alongside u1.
  await emit('ai_turn_started', { responseId: 'a1' });
  await expect.poll(() => historySaves.length).toBeGreaterThan(0);
  expect(historySaves.flat()).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'user', content: 'I want eat steak.' }),
  ]));
  expect(historySaves.flat().every(message => message.content || message.audioUrl)).toBe(true);
  await emit('ai_message', { content: 'Use want to eat. Try that again.', responseId: 'a1', turn_id: 'u1' });
  const feedback = { task_id: 42, goal_id: 7, scoring_generation: 3, turn_id: 'u1', scenario: 'Restaurant',
    teaching_mode: 'correct', off_topic: false,
    errors: [{ original: 'I want eat steak', corrected: 'I want to eat steak', explanation_l1: 'want 后接 to 加动词原形。' }],
    alternatives: ["I'd like the steak, please.", 'Could I have the steak?'], next_question_locked: '' };
  const card = page.getByRole('complementary', { name: '表达建议' });
  await expect(card).toHaveCount(0); // old backend / absent event remains usable
  await emit('expression_feedback', feedback);
  await emit('expression_feedback', feedback);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('want 后接 to');
  await expect(page.getByRole('progressbar', { name: '当前子任务进度', exact: true })).toHaveAttribute('aria-valuenow', '33');
  await emit('expression_feedback', { ...feedback, turn_id: 'old', scoring_generation: 2 });
  await expect(card).toHaveCount(1);
  await card.scrollIntoViewIfNeeded();
  const chip = card.getByRole('button', { name: feedback.alternatives[0], exact: true });
  await chip.focus();
  await expect(chip).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width + 1);
  await page.screenshot({ path: testInfo.outputPath('expression-feedback.png') });
  await chip.press('Enter');
  await expect(card.getByRole('textbox')).toHaveValue(feedback.alternatives[0]);
  await expect(chip).toBeDisabled();
  const sent = await page.evaluate(() => window.sentMessages.filter(m => m.type === 'text_message'));
  expect(sent).toEqual([{ type: 'text_message', payload: { text: feedback.alternatives[0] } }]);
  const pcm = responseId => page.evaluate(responseId => {
    const id = new TextEncoder().encode(responseId);
    const packet = new Uint8Array(4 + id.length + 8192);
    packet.set([0x47, 0x4a, 0x01, id.length]);
    packet.set(id, 4);
    window.testSockets.filter(s => s.readyState === 1 && s.url.includes('/realtime')).forEach(s => s.onmessage?.({ data: packet.buffer }));
  }, responseId);
  // Old text/PCM cannot reopen the interrupted turn; the new stream plays
  // before an audio_url/COS message exists, using the real PCM scheduler.
  await emit('ai_message', { content: 'STALE RESPONSE', responseId: 'a1', turn_id: 'u1' });
  await pcm('a1');
  await expect(page.getByText('STALE RESPONSE')).toHaveCount(0);
  expect(await page.evaluate(() => window.pcmStarts)).toBe(0);
  await emit('user_transcript', { text: feedback.alternatives[0], messageId: 'u2', turn_id: 'u2' });
  await emit('ai_message', { content: 'You corrected that clearly.', responseId: 'a2', turn_id: 'u2' });
  await pcm('a2');
  await expect.poll(() => page.evaluate(() => window.pcmStarts)).toBe(1);
  await expect(page.getByRole('progressbar', { name: '当前子任务进度', exact: true })).toHaveAttribute('aria-valuenow', '33');
  await page.evaluate(() => { window.confirm = () => true; });
  await Promise.all([
    page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() }),
    page.getByRole('button', { name: '重新练习当前场景', exact: true }).click(),
  ]);
  await expect.poll(() => page.evaluate(() => window.testSockets?.some(s => s.readyState === 1 && s.url.includes('/realtime')))).toBe(true);
  await expect.poll(() => task.scoring_generation).toBe(4);
  await expect(page.getByRole('progressbar', { name: '当前子任务进度', exact: true })).toHaveAttribute('aria-valuenow', '0');
  await emit('expression_feedback', feedback);
  await expect(card).toHaveCount(0);
});
