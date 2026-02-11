const Stripe = require('stripe');

let connectionSettings = null;

async function getCredentials() {
  // Check if we're running in Replit environment
  const isReplitEnv = process.env.REPLIT_CONNECTORS_HOSTNAME && 
                     (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL);

  if (isReplitEnv) {
    // Use Replit-specific logic
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? 'repl ' + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
        ? 'depl ' + process.env.WEB_REPL_RENEWAL
        : null;

    if (!xReplitToken) {
      throw new Error('X_REPLIT_TOKEN not found for repl/depl');
    }

    const connectorName = 'stripe';
    const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
    const targetEnvironment = isProduction ? 'production' : 'development';

    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set('include_secrets', 'true');
    url.searchParams.set('connector_names', connectorName);
    url.searchParams.set('environment', targetEnvironment);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    });

    const data = await response.json();
    connectionSettings = data.items?.[0];

    if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
      throw new Error(`Stripe ${targetEnvironment} connection not found`);
    }

    return {
      publishableKey: connectionSettings.settings.publishable,
      secretKey: connectionSettings.settings.secret,
    };
  } else {
    // Use standard environment variables for non-Replit environments (Docker, local, etc.)
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!publishableKey || !secretKey) {
      console.warn('Stripe keys not found in environment variables. Stripe functionality will be disabled.');
      return {
        publishableKey: null,
        secretKey: null,
      };
    }

    return {
      publishableKey,
      secretKey,
    };
  }
}

async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  if (!secretKey) {
    throw new Error('Stripe secret key not available');
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil',
  });
}

async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync = null;

async function getStripeSync() {
  const { secretKey } = await getCredentials();
  if (!secretKey) {
    console.warn('Stripe secret key not available, skipping sync initialization');
    return null;
  }
  
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}

module.exports = {
  getUncachableStripeClient,
  getStripePublishableKey,
  getStripeSecretKey,
  getStripeSync
};
