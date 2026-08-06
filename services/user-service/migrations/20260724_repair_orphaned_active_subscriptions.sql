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

-- Deliberately no INSERT or entitlement UPDATE here. Candidate inspection is
-- read-only until Stripe reconciliation and a separate approval are recorded.

COMMIT;
