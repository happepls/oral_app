-- daily practice time tracking + per-user daily goal
-- 幂等：可重复执行
CREATE TABLE IF NOT EXISTS daily_practice_time (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    practice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    minutes INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, practice_date)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_practice_goal INTEGER DEFAULT 15;
