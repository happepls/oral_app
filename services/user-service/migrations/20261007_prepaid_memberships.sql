BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_status VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS prepaid_expires_at TIMESTAMPTZ;
UPDATE users SET stripe_subscription_status = subscription_status WHERE stripe_subscription_status IS NULL;
ALTER TABLE users ALTER COLUMN stripe_subscription_status SET DEFAULT 'free';
UPDATE users SET stripe_subscription_status = 'free' WHERE stripe_subscription_status IS NULL;
ALTER TABLE users ALTER COLUMN stripe_subscription_status SET NOT NULL;
CREATE TABLE IF NOT EXISTS prepaid_orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  request_key VARCHAR(100) NOT NULL,
  billing_mode VARCHAR(20) NOT NULL CHECK (billing_mode IN ('subscription', 'prepaid')),
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('weekly', 'annual')),
  price_id VARCHAR(255) NOT NULL,
  unit_amount INTEGER NOT NULL CHECK (unit_amount > 0),
  currency VARCHAR(3) NOT NULL,
  livemode BOOLEAN NOT NULL,
  customer_id VARCHAR(255) NOT NULL,
  checkout_params JSONB NOT NULL,
  checkout_session_id VARCHAR(255) UNIQUE,
  payment_intent_id VARCHAR(255) UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating','pending','fulfilled','failed','expired','refunded')),
  paid_at TIMESTAMPTZ,
  amount_paid INTEGER,
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, request_key)
);
CREATE INDEX IF NOT EXISTS prepaid_orders_user ON prepaid_orders(user_id, paid_at);
-- Stored even when refund arrives before checkout fulfillment.
CREATE TABLE IF NOT EXISTS prepaid_refunds (
  payment_intent_id VARCHAR(255) PRIMARY KEY,
  refunded_amount INTEGER NOT NULL,
  charge_amount INTEGER NOT NULL,
  livemode BOOLEAN NOT NULL
);
COMMIT;
