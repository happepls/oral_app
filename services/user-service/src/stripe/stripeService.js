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

  async createCheckoutSession(customerId, priceId, successUrl, cancelUrl, promotionCode, userId) {
    const secretKey = await getStripeSecretKey();
    if (!secretKey) {
      throw new Error('Stripe is not configured');
    }

    const stripe = await getUncachableStripeClient();
    const params = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    // Stamp our user id onto the session so the webhook can fall back to it
    // when the customer→user linkage isn't yet persisted (race / first checkout).
    if (userId !== undefined && userId !== null) {
      params.client_reference_id = String(userId);
      params.metadata = { userId: String(userId) };
    }

    if (promotionCode) {
      const promo = await this.validatePromotionCode(promotionCode);
      if (!promo) {
        const error = new Error('Promotion code is invalid or expired');
        error.code = 'INVALID_PROMOTION_CODE';
        throw error;
      }
      params.discounts = [{ promotion_code: promo.id }];
    } else {
      params.allow_promotion_codes = true;
    }

    return await stripe.checkout.sessions.create(params);
  }

  async validatePromotionCode(rawCode) {
    if (typeof rawCode !== 'string' || !rawCode.trim()) return null;
    const stripe = await getUncachableStripeClient();
    const code = rawCode.trim().toUpperCase();
    const promos = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    const promotionCode = promos.data[0];
    if (!promotionCode) return null;
    if (promotionCode.expires_at && promotionCode.expires_at <= Math.floor(Date.now() / 1000)) return null;
    if (
      promotionCode.max_redemptions !== null
      && promotionCode.times_redeemed >= promotionCode.max_redemptions
    ) return null;

    let coupon = promotionCode.coupon || promotionCode.promotion?.coupon;
    if (typeof coupon === 'string') coupon = await stripe.coupons.retrieve(coupon);
    if (!coupon || coupon.valid === false) return null;

    const percentOff = coupon.percent_off ?? null;
    const amountOff = coupon.amount_off ?? null;
    const description = coupon.name
      || (percentOff !== null ? `${percentOff}% off` : `${amountOff || 0} ${String(coupon.currency || '').toUpperCase()} off`);
    return {
      id: promotionCode.id,
      code: promotionCode.code,
      percent_off: percentOff,
      amount_off: amountOff,
      currency: coupon.currency || null,
      description,
    };
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

  // Webhook fallback: resolve a user id from the checkout email when the
  // customer→user linkage isn't persisted yet. Case-insensitive match.
  async getUserByEmail(email) {
    if (!email) return null;
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    return result.rows[0] || null;
  }
}

module.exports = { stripeService: new StripeService() };
