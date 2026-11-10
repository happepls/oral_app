CREATE TABLE IF NOT EXISTS login_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS login_sessions_user_active ON login_sessions(user_id, created_at)
  WHERE revoked_at IS NULL;
