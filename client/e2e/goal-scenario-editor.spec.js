const { test, expect } = require('@playwright/test');

const makeGoal = () => ({ id: 7, description: '旅行英语练习', status: 'paused', type: 'travel_survival', target_language: 'English', target_level: 'Intermediate', interests: 'Food', scenarios: [
  { title: '机场办理登机', tasks: ['说明目的地', '托运行李', '询问登机口'].map((text, i) => ({ id: i + 10, text, status: i === 0 ? 'completed' : 'pending', score: i === 0 ? 9 : 0, interaction_count: 9, scoring_generation: 3 })) },
  { title: '餐厅点餐', tasks: ['询问菜单', '点一份主菜', '请求结账'].map((text, i) => ({ id: i + 20, text, status: 'pending', score: i === 0 ? 3 : 0, interaction_count: i === 0 ? 4 : 0, scoring_generation: 3 })) },
] });

// CRA also opens an HMR socket in CI. Count only the real conversation endpoint
// so both dev-server and production-bundle runs enforce the same invariant.
const countBusinessSockets = (page, openOnly = false) => page.evaluate(openOnly =>
  window.sockets.filter(socket => new URL(socket.url).pathname === '/api/v1/realtime'
    && (!openOnly || socket.readyState === 1)).length, openOnly);

test('paused goal edits lock completed scenes and preserve failed edits @critical', async ({ page }, testInfo) => {
  let goal = makeGoal(); const saved = []; let fail = true;
  await page.addInitScript(() => { localStorage.setItem('user', JSON.stringify({ id: 'editor-user', username: 'Demo', native_language: 'zh' })); localStorage.setItem('ui_language', 'zh'); });
  await page.route(/tawk\.to|stripe\.com|dashscope|google/i, route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith('/goals/7/scenarios')) {
      saved.push(route.request().postDataJSON());
      if (fail) { fail = false; return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: '练习进度正在更新，请稍后重试保存', code: 'scenarios_busy' }) }); }
      goal = { ...goal, scenarios: saved.at(-1).scenarios.map((scenario, i) => i === 0 ? goal.scenarios[0] : ({ ...scenario, tasks: scenario.tasks.map((text, n) => ({ id: n + 30, text, score: 0, status: 'pending', interaction_count: 0, scoring_generation: 0 })) })) };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, goal }) });
    }
    if (path.endsWith('/ai/scenario')) data = { scenario: { title: '酒店入住', tasks: ['说明预订信息', '询问早餐时间', '请求房卡'] } };
    else if (path.includes('/goals')) data = { goals: [goal] };
    else if (path.includes('/checkin')) data = { streak: 2 };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.goto('/goals');
  await page.getByRole('button', { name: '目标操作' }).click();
  await page.getByRole('button', { name: '编辑场景' }).click();
  const dialog = page.getByRole('dialog', { name: '编辑场景' });
  await expect(dialog).toBeVisible();
  const locked = dialog.getByRole('group', { name: '场景 1' });
  await expect(locked.getByRole('textbox', { name: '场景标题' })).toBeDisabled();
  const editable = dialog.getByRole('group', { name: '场景 2' });
  await editable.getByRole('textbox', { name: '场景标题' }).fill('在咖啡店点餐');
  await expect(dialog.getByRole('status')).toContainText('保存后将重置');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: testInfo.outputPath('scenario-editor.png') });
  page.on('dialog', modal => modal.accept());
  await dialog.getByRole('button', { name: '保存场景' }).click();
  await expect(dialog.getByRole('alert')).toContainText('稍后重试');
  await expect(editable.getByRole('textbox', { name: '场景标题' })).toHaveValue('在咖啡店点餐');
  await dialog.getByRole('button', { name: '保存场景' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('场景已保存');
  await expect(page.getByText('在咖啡店点餐', { exact: true })).toBeVisible();
  expect(saved).toHaveLength(2);
  expect(saved[0].scenarios[1]).toEqual({ title: '在咖啡店点餐', tasks: ['询问菜单', '点一份主菜', '请求结账'] });
  await page.getByRole('button', { name: '目标操作' }).click();
  await page.getByRole('button', { name: '编辑场景' }).click();
  await dialog.getByRole('button', { name: 'AI 添加场景' }).click();
  await expect(dialog.getByRole('group', { name: '场景 3' }).getByRole('textbox', { name: '场景标题' })).toHaveValue('酒店入住');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('another tab editing the same goal closes its old business socket @critical', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'editor-user', username: 'Demo' })); localStorage.setItem('ui_language', 'zh');
    window.sockets = [];
    window.WebSocket = class {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor(url) { this.url = url; this.readyState = 0; window.sockets.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 20); }
      send() {} close() { this.readyState = 3; }
    };
  });
  const goal = makeGoal(); goal.status = 'active';
  await page.route(/tawk\.to|stripe\.com|dashscope|google/i, route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith('/goals/active')) data = { goal };
    else if (path.endsWith('/conversations')) data = { sessionId: 'editor-session', id: 'editor-session' };
    else if (path.includes('/history/')) data = [];
    else if (path.includes('/tickets')) data = { ticket: 'fake' };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.goto('/conversation?scenario='+encodeURIComponent('餐厅点餐'));
  await expect.poll(() => countBusinessSockets(page, true)).toBe(1);
  const notify = goalId => page.evaluate(goalId => window.dispatchEvent(new StorageEvent('storage', { key: `goal_scenarios_updated:editor-user:${goalId}`, newValue: JSON.stringify({ userId: 'editor-user', goalId: String(goalId) }) })), goalId);
  await notify(8);
  expect(await countBusinessSockets(page, true)).toBe(1);
  await notify(7);
  await expect(page.getByRole('dialog', { name: '练习场景已更新' })).toBeVisible();
  expect(await countBusinessSockets(page, true)).toBe(0);
  await page.getByRole('button', { name: '返回目标' }).click();
  await expect(page).toHaveURL(/\/goals$/);
});

