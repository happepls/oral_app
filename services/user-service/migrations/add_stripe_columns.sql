-- Adds Stripe linkage columns to the users table.
-- init.sql already includes these for fresh databases; run this against an
-- existing database that predates the Stripe integration:
--   docker compose exec -T postgres psql -U user -d oral_app < services/user-service/migrations/add_stripe_columns.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id     VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status    VARCHAR(50) DEFAULT 'free';
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
