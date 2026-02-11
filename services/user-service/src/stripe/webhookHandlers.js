const { getStripeSync } = require('./stripeClient');

class WebhookHandlers {
  static async processWebhook(payload, signature) {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    if (!sync) {
      console.warn('Stripe sync not available, skipping webhook processing');
      return;
    }
    
    await sync.processWebhook(payload, signature);
  }
}

module.exports = { WebhookHandlers };
