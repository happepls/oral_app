jest.mock('../stripe/stripeService', () => ({ stripeService: {
  getSubscription: jest.fn(), getUserByCustomerId: jest.fn(),
  updateUserStripeInfoByCustomerId: jest.fn(), updateUserStripeInfo: jest.fn(), getUserByEmail: jest.fn(),
} }));
jest.mock('../stripe/prepaidService', () => ({ prepaidService: {
  fulfill: jest.fn(), close: jest.fn(), refund: jest.fn(), closeSubscriptionCheckout: jest.fn(), status: jest.fn(),
} }));
jest.mock('../models/user', () => ({ findById: jest.fn() }));
jest.mock('../stripe/stripeClient', () => ({ getUncachableStripeClient: jest.fn(), getWebhookSecret: () => 'whsec_offline_tests' }));
const Stripe = require('stripe');
const { getUncachableStripeClient } = require('../stripe/stripeClient');
const { prepaidService } = require('../stripe/prepaidService');
const { stripeService } = require('../stripe/stripeService');
const { WebhookHandlers } = require('../stripe/webhookHandlers');
const express = require('express');

const stripe = new Stripe('sk_test_offline');
function signed(type, object, created = 100) {
  const payload = Buffer.from(JSON.stringify({ id: `evt_${created}`, type, created, data: { object } }));
  const signature = stripe.webhooks.generateTestHeaderString({ payload: payload.toString(), secret: 'whsec_offline_tests' });
  return { payload, signature };
}
beforeEach(() => { jest.clearAllMocks(); getUncachableStripeClient.mockResolvedValue(stripe); });

test('official SDK rejects invalid signatures and pre-parsed bodies', async () => {
  await expect(WebhookHandlers.processWebhook({}, 'signature')).rejects.toThrow('Buffer');
  const { payload } = signed('checkout.session.completed', {});
  await expect(WebhookHandlers.processWebhook(payload, 'bad-signature')).rejects.toThrow();
  expect(prepaidService.fulfill).not.toHaveBeenCalled();
});

test('old unpaid completion snapshot cannot backdate a later confirmed payment', async () => {
  const old = signed('checkout.session.completed', { id: 'cs_one', mode: 'payment', payment_status: 'unpaid' }, 100);
  const success = signed('checkout.session.async_payment_succeeded', { id: 'cs_one', mode: 'payment', payment_status: 'paid' }, 300);
  await WebhookHandlers.processWebhook(success.payload, success.signature);
  await WebhookHandlers.processWebhook(old.payload, old.signature);
  expect(prepaidService.fulfill.mock.calls).toEqual([['cs_one', 300]]);
});

test('subscription checkout waits for verified Stripe status and preserves its raw source', async () => {
  stripeService.getSubscription.mockResolvedValue({ id: 'sub_one', customer: 'cus_one', status: 'incomplete' });
  stripeService.updateUserStripeInfoByCustomerId.mockResolvedValue({ id: 'user_one' });
  const { payload, signature } = signed('checkout.session.completed', {
    id: 'cs_one', mode: 'subscription', customer: 'cus_one', subscription: 'sub_one', payment_status: 'paid',
  });
  await WebhookHandlers.processWebhook(payload, signature);
  expect(stripeService.updateUserStripeInfoByCustomerId).toHaveBeenCalledWith('cus_one',
    expect.objectContaining({ subscriptionStatus: 'free', stripeSubscriptionStatus: 'incomplete' }));
});

test('real HTTP route preserves raw signed bytes before JSON middleware', async () => {
  const app = express();
  app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try { await WebhookHandlers.processWebhook(req.body, req.headers['stripe-signature']); res.sendStatus(200); }
    catch { res.sendStatus(400); }
  });
  app.use(express.json());
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const { payload, signature } = signed('checkout.session.expired', { id: 'cs_one' });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': signature }, body: payload,
    });
    expect(response.status).toBe(200);
    expect(prepaidService.close).toHaveBeenCalledWith({ id: 'cs_one' }, 'expired');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('order status authenticates Cookie and Bearer and scopes reads to the signed user', async () => {
  const jwt = require('jsonwebtoken');
  const User = require('../models/user');
  process.env.JWT_SECRET = 'offline-auth-test-secret';
  User.findById.mockResolvedValue({ id: 'owner' });
  stripeService.getUserById = jest.fn().mockResolvedValue({ id: 'owner', stripe_subscription_status: 'free' });
  prepaidService.status.mockImplementation(async (id, session) => {
    if (id !== 'owner' || session !== 'cs_owned') throw Object.assign(new Error('Order not found'), { status: 404 });
    return { status: 'pending' };
  });
  const app = express();
  app.use(require('cookie-parser')());
  app.use('/stripe', require('../stripe/stripeRoutes'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/stripe/checkout`;
    const token = jwt.sign({ id: 'owner' }, process.env.JWT_SECRET);
    for (const headers of [{ Cookie: `accessToken=${token}` }, { Authorization: `Bearer ${token}` }]) {
      expect((await fetch(`${url}/cs_owned/status`, { headers })).status).toBe(200);
      expect((await fetch(`${url}/cs_other/status`, { headers })).status).toBe(404);
    }
    expect((await fetch(`${url}/cs_owned/status`)).status).toBe(401);
    expect(prepaidService.status).toHaveBeenCalledWith('owner', 'cs_owned');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
