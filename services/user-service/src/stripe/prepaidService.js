const { randomUUID } = require('crypto');
const db = require('../models/db');
const { membership, prepaidExpiry } = require('./membership');
const { getUncachableStripeClient } = require('./stripeClient');

const OFFERS = { weekly: { amount: 499, interval: 'week' }, annual: { amount: 9900, interval: 'year' } };
function billingError(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

class PrepaidService {
  constructor(database = db, getStripe = getUncachableStripeClient) {
    this.db = database;
    this.getStripe = getStripe;
  }

  enabled() { return process.env.STRIPE_PREPAID_ENABLED === 'true'; }

  async validatePrice(stripe, priceId, mode) {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const product = price.product;
    const tier = product?.metadata?.tier;
    const offer = OFFERS[tier];
    if (!price.active || !product?.active || product.metadata?.app !== 'guaji_ai'
      || !offer || price.recurring?.interval !== offer.interval
      || (price.recurring.interval_count || 1) !== 1 || !Number.isSafeInteger(price.unit_amount)
      || price.unit_amount <= 0) throw billingError('Invalid app price', 400);
    if (mode === 'prepaid' && (price.currency !== 'usd' || price.unit_amount !== offer.amount)) {
      throw billingError('Prepaid price configuration does not match the approved offer', 503);
    }
    return { price, tier };
  }

  async offersForProducts(products) {
    if (!this.enabled()) return [];
    const stripe = await this.getStripe();
    const configs = await stripe.paymentMethodConfigurations.list({ limit: 100 });
    // Only the default active configuration is used by these Checkout sessions.
    const available = configs.data.some(config => config.active && config.is_default
      && config.alipay?.available && config.alipay?.display_preference?.value === 'on');
    if (!available) return [];
    return products.flatMap(product => {
      const tier = product.metadata?.tier;
      const offer = OFFERS[tier];
      if (!offer) return [];
      const price = product.prices.find(p => p.active && p.currency === 'usd'
        && p.unit_amount === offer.amount && p.recurring?.interval === offer.interval
        && (p.recurring.interval_count || 1) === 1);
      return price ? [{ tier, priceId: price.id, unit_amount: offer.amount, currency: 'usd',
        term: tier === 'weekly' ? '7_days' : '1_year' }] : [];
    });
  }

  async createCheckout({ user, priceId, mode, requestKey, baseUrl, promoId, replacePending = false }) {
    if (!['subscription', 'prepaid'].includes(mode)) throw billingError('Invalid billing mode', 400);
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestKey)) throw billingError('Invalid checkout request key', 400);
    if (mode === 'prepaid' && !this.enabled()) throw billingError('Prepaid checkout is not enabled', 503);
    const stripe = await this.getStripe();
    const { price, tier } = await this.validatePrice(stripe, priceId, mode);
    if (mode === 'prepaid') {
      const offers = await this.offersForProducts([{ metadata: price.product.metadata, prices: [price] }]);
      if (!offers.length) throw billingError('Alipay is not enabled for this account', 503);
    }
    const client = await this.db.pool.connect();
    let order;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      const current = membership(rows[0]);
      if (!current) throw billingError('User not found', 404);
      const existing = await client.query('SELECT * FROM prepaid_orders WHERE user_id = $1 AND request_key = $2', [user.id, requestKey]);
      order = existing.rows[0];
      if (order && (order.price_id !== priceId || order.billing_mode !== mode)) throw billingError('Checkout key was already used for another purchase');
      if (!order) {
        if (['active', 'trialing', 'incomplete', 'past_due', 'unpaid', 'paused'].includes(current.stripe_subscription_status)
          || (mode === 'subscription' && current.billing_source === 'prepaid')) {
          throw billingError('An existing membership must end before starting this billing mode');
        }
        const pending = await client.query("SELECT * FROM prepaid_orders WHERE user_id=$1 AND status IN ('creating','pending') ORDER BY created_at LIMIT 1", [user.id]);
        order = pending.rows[0];
        if (order && replacePending === true) {
          // Keep the user lock while resolving the previous reservation. Recover
          // ambiguous creates with their original idempotency key before switching.
          let previous = order.checkout_session_id
            ? await stripe.checkout.sessions.retrieve(order.checkout_session_id)
            : await stripe.checkout.sessions.create(order.checkout_params, { idempotencyKey: `checkout:${order.id}` });
          const switching = order.price_id !== priceId || order.billing_mode !== mode;
          if (switching && previous.status === 'open' && previous.payment_status === 'unpaid') {
            previous = await stripe.checkout.sessions.expire(previous.id);
          }
          if (previous.status === 'expired') {
            await client.query("UPDATE prepaid_orders SET checkout_session_id=$2,status='expired' WHERE id=$1 AND status IN ('creating','pending')", [order.id, previous.id]);
            order = null;
          } else if (switching || previous.status !== 'open') {
            throw Object.assign(billingError('An existing checkout is processing; wait for confirmation'), { code: 'CHECKOUT_PROCESSING' });
          } else {
            await client.query("UPDATE prepaid_orders SET checkout_session_id=$2,status='pending' WHERE id=$1 AND status='creating'", [order.id, previous.id]);
            order.checkout_session_id = previous.id;
          }
        }
        if (order && (order.price_id !== priceId || order.billing_mode !== mode)) throw billingError('Another checkout is pending; finish or expire it first');
        if (!order) {
          const id = randomUUID();
          const metadata = { userId: String(user.id), orderId: id, billingMode: mode, tier };
          const params = {
            customer: user.stripe_customer_id,
            mode: mode === 'prepaid' ? 'payment' : 'subscription',
            line_items: [{ quantity: 1, ...(mode === 'prepaid'
              ? { price_data: { currency: price.currency, unit_amount: price.unit_amount, product: price.product.id } }
              : { price: price.id }) }],
            client_reference_id: String(user.id), metadata,
            success_url: `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/subscription/cancel`,
          // Stripe requires at least 30 minutes at receipt, after DB/network latency.
          expires_at: Math.floor(Date.now() / 1000) + 3600,
            ...(mode === 'subscription' ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
            ...(promoId ? { discounts: [{ promotion_code: promoId }] } : { allow_promotion_codes: true }),
          };
          order = (await client.query(`INSERT INTO prepaid_orders
            (id,user_id,request_key,billing_mode,tier,price_id,unit_amount,currency,livemode,customer_id,checkout_params)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [id, user.id, requestKey, mode, tier, priceId, price.unit_amount, price.currency,
            price.livemode, user.stripe_customer_id, JSON.stringify(params)])).rows[0];
        }
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    if (!['creating', 'pending'].includes(order.status)) throw billingError('Checkout is already closed');
    let session;
    if (order.checkout_session_id) session = await stripe.checkout.sessions.retrieve(order.checkout_session_id);
    else {
      // Retry exactly the persisted request if Stripe succeeded before our DB write.
      try {
        session = await stripe.checkout.sessions.create(order.checkout_params, { idempotencyKey: `checkout:${order.id}` });
      } catch (error) {
        if (['StripeInvalidRequestError','StripeAuthenticationError','StripePermissionError'].includes(error.type)) {
          await this.db.query("UPDATE prepaid_orders SET status='failed' WHERE id=$1 AND status='creating'", [order.id]);
          throw billingError('Checkout could not be created; check the offer and retry', 400);
        }
        throw error; // Ambiguous transport failures retain the same idempotency key.
      }
      await this.db.query("UPDATE prepaid_orders SET checkout_session_id=$2,status='pending' WHERE id=$1 AND status='creating'", [order.id, session.id]);
    }
    if (session.status === 'expired') {
      await this.db.query("UPDATE prepaid_orders SET status='expired' WHERE id=$1 AND status IN ('creating','pending')", [order.id]);
      throw billingError('Checkout expired; start a new purchase');
    }
    if (session.status !== 'open' || !session.url) throw billingError('Checkout is processing or completed');
    return { url: session.url, sessionId: session.id };
  }

  async status(userId, sessionId) {
    const { rows } = await this.db.query('SELECT status FROM prepaid_orders WHERE user_id=$1 AND checkout_session_id=$2', [userId, sessionId]);
    if (!rows[0]) throw billingError('Checkout not found', 404);
    return { status: rows[0].status === 'creating' ? 'pending' : rows[0].status };
  }

  async recompute(client, userId) {
    const { rows } = await client.query("SELECT id,tier,paid_at,status FROM prepaid_orders WHERE user_id=$1 AND billing_mode='prepaid' AND status='fulfilled' ORDER BY paid_at,id", [userId]);
    const expiry = prepaidExpiry(rows);
    await client.query(`UPDATE users SET prepaid_expires_at=$2,
      subscription_status=CASE WHEN stripe_subscription_status IN ('active','trialing') OR $2::timestamptz > NOW()
      THEN 'active' ELSE COALESCE(stripe_subscription_status,'free') END WHERE id=$1`, [userId, expiry]);
  }

  async fulfill(sessionId, eventCreated) {
    const stripe = await this.getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items', 'payment_intent'] });
    if (session.metadata?.billingMode !== 'prepaid') throw billingError('Payment has no prepaid order identity');
    if (!['paid', 'no_payment_required'].includes(session.payment_status)) return false;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const orderId = session.metadata.orderId;
      const found = await client.query('SELECT * FROM prepaid_orders WHERE id=$1', [orderId]);
      const order = found.rows[0];
      if (!order) throw billingError('Payment has no app order');
      // All modifications lock user before orders to serialize fulfillment/refunds.
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [order.user_id]);
      const locked = (await client.query('SELECT * FROM prepaid_orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
      const line = session.line_items?.data?.[0];
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      if (session.mode !== 'payment' || session.livemode !== locked.livemode
        || session.metadata.userId !== String(locked.user_id) || customerId !== locked.customer_id
        || session.metadata.tier !== locked.tier || session.currency !== locked.currency
        || session.line_items?.data?.length !== 1 || line.quantity !== 1
        || line.price?.unit_amount !== locked.unit_amount || line.price?.currency !== locked.currency
        || session.amount_subtotal !== locked.unit_amount || !Number.isSafeInteger(session.amount_total)
        || session.amount_total < 0 || session.amount_total > locked.unit_amount
        || (locked.checkout_session_id && locked.checkout_session_id !== session.id)) {
        throw billingError('Payment does not match the app order');
      }
      if (!['fulfilled','refunded'].includes(locked.status)) {
        const intent = session.payment_intent;
        const intentId = typeof intent === 'string' ? intent : intent?.id;
        const paidAt = eventCreated;
        if (!Number.isFinite(paidAt)) throw billingError('Payment timestamp missing');
        const refunds = intentId ? (await client.query('SELECT * FROM prepaid_refunds WHERE payment_intent_id=$1', [intentId])).rows[0] : null;
        const refunded = refunds?.livemode === locked.livemode ? refunds.refunded_amount : 0;
        await client.query(`UPDATE prepaid_orders SET checkout_session_id=$2,payment_intent_id=$3,
          paid_at=to_timestamp($4),amount_paid=$5,refunded_amount=$6,status=$7 WHERE id=$1`,
        [orderId, session.id, intentId, paidAt, session.amount_total, refunded,
          refunded > 0 && refunded >= session.amount_total ? 'refunded' : 'fulfilled']);
        await this.recompute(client, locked.user_id);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async close(session, status) {
    await this.db.query("UPDATE prepaid_orders SET status=$2 WHERE checkout_session_id=$1 AND status IN ('creating','pending')", [session.id, status]);
  }

  async closeSubscriptionCheckout(session, subscriptionStatus) {
    await this.db.query("UPDATE prepaid_orders SET status=$2 WHERE checkout_session_id=$1 AND billing_mode='subscription' AND status IN ('creating','pending')",
      [session.id, subscriptionStatus === 'active' ? 'fulfilled' : 'failed']);
  }

  async refund(charge) {
    const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!intent) return;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize refund-before-fulfillment with fulfillment even before PI linkage exists.
      const stripe = await this.getStripe();
      const payment = await stripe.paymentIntents.retrieve(intent);
      if (payment.metadata?.billingMode !== 'prepaid') { await client.query('COMMIT'); return; }
      const order = (await client.query('SELECT * FROM prepaid_orders WHERE id=$1', [payment.metadata.orderId])).rows[0];
      if (!order || order.livemode !== charge.livemode || charge.currency !== order.currency) throw billingError('Refund order mismatch');
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [order.user_id]);
      await client.query(`INSERT INTO prepaid_refunds(payment_intent_id,refunded_amount,charge_amount,livemode)
        VALUES ($1,$2,$3,$4) ON CONFLICT (payment_intent_id) DO UPDATE
        SET refunded_amount=GREATEST(prepaid_refunds.refunded_amount,EXCLUDED.refunded_amount)`,
      [intent, charge.amount_refunded, charge.amount, charge.livemode]);
      await client.query(`UPDATE prepaid_orders SET refunded_amount=GREATEST(refunded_amount,$2),
        status=CASE WHEN $2 >= amount_paid AND $2 > 0 THEN 'refunded' ELSE status END WHERE id=$1`,
      [order.id, charge.amount_refunded]);
      await this.recompute(client, order.user_id);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

module.exports = { prepaidService: new PrepaidService(), PrepaidService, OFFERS };
