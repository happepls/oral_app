const { getUncachableStripeClient, getStripeSecretKey } = require('./stripeClient');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Only surface products tagged for this app.
const APP_TAG = 'guaji_ai';

class StripeService {
  async createCustomer(email, userId) {
    const secretKey = await getStripeSecretKey();
    if (!secretKey) {
      throw new Error('Stripe is not configured');
    }

    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      metadata: { userId: String(userId) },
    });
  }

  async createCheckoutSession(customerId, priceId, successUrl, cancelUrl, promotionCode) {
    const secretKey = await getStripeSecretKey();
    if (!secretKey) {
      throw new Error('Stripe is not configured');
    }

    const stripe = await getUncachableStripeClient();
    const params = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    if (promotionCode) {
      // Resolve the human-readable code (e.g. "SAVE20") to a promotion_code id.
      const promos = await stripe.promotionCodes.list({ code: promotionCode, active: true, limit: 1 });
      if (promos.data.length > 0) {
        params.discounts = [{ promotion_code: promos.data[0].id }];
      } else {
        // Unknown/inactive code → let the user enter one on the Checkout page.
        params.allow_promotion_codes = true;
      }
    } else {
      params.allow_promotion_codes = true;
    }

    return await stripe.checkout.sessions.create(params);
  }

  async createCustomerPortalSession(customerId, returnUrl) {
    const secretKey = await getStripeSecretKey();
    if (!secretKey) {
      throw new Error('Stripe is not configured');
    }

    const stripe = await getUncachableStripeClient();
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  // ---- Products / Prices: read live from the Stripe API (no local sync tables) ----

  async getProduct(productId) {
    const stripe = await getUncachableStripeClient();
    try {
      return await stripe.products.retrieve(productId);
    } catch (e) {
      return null;
    }
  }

  async listProducts() {
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.list({ active: true, limit: 100 });
    return products.data.filter((p) => p.metadata?.app === APP_TAG);
  }

  // Returns flat rows (one per product+price) matching the shape stripeRoutes.js
  // maps in /products-with-prices: product_id, product_name, ..., price_id, unit_amount, ...
  async listProductsWithPrices() {
    const stripe = await getUncachableStripeClient();

    const [productsResp, pricesResp] = await Promise.all([
      stripe.products.list({ active: true, limit: 100 }),
      stripe.prices.list({ active: true, limit: 100 }),
    ]);

    const products = productsResp.data.filter((p) => p.metadata?.app === APP_TAG);
    const pricesByProduct = new Map();
    for (const price of pricesResp.data) {
      const productId = typeof price.product === 'string' ? price.product : price.product?.id;
      if (!productId) continue;
      if (!pricesByProduct.has(productId)) pricesByProduct.set(productId, []);
      pricesByProduct.get(productId).push(price);
    }

    const rows = [];
    for (const product of products) {
      const prices = pricesByProduct.get(product.id) || [];
      if (prices.length === 0) {
        rows.push({
          product_id: product.id,
          product_name: product.name,
          product_description: product.description,
          product_active: product.active,
          product_metadata: product.metadata,
          price_id: null,
          unit_amount: null,
          currency: null,
          recurring: null,
          price_active: null,
          price_metadata: null,
        });
        continue;
      }
      // Sort by unit_amount asc to mirror the old SQL ORDER BY.
      prices.sort((a, b) => (a.unit_amount || 0) - (b.unit_amount || 0));
      for (const price of prices) {
        rows.push({
          product_id: product.id,
          product_name: product.name,
          product_description: product.description,
          product_active: product.active,
          product_metadata: product.metadata,
          price_id: price.id,
          unit_amount: price.unit_amount,
          currency: price.currency,
          recurring: price.recurring,
          price_active: price.active,
          price_metadata: price.metadata,
        });
      }
    }
    return rows;
  }

  async getPrice(priceId) {
    const stripe = await getUncachableStripeClient();
    try {
      return await stripe.prices.retrieve(priceId);
    } catch (e) {
      return null;
    }
  }

  async listPrices() {
    const stripe = await getUncachableStripeClient();
    const prices = await stripe.prices.list({ active: true, limit: 100 });
    return prices.data;
  }

  async getSubscription(subscriptionId) {
    const stripe = await getUncachableStripeClient();
    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (e) {
      return null;
    }
  }

  // ---- Local users table: persist Stripe linkage ----

  async updateUserStripeInfo(userId, stripeInfo) {
    const { setClauses, values } = this._buildStripeSetClauses(stripeInfo);
    if (setClauses.length === 0) return null;

    values.push(userId);
    const result = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  // Webhook events only carry the Stripe customer id, not our user id.
  async updateUserStripeInfoByCustomerId(customerId, stripeInfo) {
    const { setClauses, values } = this._buildStripeSetClauses(stripeInfo);
    if (setClauses.length === 0) return null;

    values.push(customerId);
    const result = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE stripe_customer_id = $${values.length} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  _buildStripeSetClauses(stripeInfo) {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (stripeInfo.stripeCustomerId !== undefined) {
      setClauses.push(`stripe_customer_id = $${paramIndex++}`);
      values.push(stripeInfo.stripeCustomerId);
    }
    if (stripeInfo.stripeSubscriptionId !== undefined) {
      setClauses.push(`stripe_subscription_id = $${paramIndex++}`);
      values.push(stripeInfo.stripeSubscriptionId);
    }
    if (stripeInfo.subscriptionStatus !== undefined) {
      setClauses.push(`subscription_status = $${paramIndex++}`);
      values.push(stripeInfo.subscriptionStatus);
    }

    return { setClauses, values };
  }

  async getUserById(userId) {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }
}

module.exports = { stripeService: new StripeService() };
