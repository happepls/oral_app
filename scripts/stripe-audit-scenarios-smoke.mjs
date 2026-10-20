// Opt-in real model/browser check. Creates only a new isolated smoke account.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { origin } from './stripe-clock-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'quality/artifacts/stripe-clock-audit');
const requireClient = createRequire(path.join(root, 'client/package.json'));
const { chromium } = requireClient('playwright');
const id = Date.now();
const login = { username: `scene_smoke_${id}`, email: `scene-smoke-${id}@example.test`, password: `Smoke!9${crypto.randomBytes(16).toString('hex')}` };
let browser;
try {
  const registration = await fetch('http://127.0.0.1:5510/api/users/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(login),
  });
  if (registration.status !== 201) throw Error('Isolated smoke registration failed');
  browser = await chromium.launch({ headless: true,
    ...(fs.existsSync('/Applications/Google Chrome.app') ? { channel: 'chrome' } : {}),
    args: ['--host-resolver-rules=MAP billing-audit.localhost 127.0.0.1'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  await page.locator('#login-email').fill(login.email);
  await page.locator('#login-password').fill(login.password);
  const loggedIn = page.waitForResponse(r => r.url().endsWith('/api/users/login') && r.request().method() === 'POST');
  await page.locator('form#login-panel-email button[type=submit]').click();
  if ((await loggedIn).status() !== 200) throw Error('Browser login failed');
  await page.waitForURL(url => url.pathname !== '/login');
  await page.goto(`${origin}/goal-setting`, { waitUntil: 'networkidle' });
  await page.locator('button').last().click(); // Intro -> language.
  await page.locator('button').last().click(); // Language -> quiz.
  for (const choice of ['几乎不接触，靠课本/应试', '从来不说，太怕尴尬了', '沉默或摆手，完全不知道说啥', '问路或乘坐公共交通']) {
    await page.getByRole('button', { name: new RegExp(choice) }).click();
    await page.locator('button').last().click();
  }
  const responseReady = page.waitForResponse(r => r.url().endsWith('/api/v1/ai/scenarios') && r.request().method() === 'POST', { timeout: 60000 });
  await page.getByRole('button', { name: '生成场景' }).click();
  const response = await responseReady;
  const data = await response.json();
  const scenarios = data.data?.scenarios;
  if (response.status() !== 200 || scenarios?.length !== 10 || scenarios.some(s => s.tasks.length !== 3)) throw Error('Browser generation failed');
  await page.getByText('AI 已为你生成 10 个专属场景，可自由编辑').waitFor();
  // Text mounts before Framer Motion finishes entering; capture the settled UI.
  await page.waitForFunction(() => {
    const heading = [...document.querySelectorAll('h2')].find(el => el.textContent === '练习场景');
    if (!heading) return false;
    for (let el = heading; el; el = el.parentElement) {
      if (Number(getComputedStyle(el).opacity) < 0.99) return false;
    }
    return true;
  });
  await page.screenshot({ path: path.join(output, 'scenario-wizard-generated.png'), fullPage: true });
  const savedReady = page.waitForResponse(r => /\/api\/(users|v1)\/goals$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: '确认开始' }).click();
  const saved = await savedReady;
  if (saved.status() !== 201 && saved.status() !== 200) throw Error('Goal save failed');
  await page.waitForURL(url => url.pathname === '/discovery');
  const snapshot = await page.evaluate(async () => {
    const response = await fetch('/api/v1/goals/active', { credentials: 'include' });
    const body = await response.json();
    return { status: response.status, count: body.data?.goal?.scenarios?.length,
      taskCounts: body.data?.goal?.scenarios?.map(s => s.tasks.length) };
  });
  if (snapshot.status !== 200 || snapshot.count !== 10 || snapshot.taskCounts.some(n => n !== 3)) throw Error('Saved snapshot mismatch');
  const report = { checked_utc: new Date().toISOString(), origin, login_http: 200, generation_http: response.status(),
    scenario_count: scenarios.length, task_counts: scenarios.map(s => s.tasks.length), save_http: saved.status(),
    snapshot_http: snapshot.status, snapshot_scenario_count: snapshot.count, landing: '/discovery',
    primary_audit_account_modified: false, result: 'passed' };
  fs.writeFileSync(path.join(output, 'scenario-browser-smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error('Scenario browser smoke failed; no credentials or request body printed.');
  process.exitCode = 1;
} finally { if (browser) await browser.close(); }
