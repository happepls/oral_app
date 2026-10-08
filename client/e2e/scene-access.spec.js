const { test, expect } = require('@playwright/test');

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
    const fourth = page.locator('article').filter({ hasText: '权限场景 4' });
    await expect(fourth).toHaveAttribute('data-state', member ? 'selected' : 'locked');
    const first = page.locator('article').filter({ hasText: '权限场景 1' });
    await expect(first).toHaveAttribute('data-state', membership === 'missing' ? 'locked' : 'selected');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
    await page.screenshot({ path: testInfo.outputPath(`scene-access-${membership}.png`), fullPage: true });
  });
}
