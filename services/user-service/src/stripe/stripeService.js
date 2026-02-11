const { getUncachableStripeClient, getStripeSecretKey } = require('./stripeClient');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

  async createCheckoutSession(customerId, priceId, successUrl, cancelUrl) {
    const secretKey = await getStripeSecretKey();
    if (!secretKey) {
      throw new Error('Stripe is not configured');
    }
    
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
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

  async getProduct(productId) {
    const result = await pool.query(
      'SELECT * FROM stripe.products WHERE id = $1',
      [productId]
    );
    return result.rows[0] || null;
  }

  async listProducts(active = true, limit = 20, offset = 0) {
    const result = await pool.query(
      'SELECT * FROM stripe.products WHERE active = $1 LIMIT $2 OFFSET $3',
      [active, limit, offset]
    );
    return result.rows;
  }

  async listProductsWithPrices(active = true, limit = 20, offset = 0) {
    const result = await pool.query(`
      WITH paginated_products AS (
        SELECT id, name, description, metadata, active
        FROM stripe.products
        WHERE active = $1
        ORDER BY id
        LIMIT $2 OFFSET $3
      )
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        p.active as product_active,
        p.metadata as product_metadata,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active as price_active,
        pr.metadata as price_metadata
      FROM paginated_products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      ORDER BY p.id, pr.unit_amount
    `, [active, limit, offset]);
    return result.rows;
  }

  async getPrice(priceId) {
    const result = await pool.query(
      'SELECT * FROM stripe.prices WHERE id = $1',
      [priceId]
    );
    return result.rows[0] || null;
  }

  async listPrices(active = true, limit = 20, offset = 0) {
    const result = await pool.query(
      'SELECT * FROM stripe.prices WHERE active = $1 LIMIT $2 OFFSET $3',
      [active, limit, offset]
    );
    return result.rows;
  }

  async getSubscription(subscriptionId) {
    const result = await pool.query(
      'SELECT * FROM stripe.subscriptions WHERE id = $1',
      [subscriptionId]
    );
    return result.rows[0] || null;
  }

  async updateUserStripeInfo(userId, stripeInfo) {
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

    if (setClauses.length === 0) return null;

    values.push(userId);
    const result = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
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
