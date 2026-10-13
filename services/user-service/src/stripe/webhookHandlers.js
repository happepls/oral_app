const { getUncachableStripeClient, getWebhookSecret } = require('./stripeClient');
const { stripeService } = require('./stripeService');
const { prepaidService } = require('./prepaidService');

// Map Stripe subscription.status → the value we store in users.subscription_status.
function mapSubscriptionStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'paused':
      return 'paused';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'free';
  }
}

class WebhookHandlers {
  // Verifies the signature natively and dispatches on event type.
  static async processWebhook(payload, signature) {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const webhookSecret = getWebhookSecret();
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }

    const stripe = await getUncachableStripeClient();
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (event.data.object.mode === 'payment') {
          // The event snapshot determines whether payment was confirmed at its
          // timestamp; re-fetching a now-paid old unpaid event must not backdate access.
          if (['paid','no_payment_required'].includes(event.data.object.payment_status)) {
            await prepaidService.fulfill(event.data.object.id, event.created);
          }
        } else {
          await WebhookHandlers._onCheckoutCompleted(event.data.object);
        }
        break;
      case 'checkout.session.async_payment_failed':
        await prepaidService.close(event.data.object, 'failed');
        break;
      case 'checkout.session.expired':
        await prepaidService.close(event.data.object, 'expired');
        break;
      case 'charge.refunded':
        await prepaidService.refund(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await WebhookHandlers._onSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await WebhookHandlers._onSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await WebhookHandlers._onPaymentFailed(event.data.object);
        break;
      default:
        // Ignore unhandled event types.
        break;
    }
  }

  static async _onCheckoutCompleted(session) {
    if (session.mode !== 'subscription' || !['paid', 'no_payment_required'].includes(session.payment_status)) return;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    if (!customerId || !subscriptionId) return;
    const subscription = await stripeService.getSubscription(subscriptionId);
    if (!subscription) throw new Error('Subscription verification unavailable');
    const status = mapSubscriptionStatus(subscription.status);

    // Primary path: customer→user linkage already persisted at checkout time.
    const updated = await stripeService.updateUserStripeInfoByCustomerId(customerId, {
      stripeSubscriptionId: subscriptionId || undefined,
      subscriptionStatus: status,
      stripeSubscriptionStatus: subscription.status,
    });
    if (updated) { await prepaidService.closeSubscriptionCheckout(session, status); return; }

    // Fallback: no row matched stripe_customer_id (linkage not yet written —
    // race / first checkout). Recover the user via metadata.userId, then via
    // the checkout email, and write the linkage + status by user id.
    const fallbackInfo = {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId || undefined,
      subscriptionStatus: status,
      stripeSubscriptionStatus: subscription.status,
    };

    const userId = session.metadata?.userId || session.client_reference_id;
    if (userId) {
      const byId = await stripeService.updateUserStripeInfo(userId, fallbackInfo);
      if (byId) {
        await prepaidService.closeSubscriptionCheckout(session, status);
        console.log('[StripeWebhook] checkout fallback by userId', userId);
        return;
      }
    }

    const email = session.customer_details?.email || session.customer_email;
    if (email) {
      const user = await stripeService.getUserByEmail(email);
      if (user) {
        await stripeService.updateUserStripeInfo(user.id, fallbackInfo);
        await prepaidService.closeSubscriptionCheckout(session, status);
        console.log('[StripeWebhook] checkout fallback by email', email);
        return;
      }
    }

    console.warn(
      '[StripeWebhook] checkout fallback failed: no user matched customer',
      customerId, 'userId', userId, 'email', email
    );
  }

  static async _onSubscriptionUpdated(subscription) {
    const latest = await stripeService.getSubscription(subscription.id);
    if (!latest) throw new Error('Subscription verification unavailable');
    subscription = latest;
    const customerId = subscription.customer;
    if (!customerId) return;
    const user = await stripeService.getUserByCustomerId(customerId);
    if (user?.stripe_subscription_id && user.stripe_subscription_id !== subscription.id
      && !['active','trialing'].includes(subscription.status)) return;

    await stripeService.updateUserStripeInfoByCustomerId(customerId, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: mapSubscriptionStatus(subscription.status),
      stripeSubscriptionStatus: subscription.status,
    });
  }

  static async _onSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    if (!customerId) return;

    const user = await stripeService.getUserByCustomerId(customerId);
    if (user?.stripe_subscription_id && user.stripe_subscription_id !== subscription.id) return;
    await stripeService.updateUserStripeInfoByCustomerId(customerId, {
      stripeSubscriptionId: null, subscriptionStatus: 'canceled',
    });
  }

  static async _onPaymentFailed(invoice) {
    const customerId = invoice.customer;
    if (!customerId) return;

    const user = await stripeService.getUserByCustomerId(customerId);
    if (!user?.stripe_subscription_id) return;
    const subscription = await stripeService.getSubscription(user.stripe_subscription_id);
    if (!subscription) throw new Error('Subscription verification unavailable');
    await WebhookHandlers._onSubscriptionUpdated(subscription);
  }
}

module.exports = { WebhookHandlers };
