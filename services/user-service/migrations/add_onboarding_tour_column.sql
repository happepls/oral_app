-- Add onboarding_tour_completed column to users table (idempotent)
-- For existing production DBs where init.sql only runs on fresh DB.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_completed BOOLEAN DEFAULT FALSE;
