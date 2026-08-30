-- Apply after user_tasks.scoring_generation exists.
-- Stores only final window evaluations; pending model calls remain retryable.
CREATE TABLE IF NOT EXISTS workflow_scoring_evaluations (
    evaluation_id VARCHAR(128) PRIMARY KEY,
    user_id UUID NOT NULL,
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
