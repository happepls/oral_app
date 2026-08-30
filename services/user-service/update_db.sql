-- Alter users table to add new columns if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender INT CHECK (gender IN (0, 1, 2));
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS target_language VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS points INT DEFAULT 0;
-- First-login Onboarding Tour completion flag (backend-authoritative; localStorage mirrors it)
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Create user_goals table
CREATE TABLE IF NOT EXISTS user_goals (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_language VARCHAR(50) NOT NULL,
    target_level VARCHAR(20) NOT NULL,
    current_proficiency INT DEFAULT 0,
    completion_time_days INT,
    interests TEXT,
    scenarios JSONB,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_status ON user_goals(status);

-- Migration for existing tables
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS scenarios JSONB;
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Multi-turn scoring migration (added for task scoring feature)
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS interaction_count INT DEFAULT 0;
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS scoring_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS workflow_scoring_evaluations (
    evaluation_id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    task_id INTEGER NOT NULL,
    scoring_generation INTEGER NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workflow_scoring_evaluations_expiry
    ON workflow_scoring_evaluations (expires_at);
CREATE INDEX IF NOT EXISTS idx_workflow_scoring_evaluations_task_generation
    ON workflow_scoring_evaluations (user_id, task_id, scoring_generation);

-- Update existing completed tasks to have full score
UPDATE user_tasks SET score = 100 WHERE status = 'completed' AND score = 0;

-- Daily check-in table (added for checkin feature)
CREATE TABLE IF NOT EXISTS user_checkins (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    points_earned INT DEFAULT 10,
    streak_count INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_user_checkins_user_id ON user_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_checkins_date ON user_checkins(checkin_date);

-- Composite index to optimize the LEFT JOIN in User.findById / User.findByEmail
-- (user_identities ON ui.user_id = u.id AND ui.provider = 'local')
CREATE INDEX IF NOT EXISTS idx_user_identities_user_provider ON user_identities (user_id, provider);

-- Daily Recall state table (added for backend-persisted Recall switch count + completion)
CREATE TABLE IF NOT EXISTS recall_daily_state (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state_date DATE NOT NULL DEFAULT CURRENT_DATE,
    switch_count INTEGER NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, state_date)
);
CREATE INDEX IF NOT EXISTS idx_recall_daily_state_user_date ON recall_daily_state(user_id, state_date);
