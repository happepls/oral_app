/**
 * Stripe Integration Utilities
 * 
 * This file contains helper functions for integrating Stripe payments.
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. Install Stripe SDK:
 *    npm install @stripe/stripe-js
 * 
 * 2. Create a Stripe account at https://stripe.com
 * 
 * 3. Get your API keys from https://dashboard.stripe.com/apikeys
 * 
 * 4. Add environment variables:
 *    VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
 *    (Backend) STRIPE_SECRET_KEY=sk_test_...
 * 
 * 5. Create a backend endpoint to create checkout sessions:
 *    POST /api/create-checkout-session
 * 
 * 6. Set up Stripe webhooks to handle subscription events:
 *    - checkout.session.completed
 *    - customer.subscription.updated
 *    - customer.subscription.deleted
 */

export interface StripeConfig {
  publishableKey: string;
  priceIds: {
    weekly: string;
    yearly: string;
  };
}

// Mock configuration (replace with actual Stripe keys in production)
export const stripeConfig: StripeConfig = {
  publishableKey: "pk_test_YOUR_PUBLISHABLE_KEY_HERE",
  priceIds: {
    weekly: "price_weekly_XXXXXX", // Create these in Stripe Dashboard
    yearly: "price_yearly_XXXXXX",
  },
};

/**
 * Create a Stripe checkout session
 * 
 * @param planId - The plan ID ("weekly" or "yearly")
 * @returns Promise with the checkout URL
 */
export async function createCheckoutSession(planId: string): Promise<string> {
  // In production, this calls your backend API
  const response = await fetch("/api/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      priceId: stripeConfig.priceIds[planId as keyof typeof stripeConfig.priceIds],
      successUrl: `${window.location.origin}/subscription/success`,
      cancelUrl: `${window.location.origin}/subscription`,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create checkout session");
  }

  const { url } = await response.json();
  return url;
}

/**
 * Redirect to Stripe Checkout
 * 
 * @param planId - The plan ID ("weekly" or "yearly")
 */
export async function redirectToCheckout(planId: string): Promise<void> {
  try {
    const checkoutUrl = await createCheckoutSession(planId);
    window.location.href = checkoutUrl;
  } catch (error) {
    console.error("Checkout error:", error);
    throw error;
  }
}

/**
 * Example Backend Implementation (Node.js/Express):
 * 
 * ```typescript
 * import Stripe from 'stripe';
 * const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
 * 
 * app.post('/api/create-checkout-session', async (req, res) => {
 *   const { priceId, successUrl, cancelUrl } = req.body;
 * 
 *   try {
 *     const session = await stripe.checkout.sessions.create({
 *       payment_method_types: ['card'],
 *       line_items: [
 *         {
 *           price: priceId,
 *           quantity: 1,
 *         },
 *       ],
 *       mode: 'subscription',
 *       success_url: successUrl,
 *       cancel_url: cancelUrl,
 *       customer_email: req.user.email, // Get from authenticated user
 *     });
 * 
 *     res.json({ url: session.url });
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * });
 * ```
 * 
 * Example Webhook Handler:
 * 
 * ```typescript
 * app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
 *   const sig = req.headers['stripe-signature'];
 *   let event;
 * 
 *   try {
 *     event = stripe.webhooks.constructEvent(
 *       req.body,
 *       sig,
 *       process.env.STRIPE_WEBHOOK_SECRET
 *     );
 *   } catch (err) {
 *     return res.status(400).send(`Webhook Error: ${err.message}`);
 *   }
 * 
 *   switch (event.type) {
 *     case 'checkout.session.completed':
 *       const session = event.data.object;
 *       // Update user subscription in database
 *       await updateUserSubscription(session.customer, session.subscription);
 *       break;
 * 
 *     case 'customer.subscription.deleted':
 *       const subscription = event.data.object;
 *       // Downgrade user to free plan
 *       await downgradeUser(subscription.customer);
 *       break;
 *   }
 * 
 *   res.json({ received: true });
 * });
 * ```
 */

export interface SubscriptionStatus {
  plan: "free" | "weekly" | "yearly";
  status: "active" | "canceled" | "past_due";
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
}

/**
 * Get current user's subscription status
 * 
 * @returns Promise with subscription status
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  // In production, fetch from your backend
  const response = await fetch("/api/subscription/status", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch subscription status");
  }

  return response.json();
}

/**
 * Cancel subscription at period end
 */
export async function cancelSubscription(): Promise<void> {
  const response = await fetch("/api/subscription/cancel", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to cancel subscription");
  }
}

/**
 * Reactivate a canceled subscription
 */
export async function reactivateSubscription(): Promise<void> {
  const response = await fetch("/api/subscription/reactivate", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to reactivate subscription");
  }
}

/**
 * Check if user has access to premium features
 * 
 * @param subscriptionStatus - User's subscription status
 * @returns boolean
 */
export function hasPremiumAccess(subscriptionStatus: SubscriptionStatus): boolean {
  return (
    subscriptionStatus.plan !== "free" &&
    subscriptionStatus.status === "active"
  );
}

/**
 * Mock usage tracking for free tier limits
 */
export interface UsageData {
  conversationsToday: number;
  conversationsLimit: number;
  resetAt: Date;
}

export async function getUsageData(): Promise<UsageData> {
  // In production, fetch from your backend
  const response = await fetch("/api/usage", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch usage data");
  }

  return response.json();
}
