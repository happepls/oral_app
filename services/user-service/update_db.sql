-- Alter users table to add new columns if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender INT CHECK (gender IN (0, 1, 2));
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS target_language VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS points INT DEFAULT 0;

-- Create user_goals table
CREATE TABLE IF NOT EXISTS user_goals (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_language VARCHAR(50) NOT NULL,
    target_level VARCHAR(20) NOT NULL,
    current_proficiency INT DEFAULT 0,
    completion_time_days INT,
    interests TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_status ON user_goals(status);
