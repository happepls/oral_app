const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('homepage has visible brand, FAQ, contact and navigation without JavaScript', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: testInfo.project.use.viewport });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${baseURL}/`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<!--email_off--><a\b[^>]*href="mailto:admin@guajiguaji\.top"[^>]*>[^<]*admin@guajiguaji\.top<\/a><!--\/email_off-->/);
    await expect(page.getByRole('heading', { name: 'Guaji AI 是什么？', level: 2, exact: true })).toBeVisible();
    await expect(page.getByText('Guaji AI（guajiguaji）是浏览器中的 AI 口语练习应用。', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: '常见问题', exact: true })).toBeVisible();
    const contact = page.locator('footer a[href="mailto:admin@guajiguaji.top"]');
    await expect(contact).toBeVisible();
    await expect(contact).toContainText('admin@guajiguaji.top');
    expect(await contact.evaluate(node => getComputedStyle(node).textDecorationLine)).toBe('none');
    await contact.hover();
    expect(await contact.evaluate(node => getComputedStyle(node).textDecorationLine)).toBe('none');
    await expect(page.locator('nav a[href="/register"]')).toBeVisible();
    await expect(page.locator('nav a[href="/login"]')).toBeVisible();
    await expect(page).toHaveTitle('Guaji AI（guajiguaji）｜AI 口语练习应用');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});

test('React keeps one homepage and localized contact while pricing remains pending', async ({ page }, testInfo) => {
  const english = testInfo.project.use.locale === 'en-US';
  await page.addInitScript(language => {
    localStorage.setItem('ui_language', language);
  }, english ? 'en' : 'zh');
  await page.route('**/api/stripe/products-with-prices', () => {});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const contact = page.locator('footer a[href="mailto:admin@guajiguaji.top"]');
  await expect(contact).toHaveCount(1);
  await expect(contact).toHaveText(`${english ? 'Official contact:' : '官方联系：'} admin@guajiguaji.top`);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), testInfo.project.use.colorScheme === 'dark');
  const picker = page.getByLabel('Switch language / 切换语言');
  for (const language of ['en', 'ja', 'es', 'fr', 'ko', 'de', 'pt', 'ru', 'zh']) {
    await picker.selectOption(language);
    await expect(page).toHaveTitle(/Guaji AI.*guajiguaji/);
    await expect(contact).toBeVisible();
    const schema = await page.locator('#homepage-structured-data').textContent();
    const graph = JSON.parse(schema)['@graph'];
    expect(graph.find(item => item['@type'] === 'WebSite').inLanguage).toBe(language === 'zh' ? 'zh-CN' : language);
    expect(graph.find(item => item['@type'] === 'Organization').email).toBe('admin@guajiguaji.top');
    for (const question of graph.find(item => item['@type'] === 'FAQPage').mainEntity) {
      await expect(page.getByRole('heading', { name: question.name, level: 3, exact: true })).toBeVisible();
      await expect(page.getByText(question.acceptedAnswer.text, { exact: true })).toBeVisible();
    }
  }
  await picker.selectOption(english ? 'en' : 'zh');
  await expect(contact).toHaveText(`${english ? 'Official contact:' : '官方联系：'} admin@guajiguaji.top`);
  await contact.focus();
  await expect(contact).toBeFocused();
  expect((await contact.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
  await page.locator('footer').screenshot({ path: testInfo.outputPath('homepage-contact.png') });
});

test('nginx serves canonical homepage, noindex deep links and real 404s', async ({ request }) => {
  for (const headers of [
    { Host: 'www.guajiguaji.top', 'X-Forwarded-Proto': 'https' },
    { Host: 'guajiguaji.top', 'X-Forwarded-Proto': 'http' },
  ]) {
    const response = await request.get('/?utm_source=seo-test', { headers, maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe('https://guajiguaji.top/?utm_source=seo-test');
  }
  const root = await request.get('/', { headers: { Host: 'guajiguaji.top', 'X-Forwarded-Proto': 'https' }, maxRedirects: 0 });
  expect(root.status()).toBe(200);
  expect(root.headers()['content-security-policy']).toContain("default-src 'self'");
  const publicHtml = await root.text();
  expect(publicHtml).toContain('data-prerendered-homepage="true"');
  expect(publicHtml).toContain('content="index,follow"');
  expect(publicHtml).toContain('rel="canonical" href="https://guajiguaji.top/"');
  for (const route of ['/login', '/register', '/discovery', '/conversation', '/history/session-123', '/subscription/success', '/developer/authorize']) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    const html = await response.text();
    expect(html, route).toContain('<div id="root"></div>');
    expect(html, route).toContain('content="noindex,nofollow"');
    expect(html, route).not.toContain('type="application/ld+json"');
    expect(html, route).not.toContain('data-prerendered-homepage');
  }
  for (const route of ['/not-a-real-page', '/homepage.html', '/static/js/missing.js', '/missing-image.png', '/sitemap-missing.xml']) {
    expect((await request.get(route)).status(), route).toBe(404);
  }
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap: https://guajiguaji.top/sitemap.xml');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('xml');
  expect(await sitemap.text()).toContain('<loc>https://guajiguaji.top/</loc>');
  for (const asset of [...publicHtml.matchAll(/(?:src|href)="(\/static\/[^"\s]+)"/g)].map(match => match[1])) {
    expect((await request.get(asset)).status(), asset).toBe(200);
  }
});
