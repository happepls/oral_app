const { test, expect } = require('@playwright/test');

for (const mode of ['normal', 'reduced', 'missing-asset']) {
  test(`practice transition ${mode} never delays navigation @critical`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('ui_language', 'zh'); localStorage.setItem('onboardingTourCompleted', 'true'); });
    await page.route(/tawk\.to|google/i, route => route.abort());
    if (mode === 'missing-asset') await page.route('**/*.riv', route => route.abort());
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const goal = { id: 7, status: 'active', target_language: 'English', target_level: 'Intermediate',
        scenarios: [{ title: 'Airport Check-in', tasks: [{ id: 13, text: 'Ask for help', status: 'pending', score: 3, interaction_count: 4, scoring_generation: 3 }] }],
        access: { membership: { active: true }, unlocked_count: 1, scenarios: [{ title: 'Airport Check-in', allowed: true }] } };
      const data = path.includes('/profile') ? { id: 'transition-user', nickname: 'Demo', native_language: 'Chinese', onboarding_tour_completed: true }
        : path.endsWith('/goals/active') ? { goal } : {};
      return route.fulfill({ json: { success: true, data } });
    });
    // Register after the JSON fallback so EventSource receives its real wire
    // type. WebKit reports a JSON SSE response as a page error.
    await page.route('**/api/users/sse', route => route.fulfill({
      contentType: 'text/event-stream', body: 'event: connected\ndata: {}\n\n',
    }));
    await page.routeWebSocket(/\/ws\//, socket => socket.onMessage(() => {}));
    await page.goto('/discovery');
    const button = page.locator('section[aria-labelledby="continue-heading"] button');
    await expect(button).toBeVisible();
    await button.hover();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await button.click();
    await expect(page).toHaveURL(/\/conversation\?/);
    const transition = page.getByTestId('practice-transition');
    await expect(transition).toBeVisible();
    await expect(transition).toHaveCSS('pointer-events', 'none');
    if (mode === 'reduced') await expect(transition.locator('canvas')).toHaveCount(0);
    else {
      await expect(transition.locator(`[data-rive-state="${mode === 'normal' ? 'ready' : 'fallback'}"]`)).toHaveCount(1);
      await page.clock.runFor(150);
      await page.screenshot({ path: testInfo.outputPath(`transition-${mode}.png`) });
    }
    await page.clock.runFor(450);
    await expect(transition).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
