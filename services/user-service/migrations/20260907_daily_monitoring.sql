BEGIN;
CREATE TABLE IF NOT EXISTS monitor_user_minutes (
    minute_epoch BIGINT PRIMARY KEY CHECK (minute_epoch > 0 AND minute_epoch % 60 = 0),
    sample_count BIGINT NOT NULL CHECK (sample_count >= 0),
    five_xx_count BIGINT NOT NULL CHECK (five_xx_count BETWEEN 0 AND sample_count),
    memory_utilization DOUBLE PRECISION CHECK (memory_utilization >= 0 AND memory_utilization < 'Infinity'::float8)
);
CREATE TABLE IF NOT EXISTS monitor_backup_success (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    completed_at TIMESTAMPTZ NOT NULL
);
COMMIT;
