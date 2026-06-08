const Stripe = require('stripe');

// Stripe credentials are read purely from environment variables.
// (Previously this module supported Replit Connectors; that path was removed
//  when migrating off Replit — see plan wise-account-integrate.)
function getCredentials() {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || null;
  const secretKey = process.env.STRIPE_SECRET_KEY || null;

  if (!publishableKey || !secretKey) {
    console.warn('Stripe keys not found in environment variables. Stripe functionality will be disabled.');
  }

  return { publishableKey, secretKey };
}

let stripeClient = null;

// Returns a cached Stripe client instance, or throws if the secret key is absent.
async function getUncachableStripeClient() {
  const { secretKey } = getCredentials();
  if (!secretKey) {
    throw new Error('Stripe secret key not available');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2025-08-27.basil',
    });
  }
  return stripeClient;
}

async function getStripePublishableKey() {
  return getCredentials().publishableKey;
}

async function getStripeSecretKey() {
  return getCredentials().secretKey;
}

function getWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

module.exports = {
  getUncachableStripeClient,
  getStripePublishableKey,
  getStripeSecretKey,
  getWebhookSecret,
};
