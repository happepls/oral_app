const express = require('express');
const router = express.Router();
const { stripeService } = require('./stripeService');
const { getStripePublishableKey } = require('./stripeClient');
const { protect } = require('../middleware/authMiddleware');

router.get('/config', async (req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error) {
    console.error('Error getting Stripe config:', error);
    res.status(500).json({ error: 'Failed to get Stripe configuration' });
  }
});

router.get('/products', async (req, res) => {
  try {
    const products = await stripeService.listProducts();
    res.json({ data: products });
  } catch (error) {
    console.error('Error listing products:', error);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

router.get('/products-with-prices', async (req, res) => {
  try {
    const rows = await stripeService.listProductsWithPrices();
    
    const productsMap = new Map();
    for (const row of rows) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          active: row.product_active,
          metadata: row.product_metadata,
          prices: []
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
          active: row.price_active,
          metadata: row.price_metadata,
        });
      }
    }

    res.json({ data: Array.from(productsMap.values()) });
  } catch (error) {
    console.error('Error listing products with prices:', error);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

router.get('/prices', async (req, res) => {
  try {
    const prices = await stripeService.listPrices();
    res.json({ data: prices });
  } catch (error) {
    console.error('Error listing prices:', error);
    res.status(500).json({ error: 'Failed to list prices' });
  }
});

router.get('/subscription', protect, async (req, res) => {
  try {
    const user = await stripeService.getUserById(req.user.id);
    if (!user?.stripe_subscription_id) {
      return res.json({ subscription: null, status: user?.subscription_status || 'free' });
    }

    const subscription = await stripeService.getSubscription(user.stripe_subscription_id);
    res.json({ 
      subscription, 
      status: user.subscription_status || 'free' 
    });
  } catch (error) {
    console.error('Error getting subscription:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

router.post('/checkout', protect, async (req, res) => {
  try {
    const user = await stripeService.getUserById(req.user.id);
    const { priceId } = req.body;

    if (!priceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeService.createCustomer(user.email, user.id);
      await stripeService.updateUserStripeInfo(user.id, { 
        stripeCustomerId: customer.id 
      });
      customerId = customer.id;
    }

    const baseUrl = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      `${baseUrl}/subscription/cancel`
    );

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.post('/portal', protect, async (req, res) => {
  try {
    const user = await stripeService.getUserById(req.user.id);
    
    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer found' });
    }

    const baseUrl = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const session = await stripeService.createCustomerPortalSession(
      user.stripe_customer_id,
      `${baseUrl}/profile`
    );

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

module.exports = router;
