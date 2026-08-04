BEGIN;

-- Track which conversation mode (scene_theater, daily_qa, recall, tour, etc.)
-- completed each task. Needed so the "Actor" achievement only unlocks when
-- the user has genuinely completed a Scene Theater session, not merely any
-- scenario completion.
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS mode VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_user_tasks_mode ON user_tasks(mode);

COMMIT;
