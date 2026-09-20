-- Additive migration. Apply before enabling PRODUCT_ANALYTICS_ENABLED.
-- No backfill: old users must not be presented as new registrations.
BEGIN;
CREATE TABLE IF NOT EXISTS product_analytics_events (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_name TEXT NOT NULL CHECK (event_name IN
      ('registration_completed', 'first_conversation_started', 'first_conversation_completed')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, event_name)
);
CREATE INDEX IF NOT EXISTS product_analytics_pending
    ON product_analytics_events(next_attempt_at) WHERE delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS product_analytics_sessions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(128) NOT NULL,
    paired_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, session_id)
);
CREATE OR REPLACE FUNCTION record_product_registration() RETURNS trigger AS $$
BEGIN
    INSERT INTO product_analytics_events(user_id, event_name, occurred_at)
    VALUES (NEW.id, 'registration_completed', NEW.created_at)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS product_registration ON users;
CREATE TRIGGER product_registration AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION record_product_registration();
COMMIT;
