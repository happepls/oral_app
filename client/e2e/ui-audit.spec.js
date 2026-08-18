const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const path = require('node:path');

const pages = [
  ['landing', '/'], ['welcome', '/welcome'], ['login', '/login'], ['register', '/register'],
  ['onboarding', '/onboarding'], ['goal-setting', '/goal-setting'], ['discovery', '/discovery'],
  ['goals', '/goals'], ['profile', '/profile'], ['checkin', '/checkin'],
  ['conversation', '/conversation?mode=tour'], ['history', '/history'], ['subscription', '/subscription'],
];
const user = { id: '00000000-0000-4000-8000-000000000001', username: 'quality_user', nickname: 'Quality User', native_language: 'zh', target_language: 'en', onboarding_tour_completed: true };
const onboardingUser = { ...user, nickname: '', native_language: 'Chinese' };
const activeGoal = { id: 1, target_language: 'en', target_level: 'Beginner', current_proficiency: 10, status: 'active', scenarios: [{ title: 'Airport Check-in', tasks: [{ id: 1, text: 'Ask where the counter is', status: 'pending', score: 0 }] }] };

test.beforeEach(async ({ page }, testInfo) => {
  const isPublic = /\b(landing|welcome|login|register)\b/.test(testInfo.title);
  const seededUser = /\bonboarding\b/.test(testInfo.title) ? onboardingUser : user;
  const darkEnglish = testInfo.project.name.endsWith('-dark-en');
  // Visual baselines must not drift when calendar widgets render today's date.
  await page.clock.setFixedTime(new Date('2026-07-22T12:00:00+08:00'));
  await page.addInitScript(({ seededUser, publicPage, useDarkEnglish }) => {
    if (!publicPage) localStorage.setItem('user', JSON.stringify(seededUser));
    localStorage.setItem('ui_language', useDarkEnglish ? 'en' : 'zh');
    localStorage.setItem('theme', useDarkEnglish ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', useDarkEnglish);
    localStorage.setItem('onboardingTourCompleted', 'true');
    sessionStorage.setItem('hasSeenSplash', 'true');
  }, { seededUser, publicPage: isPublic, useDarkEnglish: darkEnglish });
  await page.route(/tawk\.to|stripe\.com|dashscope|myqcloud|google/i, (route) => route.abort('blockedbyclient'));
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    let data = {};
    if (url.includes('/v1/profile')) data = seededUser;
    else if (url.includes('/v1/goals')) data = [activeGoal];
    else if (url.includes('/v1/tasks')) data = [];
    else if (url.includes('/v1/conversations')) data = [];
    else if (url.includes('/v1/realtime/tickets')) data = { ticket: 'test-ticket', websocket_url: '/api/v1/realtime' };
    else if (url.includes('/v1/oauth/authorize')) data = { client: { id: 'partner', name: 'Local Partner' }, redirect_uri: 'http://localhost:4173/callback', scopes: ['profile:read'], state: 'test-state' };
    else if (url.includes('/users/profile') && isPublic) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'No local session' }) });
    else if (url.includes('/users/profile')) data = { user: seededUser };
    else if (url.includes('/goals/active')) data = { goal: activeGoal };
    else if (url.endsWith('/users/goals')) data = { goals: [activeGoal] };
    else if (url.includes('/checkin/history')) data = [];
    else if (url.includes('/checkin/stats')) data = { streak: 0, total: 0 };
    else if (url.includes('/users/daily-progress')) data = {
      recallCompleted: false,
      qaCompleted: false,
      scenarioCompleted: false,
      practiceMinutes: 0,
      practiceGoal: 15,
      streak: 0,
      monthlyCheckinDays: 0,
      checkedInToday: false,
    };
    else if (url.includes('/users/daily-qa-pass')) data = { passed: false };
    else if (url.includes('/ai/daily-question')) data = {
      id: 'quality-daily-question',
      question_text: 'What did you enjoy doing today?',
      reference_answer: 'I enjoyed practicing English today.',
      passed: false,
    };
    else if (url.includes('/history/')) data = [];
    else if (url.includes('/stripe/products-with-prices')) data = [
      {
        id: 'annual-product', name: 'Guaji AI Annual', active: true,
        metadata: { app: 'guaji_ai', tier: 'annual' },
        prices: [{ id: 'annual-price', active: true, unit_amount: 9900, currency: 'usd', recurring: { interval: 'year', interval_count: 1 } }],
      },
      {
        id: 'weekly-product', name: 'Guaji AI Weekly', active: true,
        metadata: { app: 'guaji_ai', tier: 'weekly' },
        prices: [{ id: 'weekly-price', active: true, unit_amount: 499, currency: 'usd', recurring: { interval: 'week', interval_count: 1 } }],
      },
    ];
    else if (url.includes('/stripe/products')) data = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.route('**/api/users/sse', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: ping\ndata: {}\n\n' }));
});

