BEGIN;

CREATE TABLE IF NOT EXISTS recall_daily_state (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state_date DATE NOT NULL DEFAULT CURRENT_DATE,
    switch_count INTEGER NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, state_date)
);

CREATE INDEX IF NOT EXISTS idx_recall_daily_state_user_date
    ON recall_daily_state(user_id, state_date);

UPDATE user_goals
SET status = 'archived',
    completed_at = NULL,
    updated_at = NOW()
WHERE status = 'abandoned';

COMMIT;
