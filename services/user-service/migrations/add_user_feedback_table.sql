-- Adds the user_feedback table (in-app feedback submissions).
-- init.sql already includes this for fresh databases; run this against an
-- existing database that predates the feedback feature:
--   docker compose exec -T postgres psql -U user -d oral_app < services/user-service/migrations/add_user_feedback_table.sql
CREATE TABLE IF NOT EXISTS user_feedback (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL DEFAULT 'other',
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created ON user_feedback(created_at DESC);
