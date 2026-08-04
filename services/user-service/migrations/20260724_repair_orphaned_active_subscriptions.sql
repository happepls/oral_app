BEGIN;

CREATE TABLE IF NOT EXISTS subscription_repair_audit (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_status VARCHAR(50) NOT NULL,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    repair_reason VARCHAR(100) NOT NULL,
    repaired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, repair_reason)
);

INSERT INTO subscription_repair_audit (
    user_id,
    previous_status,
    stripe_customer_id,
    stripe_subscription_id,
    repair_reason
)
SELECT
    id,
    subscription_status,
    stripe_customer_id,
    stripe_subscription_id,
    'active_without_complete_stripe_link'
FROM users
WHERE subscription_status = 'active'
  AND (NULLIF(stripe_customer_id, '') IS NULL OR NULLIF(stripe_subscription_id, '') IS NULL)
ON CONFLICT (user_id, repair_reason) DO NOTHING;

UPDATE users
SET subscription_status = 'free',
    updated_at = NOW()
WHERE subscription_status = 'active'
  AND (NULLIF(stripe_customer_id, '') IS NULL OR NULLIF(stripe_subscription_id, '') IS NULL);

COMMIT;
