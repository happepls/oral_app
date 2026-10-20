import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requireTestKeys, subscriptionDeliveries } from './stripe-clock-audit.mjs';

test('billing rehearsal rejects live, mixed, missing, and malformed keys before actions', () => {
  for (const env of [
    {}, { STRIPE_SECRET_KEY: 'sk_live_placeholder', STRIPE_PUBLISHABLE_KEY: 'pk_live_placeholder' },
    { STRIPE_SECRET_KEY: 'sk_test_placeholder', STRIPE_PUBLISHABLE_KEY: 'pk_live_placeholder' },
    { STRIPE_SECRET_KEY: 'not-a-key', STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder' },
  ]) assert.throws(() => requireTestKeys(env), /TEST keys/);
  for (const secret of ['sk_test_placeholder', 'rk_test_placeholder']) {
    assert.doesNotThrow(() => requireTestKeys({ STRIPE_SECRET_KEY: secret, STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder' }));
  }
});

test('billing environment isolates volumes, hostname, credentials, and upstreams', () => {
  const compose = fs.readFileSync(new URL('../docker-compose.stripe-audit.yml', import.meta.url), 'utf8');
  const nginx = fs.readFileSync(new URL('../deploy/stripe-audit.nginx.conf', import.meta.url), 'utf8');
  assert.match(compose, /127\.0\.0\.1:5510:80/);
  assert.match(compose, /127\.0\.0\.1:5532:3000/);
  assert.match(compose, /oral_app_stripe_audit/);
  assert.match(compose, /stripe_audit_pg:/);
  assert.doesNotMatch(compose, /env_file:|container_name:|external:|npm (?:install|ci)/);
  assert.doesNotMatch(nginx, /guajiguaji\.top|https:\/\//);
  assert.match(nginx, /location \/api\/ \{ return 503; \}/);
});

test('webhook evidence requires successful test events for this subscription', () => {
  const types = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];
  const events = types.map((type, i) => ({ id: `evt_audit${i}`, type, livemode: false, data: { object: { id: 'sub_audit' } } }));
  const line = (id, status = 200) => `[${status}] POST http://127.0.0.1:5532/api/stripe/webhook [${id}]`;
  const log = events.map(event => line(event.id)).join('\n');
  assert.equal(subscriptionDeliveries(log, events, 'sub_audit').deliveries.length, 3);
  assert.throws(() => subscriptionDeliveries(log, events, 'sub_other'), /current test subscription/);
  assert.throws(() => subscriptionDeliveries(log, events.map(event => ({ ...event, livemode: true })), 'sub_audit'));
  assert.throws(() => subscriptionDeliveries(line(events[0].id), events, 'sub_audit'));
  assert.throws(() => subscriptionDeliveries(events.map(event => line(event.id, 400)).join('\n'), events, 'sub_audit'));
});