for (const [name, url] of pages) {
  test(`${name} has no overflow, serious a11y violations, or clipped controls`, async ({ page }, testInfo) => {
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) consoleErrors.push(message.text()); });
    await page.goto(url);
    if (name === 'landing') {
      // Landing owns a one-per-session Splash. Reload after explicitly marking
      // it seen so the visual baseline always captures the page beneath it.
      await page.evaluate(() => sessionStorage.setItem('hasSeenSplash', 'true'));
      await page.reload();
      await expect(page.getByRole('progressbar', { name: '正在加载' })).toHaveCount(0);
    }
    if (name === 'onboarding') {
      // Lazy loading lets auth hydration finish before Onboarding mounts. Use
      // the dedicated new-user fixture and wait for Motion's entrance effects
      // so screenshot and contrast checks observe the settled form.
      await expect(page.locator('input[type="text"]').first()).toHaveValue('');
      await expect(page.locator('button').filter({ hasText: '中文' }).first()).toHaveClass(/text-white/);
      await page.waitForFunction(() => {
        let node = document.querySelector('h1')?.parentElement;
        while (node && !node.style.opacity) node = node.parentElement;
        return node?.style.opacity === '1' && (!node.style.transform || node.style.transform === 'none');
      });
    }
    const darkEnglish = testInfo.project.name.endsWith('-dark-en');
    await page.evaluate((useDark) => document.documentElement.classList.toggle('dark', useDark), darkEnglish);
    await expect(page.locator('html')).toHaveClass(darkEnglish ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    await page.evaluate(() => document.fonts?.ready);
    await expect(page.locator('body')).toBeVisible();
    const target = path.resolve(testInfo.config.rootDir, '../../quality/artifacts/ui-candidates', testInfo.project.name, `${name}.png`);
    await page.screenshot({ path: target, fullPage: true, animations: 'disabled' });
    const linuxSnapshot = `${name}-linux.png`;
    const linuxSnapshotPath = path.resolve(testInfo.config.rootDir, '../../quality/baselines/ui', testInfo.project.name, linuxSnapshot);
    const useLinuxBaseline = process.platform === 'linux' || process.env.PLAYWRIGHT_USE_LINUX_BASELINES === '1';
    const snapshot = useLinuxBaseline && fs.existsSync(linuxSnapshotPath) ? linuxSnapshot : `${name}.png`;
    await expect(page).toHaveScreenshot(snapshot, {
      animations: 'disabled',
      fullPage: true,
      // System font antialiasing differs across developer and CI hosts. Keep
      // the strict 3% layout/content budget while tolerating edge-color noise.
      threshold: 0.3,
      maxDiffPixelRatio: 0.03,
    });
    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(overflow.width, `${name} horizontal overflow`).toBeLessThanOrEqual(overflow.viewport + 1);
    const clipped = await page.locator('button:visible, a:visible, input:visible, select:visible').evaluateAll((nodes) => nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map((node) => node.outerHTML.slice(0, 120)));
    expect(clipped).toEqual([]);
    const undersized = await page.locator('button:visible, a:visible, input:visible, select:visible').evaluateAll((nodes) => nodes.filter((node) => {
      if (node.matches('[data-compact-target="true"]')) return false;
      const rect = node.getBoundingClientRect();
      // Layout engines can report a nominal 44px box as 43.999px.
      return rect.width > 0 && rect.height > 0 && (rect.width < 43.5 || rect.height < 43.5);
    }).map((node) => ({ tag: node.tagName, label: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 40), rect: node.getBoundingClientRect().toJSON() })));
    expect(undersized, `${name} has interactive targets below 44x44`).toEqual([]);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    if (darkEnglish) {
      const nativeLanguageNames = new Set(['🇨🇳 中文', '🇯🇵 日本語', '中文', '日本語']);
      const untranslated = await page.locator('body').innerText().then((text) => [...new Set(text.split('\n').map((line) => line.trim()).filter((line) => /[\u3400-\u9fff]/u.test(line) && !nativeLanguageNames.has(line)))]);
      expect(untranslated, `${name} contains untranslated UI in the English locale`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });
}

test('@critical login remains usable with a keyboard-sized viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto('/login');
  await page.evaluate((useDark) => document.documentElement.classList.toggle('dark', useDark), testInfo.project.name.endsWith('-dark-en'));
  // The submission action must remain reachable when the final form field has
  // focus and the visual viewport is reduced to approximate a soft keyboard.
  await page.locator('input[type="password"]').focus();
  await expect(page.getByRole('button', { name: /登录|sign in/i }).first()).toBeInViewport();
});

