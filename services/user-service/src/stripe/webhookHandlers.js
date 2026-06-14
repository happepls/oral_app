const { getUncachableStripeClient, getWebhookSecret } = require('./stripeClient');
const { stripeService } = require('./stripeService');

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
        await WebhookHandlers._onCheckoutCompleted(event.data.object);
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
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    if (!customerId) return;

    await stripeService.updateUserStripeInfoByCustomerId(customerId, {
      stripeSubscriptionId: subscriptionId || undefined,
      subscriptionStatus: 'active',
    });
  }

  static async _onSubscriptionUpdated(subscription) {
    const customerId = subscription.customer;
    if (!customerId) return;

    await stripeService.updateUserStripeInfoByCustomerId(customerId, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: mapSubscriptionStatus(subscription.status),
    });
  }

  static async _onSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    if (!customerId) return;

    await stripeService.updateUserStripeInfoByCustomerId(customerId, {
      stripeSubscriptionId: null,
      subscriptionStatus: 'canceled',
    });
  }

  static async _onPaymentFailed(invoice) {
    const customerId = invoice.customer;
    if (!customerId) return;

    await stripeService.updateUserStripeInfoByCustomerId(customerId, {
      subscriptionStatus: 'past_due',
    });
  }
}

module.exports = { WebhookHandlers };
