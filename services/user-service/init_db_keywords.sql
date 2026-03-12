-- Create user_task_keywords table for persisting task-specific keywords
CREATE TABLE IF NOT EXISTS user_task_keywords (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES user_tasks(id) ON DELETE CASCADE,
    keywords JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_task_keywords_task_id ON user_task_keywords(task_id);

-- Add comment
COMMENT ON TABLE user_task_keywords IS 'Stores AI-generated keywords for each user task for proficiency scoring';
COMMENT ON COLUMN user_task_keywords.keywords IS 'JSON array of keywords/phrases relevant to the task';
