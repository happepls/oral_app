-- Persist the per-scenario AI review so the frontend's getScenarioReview REST
-- call returns it instantly instead of waiting ~15s for the slow WS event
-- (two serial LLM calls). Without persistence the REST path always returned
-- null and the completion report opened on a hard-timeout fallback with an
-- empty 「详细反馈」 section.
ALTER TABLE user_goals
  ADD COLUMN IF NOT EXISTS scenario_review JSONB;