test('@critical developer authorization shows verified client and scopes', async ({ page }, testInfo) => {
  await page.goto('/developer/authorize?client_id=partner&redirect_uri=http%3A%2F%2Flocalhost%3A4173%2Fcallback&scope=profile%3Aread&state=test-state');
  await page.evaluate((useDark) => document.documentElement.classList.toggle('dark', useDark), testInfo.project.name.endsWith('-dark-en'));
  await expect(page.getByText('Local Partner')).toBeVisible();
  await expect(page.getByRole('button', { name: /允许|allow/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /拒绝|deny/i })).toBeVisible();
});

test('@critical discovery keeps primary tasks visible and exposes semantic states on partial failure', async ({ page }, testInfo) => {
  await page.route('**/api/users/daily-progress', (route) => route.abort('failed'));
  await page.route('**/api/ai/daily-question', (route) => route.abort('failed'));
  await page.goto('/discovery');
  await page.evaluate((useDark) => document.documentElement.classList.toggle('dark', useDark), testInfo.project.name.endsWith('-dark-en'));

  await expect(page.getByRole('heading', { name: /today's tasks|今日任务/i })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /progress|进度/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /recall|复述/i })).toHaveAttribute('data-completed', 'false');
  await expect(page.getByRole('progressbar', { name: /overall|总进度/i })).toHaveAttribute('aria-valuenow');

  const completedFilter = page.getByRole('button', { name: /completed|已完成/i }).last();
  await completedFilter.click();
  await expect(completedFilter).toHaveAttribute('aria-pressed', 'true');

  const shellWidth = await page.locator('main').evaluate((element) => element.parentElement.getBoundingClientRect().width);
  expect(shellWidth).toBeLessThanOrEqual(Math.min(720, await page.evaluate(() => innerWidth)) + 1);
});

test('@critical discovery recovers after a transient dashboard request failure', async ({ page }) => {
  let goalRequests = 0;
  await page.route('**/api/v1/goals?limit=100', async (route) => {
    goalRequests += 1;
    if (goalRequests === 1) return route.abort('failed');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [activeGoal] }),
    });
  });

  await page.goto('/discovery');
  await expect(page.getByRole('alert').filter({ hasText: /couldn't fully load|not fully loaded|未完全加载/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /today's tasks|今日任务/i })).toBeVisible({ timeout: 7000 });
  await expect(page.getByRole('alert').filter({ hasText: /couldn't fully load|not fully loaded|未完全加载/i })).toHaveCount(0);
  expect(goalRequests).toBeGreaterThanOrEqual(2);
});

test('@critical discovery locked scenario opens a keyboard-safe localized dialog', async ({ page }, testInfo) => {
  const lockedGoal = {
    ...activeGoal,
    scenarios: [
      { title: 'Airport Check-in', tasks: ['Ask where the counter is'] },
      { title: 'Hotel Booking', tasks: ['Request a quiet room'] },
      { title: 'Ordering Coffee', tasks: ['Order a coffee'] },
      { title: 'Job Interview', tasks: ['Introduce your experience'] },
    ],
  };
  await page.route('**/api/v1/goals?limit=100', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [lockedGoal] }),
  }));
  await page.goto('/discovery');
  await page.evaluate((useDark) => document.documentElement.classList.toggle('dark', useDark), testInfo.project.name.endsWith('-dark-en'));

  const unlock = page.getByRole('button', { name: /view unlock options|查看解锁方式/i });
  await unlock.press('Enter');
  const dialog = page.getByRole('dialog', { name: /upgrade to pro|升级 pro/i });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: /close dialog|关闭对话框/i })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(unlock).toBeFocused();
});

test('@critical discovery completion banner is keyboard actionable', async ({ page }) => {
  await page.route('**/api/v1/tasks?limit=100', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: [{
        id: 10,
        goal_id: 1,
        scenario_title: 'Airport Check-in',
        task_description: 'Ask where the counter is',
        status: 'completed',
        score: 9,
        interaction_count: 3,
      }],
    }),
  }));
  await page.goto('/discovery');

  // A freshly completed goal may legitimately show the one-time achievement
  // dialog first. Dismiss it by keyboard before exercising the banner behind it.
  const achievementDialog = page.getByRole('dialog', { name: /goal completed|目标全部完成/i });
  await expect(achievementDialog).toBeVisible();
  await achievementDialog.getByRole('button', { name: /later|稍后再说/i }).press('Enter');
  await expect(achievementDialog).toBeHidden();
  const completion = page.getByRole('button', { name: /all scenarios completed|所有场景已完成/i });
  // Target the control directly so the assertion exercises its keyboard
  // activation in WebKit as well as Chromium.
  await completion.press('Enter');
  await expect(page).toHaveURL(/\/goal-setting$/);
});
