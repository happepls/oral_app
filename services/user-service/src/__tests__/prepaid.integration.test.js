// Real PostgreSQL locks and transactions in a disposable schema. Stripe is
// simulated at its API boundary; no real charges or customer creation occurs.
jest.mock('../models/db', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
const { Pool } = require('pg');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { PrepaidService } = require('../stripe/prepaidService');
const { membership } = require('../stripe/membership');
const User = require('../models/user');
const db = require('../models/db');
const integration = process.env.PREPAID_TEST_DATABASE_URL ? describe : describe.skip;

integration('prepaid SQL fulfillment', () => {
  const schema = `prepaid_test_${randomUUID().replaceAll('-', '')}`;
  let pool, admin, service, userId, sessions, stripe;
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.PREPAID_TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: process.env.PREPAID_TEST_DATABASE_URL, options: `-c search_path=${schema}`, max: 8 });
    const sql = fs.readFileSync(path.join(__dirname, '../../init.sql'), 'utf8');
    await pool.query(sql.slice(0, sql.indexOf('-- Create the user_identities table')));
    await pool.query('CREATE TABLE user_identities (user_id UUID, provider TEXT, provider_uid TEXT)');
    db.query.mockImplementation((...args) => pool.query(...args));
    db.pool.connect.mockImplementation(() => pool.connect());
    const migration = fs.readFileSync(path.join(__dirname, '../../migrations/20261007_prepaid_memberships.sql'), 'utf8');
    await pool.query(migration);
    await pool.query(migration); // Reapplying must not reset granted terms.
    process.env.STRIPE_PREPAID_ENABLED = 'true';
  });
  afterAll(async () => {
    delete process.env.STRIPE_PREPAID_ENABLED;
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE prepaid_orders,prepaid_refunds,users CASCADE');
    userId = randomUUID();
    // Use the real new-user defaults: this catches NULL-source expiry leaks.
    await pool.query("INSERT INTO users(id,username,stripe_customer_id) VALUES ($1,'test','cus_test')", [userId]);
    sessions = new Map();
    const price = { id: 'price_week', active: true, currency: 'usd', unit_amount: 499, livemode: false,
      recurring: { interval: 'week', interval_count: 1 }, product: { id: 'prod_app', active: true, metadata: { app: 'guaji_ai', tier: 'weekly' } } };
    stripe = {
      prices: { retrieve: jest.fn(async () => price) },
      paymentMethodConfigurations: { list: jest.fn(async () => ({ data: [{ active: true, is_default: true, alipay: { available: true, display_preference: { value: 'on' } } }] })) },
      checkout: { sessions: {
        create: jest.fn(async params => {
          // Stripe validates expiration on receipt, after reservation/network delay.
          expect(params.expires_at - (Math.floor(Date.now() / 1000) + 2)).toBeGreaterThanOrEqual(1800);
          const session = { id: `cs_${params.metadata.orderId}`, url: 'https://checkout.stripe.com/test', status: 'open',
            mode: params.mode, metadata: params.metadata, customer: params.customer, currency: 'usd', livemode: false,
            amount_subtotal: 499, amount_total: 499, payment_status: 'paid', payment_intent: { id: `pi_${params.metadata.orderId}` },
            line_items: { data: [{ quantity: 1, price: { unit_amount: 499, currency: 'usd' } }] } };
          sessions.set(session.id, session); return session;
        }),
        retrieve: jest.fn(async id => sessions.get(id)),
        expire: jest.fn(async id => {
          const session = sessions.get(id);
          if (session.status !== 'open') throw new Error('Session is not open');
          session.status = 'expired'; session.url = null;
          return session;
        }),
      } },
      paymentIntents: { retrieve: jest.fn(async id => ({ metadata: [...sessions.values()].find(s => s.payment_intent.id === id).metadata })) },
    };
    service = new PrepaidService({ pool, query: (...args) => pool.query(...args) }, async () => stripe);
  });
  async function checkout(key = randomUUID(), mode = 'prepaid', replacePending = false) {
    const user = (await pool.query('SELECT * FROM users WHERE id=$1', [userId])).rows[0];
    return service.createCheckout({ user, priceId: 'price_week', mode, requestKey: key, baseUrl: 'http://localhost:5001', replacePending });
  }
  async function snapshot() { return (await pool.query('SELECT * FROM users WHERE id=$1', [userId])).rows[0]; }

  test('payment uses one-time price data and concurrent fulfillments grant only seven days', async () => {
    const key = randomUUID();
    const purchase = await checkout(key);
    expect((await checkout(key)).sessionId).toBe(purchase.sessionId);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params.mode).toBe('payment');
    expect(params.line_items[0].price).toBeUndefined();
    expect(params.line_items[0].price_data.unit_amount).toBe(499);
    expect(params.payment_method_types).toBeUndefined();
    const paid = Date.parse('2026-10-07T12:00:00Z') / 1000;
    await Promise.all([service.fulfill(purchase.sessionId, paid), service.fulfill(purchase.sessionId, paid)]);
    const user = await snapshot();
    expect(user.prepaid_expires_at.toISOString()).toBe('2026-10-14T12:00:00.000Z');
    expect(user.stripe_subscription_id).toBeNull();
    expect((await service.status(userId, purchase.sessionId)).status).toBe('fulfilled');
    expect((await User.findById(userId)).billing_source).toBe(membership(user).billing_source);
    expect(membership(user, Date.parse('2026-10-14T12:00:00Z')).subscription_status).toBe('free');
    await expect(service.status(randomUUID(), purchase.sessionId)).rejects.toMatchObject({ status: 404 });
  });

  test.each(['currency','livemode','user','amount'])('tampered %s is rejected without granting time', async field => {
    const purchase = await checkout();
    const session = sessions.get(purchase.sessionId);
    if (field === 'currency') session.currency = 'eur';
    if (field === 'livemode') session.livemode = true;
    if (field === 'user') session.metadata.userId = randomUUID();
    if (field === 'amount') session.amount_total = 1000;
    await expect(service.fulfill(purchase.sessionId, Date.now() / 1000)).rejects.toThrow('does not match');
    expect((await snapshot()).prepaid_expires_at).toBeNull();
  });

  test('unpaid checkout stays pending; renewal adds time; full refund removes only its grant', async () => {
    const first = await checkout();
    const paid = Date.now() / 1000;
    sessions.get(first.sessionId).payment_status = 'unpaid';
    expect(await service.fulfill(first.sessionId, paid)).toBe(false);
    expect((await snapshot()).prepaid_expires_at).toBeNull();
    sessions.get(first.sessionId).payment_status = 'paid';
    await service.fulfill(first.sessionId, paid);
    const second = await checkout();
    await service.fulfill(second.sessionId, paid + 60);
    expect(new Date((await snapshot()).prepaid_expires_at).getTime()).toBeCloseTo((paid + 14 * 86400) * 1000, -1);
    const charge = { payment_intent: sessions.get(first.sessionId).payment_intent.id, amount: 499,
      amount_refunded: 499, currency: 'usd', livemode: false };
    await Promise.all([service.refund(charge), service.refund(charge)]);
    expect((await service.status(userId, first.sessionId)).status).toBe('refunded');
    expect((await snapshot()).prepaid_expires_at.getTime()).toBeCloseTo((paid + 60 + 7 * 86400) * 1000, -1);
  });

  test('refund before fulfillment prevents a later callback granting time', async () => {
    const purchase = await checkout();
    const charge = { payment_intent: sessions.get(purchase.sessionId).payment_intent.id, amount: 499,
      amount_refunded: 499, currency: 'usd', livemode: false };
    await service.refund(charge);
    await service.fulfill(purchase.sessionId, Date.now() / 1000);
    expect((await snapshot()).prepaid_expires_at).toBeNull();
    expect((await service.status(userId, purchase.sessionId)).status).toBe('refunded');
  });

  test('partial refunds preserve access; concurrent renewal and a subscription cannot mix billing modes', async () => {
    const purchase = await checkout();
    await service.fulfill(purchase.sessionId, Date.now() / 1000);
    await service.refund({ payment_intent: sessions.get(purchase.sessionId).payment_intent.id,
      amount: 499, amount_refunded: 100, currency: 'usd', livemode: false });
    expect((await service.status(userId, purchase.sessionId)).status).toBe('fulfilled');
    await expect(checkout(randomUUID(), 'subscription')).rejects.toThrow('existing membership');
    await pool.query("UPDATE users SET stripe_subscription_status='active' WHERE id=$1", [userId]);
    await expect(checkout()).rejects.toThrow('existing membership');
  });

  test('failed and expired checkout grant no membership and allow a fresh order', async () => {
    const purchase = await checkout();
    await service.close({ id: purchase.sessionId }, 'expired');
    expect((await snapshot()).prepaid_expires_at).toBeNull();
    expect((await checkout()).sessionId).not.toBe(purchase.sessionId);
  });

  test('definitive Stripe rejection releases the reservation; uncertain failures retry exact parameters', async () => {
    stripe.checkout.sessions.create.mockRejectedValueOnce(Object.assign(new Error('expired promotion'), { type: 'StripeInvalidRequestError' }));
    await expect(checkout()).rejects.toMatchObject({ status: 400 });
    expect((await pool.query('SELECT status FROM prepaid_orders')).rows[0].status).toBe('failed');
    const key = randomUUID();
    stripe.checkout.sessions.create.mockRejectedValueOnce(Object.assign(new Error('lost connection'), { type: 'StripeConnectionError' }));
    await expect(checkout(key)).rejects.toThrow('lost connection');
    await checkout(key);
    const calls = stripe.checkout.sessions.create.mock.calls;
    expect(calls[1][0]).toEqual(calls[2][0]);
    expect(calls[1][1]).toEqual(calls[2][1]);
  });

  test('deliberately switching payment methods expires only the old unpaid checkout', async () => {
    const first = await checkout();
    sessions.get(first.sessionId).payment_status = 'unpaid';
    await expect(checkout(randomUUID(), 'subscription')).rejects.toMatchObject({ status: 409 });
    const second = await checkout(randomUUID(), 'subscription', true);
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith(first.sessionId);
    expect((await service.status(userId, first.sessionId)).status).toBe('expired');
    expect((await service.status(userId, second.sessionId)).status).toBe('pending');
    expect((await snapshot()).prepaid_expires_at).toBeNull();
    expect(stripe.checkout.sessions.create.mock.calls[1][0].mode).toBe('subscription');
  });

  test('expired Stripe sessions are reconciled even without their webhook', async () => {
    const first = await checkout();
    sessions.get(first.sessionId).status = 'expired';
    const second = await checkout(randomUUID(), 'subscription', true);
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect((await service.status(userId, first.sessionId)).status).toBe('expired');
  });

  test('reopening the same pending purchase reuses its Stripe session', async () => {
    const first = await checkout();
    expect((await checkout(randomUUID(), 'prepaid', true)).sessionId).toBe(first.sessionId);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
  });

  test.each(['complete', 'open'])('a paid %s session cannot be replaced', async status => {
    const first = await checkout();
    sessions.get(first.sessionId).status = status;
    await expect(checkout(randomUUID(), 'subscription', true)).rejects.toMatchObject({ status: 409, code: 'CHECKOUT_PROCESSING' });
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect((await service.status(userId, first.sessionId)).status).toBe('pending');
  });

  test('a failed expiration retains the reservation and does not create another checkout', async () => {
    const first = await checkout();
    sessions.get(first.sessionId).payment_status = 'unpaid';
    stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error('lost connection'));
    await expect(checkout(randomUUID(), 'subscription', true)).rejects.toThrow('lost connection');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect((await service.status(userId, first.sessionId)).status).toBe('pending');
  });
});
