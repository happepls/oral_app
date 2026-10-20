// Real Stripe TEST events -> Stripe CLI -> unchanged application webhook.
// Never loads the repository .env into the application or shares live volumes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireUser = createRequire(path.join(root, 'services/user-service/package.json'));
const dotenv = requireUser('dotenv');
const Stripe = requireUser('stripe');
const directory = path.join(root, 'quality/artifacts/stripe-clock-audit');
const privateDir = path.join(directory, 'private');
const envFile = path.join(privateDir, '.env');
const project = 'oral-stripe-audit';
export const origin = 'http://billing-audit.localhost:5510';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function requireTestKeys(env) {
  if (!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || '') || !/^pk_test_/.test(env.STRIPE_PUBLISHABLE_KEY || '')) {
    throw new Error('Refusing Stripe audit: both keys must be TEST keys');
  }
}
export function subscriptionDeliveries(log, events, subscriptionId) {
  const matching = events.filter(event => event.livemode === false && event.data?.object?.id === subscriptionId);
  const ids = new Set(matching.map(event => event.id));
  const deliveries = [...log.matchAll(/\[([245]\d\d)\] POST[^\n]*(evt_[A-Za-z0-9]+)/g)]
    .map(match => ({ status: Number(match[1]), event: match[2] })).filter(delivery => ids.has(delivery.event));
  for (const type of ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']) {
    if (!matching.some(event => event.type === type && deliveries.some(delivery => delivery.event === event.id && delivery.status === 200))) {
      throw new Error('Missing successful webhook delivery for the current test subscription');
    }
  }
  return { event_ids: [...ids], deliveries };
}
function privateWrite(name, value) {
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateDir, 0o700);
  fs.writeFileSync(path.join(privateDir, name), value, { mode: 0o600 });
  fs.chmodSync(path.join(privateDir, name), 0o600);
}
function saveEnv(env) {
  privateWrite('.env', Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}
function command(command, args, input) {
  const result = spawnSync(command, args, { cwd: root, input, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error(`${command} failed; inspect the isolated environment locally`);
  return result.stdout;
}
function compose(args, input) {
  return command('docker', ['compose', '-p', project, '--env-file', envFile, '-f', 'docker-compose.stripe-audit.yml', ...args], input);
}
async function sql(text, values = []) {
  // Database credentials stay inside the container; SQL travels on stdin.
  const program = "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',async()=>{const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});try{if((await p.query('SELECT current_database() AS name')).rows[0].name!=='oral_app_stripe_audit')throw Error('wrong database');const q=JSON.parse(s);console.log(JSON.stringify((await p.query(q.text,q.values)).rows));}finally{await p.end()}})";
  return JSON.parse(compose(['exec', '-T', 'user-service', 'node', '-e', program], JSON.stringify({ text, values })));
}
async function request(route, { body, cookie } = {}) {
  const response = await fetch(`http://127.0.0.1:5510${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Host: 'billing-audit.localhost', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  });
  let data = null;
  try { data = await response.json(); } catch { /* error status remains authoritative */ }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function until(check, description, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; } catch { /* bounded startup/event propagation */ }
    await sleep(1000);
  }
  throw new Error(`Timed out: ${description}`);
}
function listenerRunning() {
  const marker = path.join(privateDir, 'listener.json');
  if (!fs.existsSync(marker)) return false;
  const { pid } = JSON.parse(fs.readFileSync(marker));
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.includes('stripe listen') && result.stdout.includes('127.0.0.1:5532');
}
async function start() {
  const source = dotenv.parse(fs.readFileSync(path.join(root, 'services/user-service/.env')));
  requireTestKeys(source);
  if (!fs.existsSync(path.join(root, 'client/build/index.html'))) throw new Error('Build client on host first');
  const env = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {
    AUDIT_DB_PASSWORD: crypto.randomBytes(24).toString('hex'),
    AUDIT_JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    AUDIT_INTERNAL_SECRET: crypto.randomBytes(32).toString('hex'),
    AUDIT_DELEGATED_SECRET: crypto.randomBytes(32).toString('hex'),
  };
  if (env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY !== source.STRIPE_SECRET_KEY) throw new Error('Audit key changed; use a separate audit directory/volume');
  Object.assign(env, { STRIPE_SECRET_KEY: source.STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY: source.STRIPE_PUBLISHABLE_KEY });
  // Only the public DashScope credential is needed for isolated text scenarios.
  // Do not import production DB/JWT, dedicated endpoints, or other provider keys.
  const rootEnvFile = path.join(root, '.env');
  const aiKey = fs.existsSync(rootEnvFile) ? dotenv.parse(fs.readFileSync(rootEnvFile)).QWEN3_OMNI_API_KEY : null;
  if (aiKey) env.AUDIT_QWEN_API_KEY = aiKey;
  requireTestKeys(env);
  saveEnv(env);
  if (!listenerRunning()) {
    // A host-local proxy can break the Go CLI although the Node SDK works.
    // This process alone uses a direct connection; no global configuration changes.
    const cliEnv = { ...process.env, STRIPE_API_KEY: env.STRIPE_SECRET_KEY };
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete cliEnv[key];
    const log = path.join(privateDir, 'stripe-listener.log');
    const fd = fs.openSync(log, 'w', 0o600);
    const listener = spawn('stripe', ['listen', '--skip-update', '--forward-to', 'http://127.0.0.1:5532/api/stripe/webhook', '--events', 'customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.payment_failed'], {
      env: cliEnv, detached: true, stdio: ['ignore', fd, fd],
    });
    listener.on('error', () => {});
    listener.unref(); fs.closeSync(fd);
    privateWrite('listener.json', JSON.stringify({ pid: listener.pid }));
    env.STRIPE_WEBHOOK_SECRET = await until(() => fs.readFileSync(log, 'utf8').match(/whsec_[A-Za-z0-9]+/)?.[0], 'Stripe CLI listener ready', 45000);
    saveEnv(env);
  }
  const scenariosEnabled = Boolean(env.AUDIT_QWEN_API_KEY);
  compose([...(scenariosEnabled ? ['--profile', 'scenarios'] : []), 'up', '-d', '--wait', '--wait-timeout', '90']);
  await until(async () => (await request('/api/users/profile')).status === 401, 'isolated auth endpoint');
  const loginFile = path.join(privateDir, 'login.json');
  let createdLogin = false;
  if (!fs.existsSync(loginFile)) {
    const login = { username: 'stripe_audit', email: 'stripe-audit@example.test', password: `Audit!9${crypto.randomBytes(16).toString('hex')}` };
    const created = await request('/api/users/register', { body: login });
    if (created.status !== 201) throw new Error(`Isolated registration failed: ${created.status}`);
    privateWrite('login.json', JSON.stringify({ ...login, userId: created.data.data.user.id }, null, 2) + '\n');
    createdLogin = true;
  }
  const login = JSON.parse(fs.readFileSync(loginFile));
  if (createdLogin) await sql("UPDATE users SET nickname='Stripe Audit',native_language='Chinese',target_language='English',onboarding_tour_completed=true WHERE id=$1", [login.userId]);
  const auth = await request('/api/users/login', { body: { email: login.email, password: login.password } });
  if (auth.status !== 200 || !auth.cookie) throw new Error('Isolated cookie login failed');
  const health = { origin, login_verified: true, stripe_mode: 'test', listener_ready: listenerRunning(), credentials_file: path.relative(root, loginFile), scenarios_enabled: scenariosEnabled };
  fs.writeFileSync(path.join(directory, 'environment.json'), JSON.stringify(health, null, 2) + '\n');
  console.log(JSON.stringify(health, null, 2));
}

async function rehearse() {
  const env = dotenv.parse(fs.readFileSync(envFile)); requireTestKeys(env);
  if (!listenerRunning()) throw new Error('Start the Stripe CLI listener first');
  const login = JSON.parse(fs.readFileSync(path.join(privateDir, 'login.json')));
  const auth = await request('/api/users/login', { body: { email: login.email, password: login.password } });
  if (auth.status !== 200 || !auth.cookie) throw new Error('Login failed');
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia', timeout: 20000, maxNetworkRetries: 1 });
  const run = `oral-clock-${Date.now()}`;
  const report = { run, started_utc: new Date().toISOString(), stripe_mode: 'test', transport: 'Stripe CLI, actual Stripe events and signatures', checkpoints: [] };
  const reportFile = path.join(directory, `${run}.json`);
  const listenerLog = path.join(privateDir, 'stripe-listener.log');
  const listenerOffset = fs.readFileSync(listenerLog, 'utf8').length;
  const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  const effective = async () => {
    const [profile, subscription, pro] = await Promise.all([
      request('/api/users/profile', { cookie: auth.cookie }), request('/api/stripe/subscription', { cookie: auth.cookie }),
      request('/api/users/access/check', { cookie: auth.cookie, body: { operation: 'pro' } }),
    ]);
    return { profile, subscription, pro };
  };
  const checkpoint = async (name, member) => {
    const observed = await until(async () => {
      const x = await effective();
      return x.profile.status === 200 && x.subscription.status === 200 && x.pro.status === (member ? 200 : 403)
        && x.profile.data.data.user.subscription_status === (member ? 'active' : 'canceled')
        && x.subscription.data.status === (member ? 'active' : 'canceled')
        && x.pro.data.access?.membership?.active === member ? x : false;
    }, name);
    const user = observed.profile.data.data.user;
    report.checkpoints.push({ name, utc: new Date().toISOString(), stripe_status: user.stripe_subscription_status,
      effective_status: user.subscription_status, source: user.billing_source, profile_http: observed.profile.status,
      subscription_http: observed.subscription.status, subscription_effective_status: observed.subscription.data.status,
      pro_http: observed.pro.status }); save();
  };
  let product, browser, page;
  const capture = async stage => {
    if (!page) return;
    for (const route of ['profile', 'subscription']) {
      await page.goto(`${origin}/${route}`, { waitUntil: 'networkidle' });
      if (new URL(page.url()).pathname === '/login') throw new Error('Browser lost its isolated login');
      await page.screenshot({ path: path.join(directory, `${run}-${stage}-${route}.png`), fullPage: true });
    }
  };
  try {
    if (process.env.STRIPE_AUDIT_CAPTURE_BROWSER === 'true') {
      const requireClient = createRequire(path.join(root, 'client/package.json'));
      const { chromium } = requireClient('playwright');
      browser = await chromium.launch({ headless: true,
        ...(fs.existsSync('/Applications/Google Chrome.app') ? { channel: 'chrome' } : {}),
        args: ['--host-resolver-rules=MAP billing-audit.localhost 127.0.0.1'] });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      // Prevent the prebuilt client from contacting any non-audit service.
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      page = await context.newPage();
      await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
      await page.locator('#login-email').fill(login.email);
      await page.locator('#login-password').fill(login.password);
      const loggedIn = page.waitForResponse(r => r.url().endsWith('/api/users/login') && r.request().method() === 'POST');
      await page.locator('form#login-panel-email button[type=submit]').click();
      if ((await loggedIn).status() !== 200) throw new Error('Browser login failed');
      await page.waitForURL(url => url.pathname !== '/login');
      report.browser_login = 'actual form and httpOnly cookie'; save();
    }
    // Create an entirely new test customer attached to this test clock.
    const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: run });
    report.clock = clock.id; save();
    const customer = await stripe.customers.create({ test_clock: clock.id, metadata: { audit_run: run } });
    if (customer.livemode !== false) throw new Error('Live customer rejected');
    report.customer = customer.id; save();
    await sql('UPDATE users SET stripe_customer_id=$2,stripe_subscription_id=NULL,stripe_subscription_status=\'free\',subscription_status=\'free\',prepaid_expires_at=NULL WHERE id=$1', [login.userId, customer.id]);
    const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    product = await stripe.products.create({ name: `Isolated billing audit ${run}`, metadata: { audit_run: run } });
    const price = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: 100, recurring: { interval: 'month' }, metadata: { audit_run: run } });
    report.product = product.id; report.price = price.id; save();
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: price.id }], metadata: { audit_run: run } });
    if (sub.livemode !== false || sub.status !== 'active') throw new Error('Test subscription did not become active');
    report.subscription = sub.id; save();
    // No local status write: the real subscription.created webhook must grant access.
    await checkpoint('active_subscription_via_webhook', true);
    await capture('active');
    await sql("UPDATE users SET prepaid_expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1", [login.userId]);
    await checkpoint('prepaid_expired_subscription_active', true);
    await sql('UPDATE users SET prepaid_expires_at=NULL WHERE id=$1', [login.userId]);
    const canceled = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    if (!canceled.cancel_at_period_end) throw new Error('Cancellation not scheduled');
    const periodEnd = canceled.items.data[0].current_period_end;
    if (!Number.isInteger(periodEnd)) throw new Error('Missing billing period end');
    report.period_end_utc = new Date(periodEnd * 1000).toISOString(); save();
    await checkpoint('scheduled_cancel_still_member', true);
    console.log('Real Stripe subscription active; advancing its test clock to period end.');
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: periodEnd - 1 });
    await until(async () => (await stripe.testHelpers.testClocks.retrieve(clock.id)).status === 'ready', 'clock before period end', 120000);
    if ((await stripe.subscriptions.retrieve(sub.id)).status !== 'active') throw new Error('Subscription canceled early');
    await checkpoint('one_second_before_period_end', true);
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: periodEnd + 1 });
    await until(async () => (await stripe.testHelpers.testClocks.retrieve(clock.id)).status === 'ready', 'clock after period end', 120000);
    await until(async () => (await stripe.subscriptions.retrieve(sub.id)).status === 'canceled', 'Stripe canceled subscription');
    await checkpoint('period_ended_downgraded_by_webhook', false);
    await capture('canceled');
    await sql("UPDATE users SET prepaid_expires_at=NOW()+INTERVAL '1 hour' WHERE id=$1", [login.userId]);
    await checkpoint('subscription_canceled_prepaid_active', true);
    await sql("UPDATE users SET prepaid_expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1", [login.userId]);
    await checkpoint('both_sources_inactive', false);
    const relogin = await request('/api/users/login', { body: { email: login.email, password: login.password } });
    if (relogin.status !== 200 || relogin.data.data.user.subscription_status !== 'canceled') throw new Error('Relogin did not restore downgraded membership');
    report.relogin_http = relogin.status;
    const retrievedEvents = new Map();
    Object.assign(report, await until(async () => {
      const log = fs.readFileSync(listenerLog, 'utf8').slice(listenerOffset);
      for (const id of new Set(log.match(/evt_[A-Za-z0-9]+/g) || [])) {
        if (!retrievedEvents.has(id)) retrievedEvents.set(id, await stripe.events.retrieve(id));
      }
      return subscriptionDeliveries(log, [...retrievedEvents.values()], report.subscription);
    }, 'current subscription webhook delivery evidence'));
    report.result = 'passed'; report.completed_utc = new Date().toISOString(); save();
    console.log(JSON.stringify({ result: report.result, checkpoints: report.checkpoints.length, report: path.relative(root, reportFile), origin }, null, 2));
  } catch (error) {
    report.result = 'failed'; report.failure = error.type ? `Stripe ${error.type}; code=${error.code || 'none'}` : `${error.name || 'Error'}; see private/last-error.json`;
    privateWrite('last-error.json', JSON.stringify({ message: error.message }, null, 2));
    save(); throw error;
  } finally {
    if (browser) await browser.close();
    // Archive only the audit-created catalog; keep canceled clock/customer for inspection.
    if (report.price) await stripe.prices.update(report.price, { active: false }).catch(() => {});
    if (product) await stripe.products.update(product.id, { active: false }).catch(() => {});
  }
}
async function main() {
  const action = process.argv[2];
  if (action === 'start') return start();
  if (action === 'rehearse') return rehearse();
  if (action === 'stop') {
    if (listenerRunning()) process.kill(JSON.parse(fs.readFileSync(path.join(privateDir, 'listener.json'))).pid, 'SIGTERM');
    compose(['--profile', 'scenarios', 'down']); // Retain this project's database volume and private login file.
    console.log('Isolated audit stopped; audit data retained.'); return;
  }
  throw new Error('Usage: node scripts/stripe-clock-audit.mjs start|rehearse|stop');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  // SDK error messages can contain credentials/request bodies. Publish fixed fields only.
  privateWrite('last-error.json', JSON.stringify({ message: error.message }, null, 2));
  console.error(error.type ? `Stripe audit failed: ${error.type}, ${error.code || 'unknown'}` : 'Stripe audit failed; inspect private/last-error.json locally.');
  process.exitCode = 1;
});