for (const delayed of ['goal', 'session']) {
  test(`goal update during pending ${delayed} prevents late socket creation @critical`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('user', JSON.stringify({ id: 'editor-user', username: 'Demo' })); localStorage.setItem('ui_language', 'zh');
      window.sockets = [];
      window.WebSocket = class {
        static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
        constructor(url) { this.url = url; this.readyState = 0; window.sockets.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 20); }
        send() {} close() { this.readyState = 3; }
      };
    });
    let release; let started = false; let delivered = false;
    const held = new Promise(resolve => { release = resolve; });
    const goal = makeGoal(); goal.status = 'active';
    await page.route(/tawk\.to|stripe\.com|dashscope|google/i, route => route.abort());
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      const isGoal = path.endsWith('/goals/active');
      const isSession = path.endsWith('/conversations');
      if (isGoal) data = { goal };
      else if (isSession) data = { id: 'slow-session', sessionId: 'slow-session' };
      else if (path.includes('/tickets')) data = { ticket: 'fake' };
      if ((delayed === 'goal' && isGoal) || (delayed === 'session' && isSession)) {
        started = true; await held;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) }); delivered = true; return;
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    });
    await page.goto('/conversation?scenario='+encodeURIComponent('餐厅点餐'));
    await expect.poll(() => started).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'goal_scenarios_updated:editor-user:7', newValue: JSON.stringify({ userId: 'editor-user', goalId: '7' }) })));
    release();
    await expect.poll(() => delivered).toBe(true);
    await expect(page.getByRole('dialog', { name: '练习场景已更新' })).toBeVisible();
    // Give the late init continuation an animation frame and a task turn. It
    // previously opened a socket behind the update dialog after these resolves.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 100))));
    expect(await countBusinessSockets(page)).toBe(0);
  });
}
