const { test, expect } = require('@playwright/test');

test('continue practice is first while auxiliary requests stay pending @critical', async ({ page }, testInfo) => {
  const user = { id: 'pending-auxiliary-user', nickname: 'Demo', native_language: 'Chinese', onboarding_tour_completed: true };
  const goal = { id: 7, status: 'active', target_language: 'English', target_level: 'Intermediate',
    scenarios: [{ title: 'Airport Check-in', tasks: [{ id: 13, text: 'Ask for help', status: 'pending', score: 3, interaction_count: 4, scoring_generation: 3 }] }],
    access: { membership: { active: true }, unlocked_count: 1, scenarios: [{ title: 'Airport Check-in', allowed: true }] } };
  await page.addInitScript(() => { localStorage.setItem('ui_language', 'zh'); localStorage.setItem('onboardingTourCompleted', 'true'); });
  await page.route(/tawk\.to|google/i, route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (/history|stats|daily-progress|daily-qa/.test(path)) return;
    const data = path.includes('/profile') ? user : path.endsWith('/goals/active') ? { goal } : {};
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/discovery');
  const button = page.locator('section[aria-labelledby="continue-heading"]').getByRole('button', { name: '继续练习', exact: true });
  await expect(button).toBeVisible();
  const order = await page.locator('main').evaluate(main => {
    const focus = main.querySelector('#continue-heading');
    const scenes = main.querySelector('[data-tour="scenario-card"]');
    const tasks = main.querySelector('[data-tour="today-tasks"]');
    return Boolean(focus.compareDocumentPosition(scenes) & Node.DOCUMENT_POSITION_FOLLOWING)
      && Boolean(scenes.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: testInfo.outputPath('continue-first.png'), fullPage: true });
  await button.click();
  await expect(page).toHaveURL(/\/conversation\?scenario=Airport/);
});

for (const membership of ['free', 'active', 'missing']) {
  test(`Discovery trusts ${membership} authority rather than local membership @critical`, async ({ page }, testInfo) => {
    const member = membership === 'active';
    const goal = { id: 7, status: 'active', type: 'custom', target_language: 'English', target_level: 'Intermediate', scenarios:
      Array.from({ length: 4 }, (_, i) => ({ title: `权限场景 ${i + 1}`, image_url: '', tasks: [{ id: i + 1, text: '练习回答', status: 'pending', score: 3, interaction_count: 4, scoring_generation: 3 }] })) };
    if (membership !== 'missing') goal.access = {
      membership: { active: member, status: member ? 'active' : 'free', source: member ? 'prepaid' : null },
      unlocked_count: member ? 4 : 3,
      scenarios: goal.scenarios.map((s, i) => ({ title: s.title, allowed: member || i < 3, reason: member || i < 3 ? null : 'scene_locked' })),
    };
    const user = { id: 'scene-access-ui-user', username: 'Demo', nickname: 'Demo', native_language: 'Chinese', subscription_status: member ? 'free' : 'active' };
    await page.addInitScript(user => {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('ui_language', 'zh');
      localStorage.setItem('onboarding_tour_completed', 'true');
    }, user);
    await page.route(/tawk\.to|stripe\.com|dashscope|google/i, route => route.abort());
    await page.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      let data = {};
      if (pathname.endsWith('/goals/active')) data = { goal, access: goal.access };
      else if (pathname.endsWith('/profile')) data = { user };
      else if (pathname.includes('onboarding-tour')) data = { completed: true, onboarding_tour_completed: true };
      else if (pathname.includes('/goals')) data = { goals: [goal] };
      else if (pathname.includes('/history')) data = { conversations: [] };
      else if (pathname.includes('/checkin')) data = { streak: 0, history: [] };
      else if (pathname.includes('daily-progress')) data = { practiceMinutes: 0, practiceGoal: 15 };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    await page.goto('/discovery');
    if (membership === 'missing') {
      const accessError = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: '发现页未完全加载' }) });
      await expect(accessError).toBeVisible();
      await expect(page.locator('article').filter({ hasText: '权限场景 1' })).toHaveCount(0);
      goal.access = { membership: { active: true }, unlocked_count: 4,
        scenarios: goal.scenarios.map(s => ({ title: s.title, allowed: true })) };
      await accessError.getByRole('button', { name: '重试', exact: true }).click();
      await expect(page.locator('article').filter({ hasText: '权限场景 4' })).toHaveAttribute('data-state', 'selected');
      return;
    }
    const fourth = page.locator('article').filter({ hasText: '权限场景 4' });
    await expect(fourth).toHaveAttribute('data-state', member ? 'selected' : 'locked');
    const first = page.locator('article').filter({ hasText: '权限场景 1' });
    await expect(first).toHaveAttribute('data-state', membership === 'missing' ? 'locked' : 'selected');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
    await page.screenshot({ path: testInfo.outputPath(`scene-access-${membership}.png`), fullPage: true });
  });
}
