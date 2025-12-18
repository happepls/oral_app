-- Create the users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    nickname VARCHAR(50),
    gender INT CHECK (gender IN (0, 1, 2)), -- 0: Female, 1: Male, 2: Other
    birth_year INT,
    avatar_url TEXT,
    native_language VARCHAR(50),
    target_language VARCHAR(50), -- Current primary target language
    interests TEXT, -- Comma separated or JSON
    points INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create the user_identities table
CREATE TABLE IF NOT EXISTS user_identities (
    provider VARCHAR(50) NOT NULL,
    provider_uid VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255), -- Can be null for non-local providers
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, provider_uid)
);

-- Create the user_goals table
CREATE TABLE IF NOT EXISTS user_goals (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_language VARCHAR(50) NOT NULL,
    target_level VARCHAR(20) NOT NULL, -- Beginner, Intermediate, Advanced, Native
    current_proficiency INT DEFAULT 0, -- 0-100
    completion_time_days INT,
    interests TEXT, -- Goal specific interests
    status VARCHAR(20) DEFAULT 'active', -- active, completed, abandoned
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_status ON user_goals(status);