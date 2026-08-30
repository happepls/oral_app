-- A manual task/scenario reset increments this value. Asynchronous scoring
-- requests must match the current generation before they may write a score.
ALTER TABLE user_tasks
    ADD COLUMN IF NOT EXISTS scoring_generation INTEGER NOT NULL DEFAULT 0;
