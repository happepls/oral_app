async function migrate(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS developer_clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(120) NOT NULL,
      redirect_uris TEXT[] NOT NULL DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE developer_clients ADD COLUMN IF NOT EXISTS redirect_uris TEXT[] NOT NULL DEFAULT '{}';
    INSERT INTO developer_clients (id,name,status)
    VALUES ('00000000-0000-4000-8000-000000000010','Guaji First Party','active')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = NOW();
    CREATE TABLE IF NOT EXISTS developer_api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL REFERENCES developer_clients(id) ON DELETE CASCADE,
      key_hash CHAR(64) NOT NULL UNIQUE, key_prefix VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
      expires_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS developer_user_grants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL REFERENCES developer_clients(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, scopes TEXT[] NOT NULL DEFAULT '{}',
      authorization_code_hash CHAR(64) UNIQUE, authorization_code_expires_at TIMESTAMPTZ, code_exchanged_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
      expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(client_id,user_id)
    );
    ALTER TABLE developer_user_grants ADD COLUMN IF NOT EXISTS authorization_code_expires_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS developer_audit_events (
      id BIGSERIAL PRIMARY KEY, client_id UUID REFERENCES developer_clients(id), grant_id UUID REFERENCES developer_user_grants(id),
      user_id UUID REFERENCES users(id), request_id UUID NOT NULL, method VARCHAR(10) NOT NULL, path TEXT NOT NULL,
      status_code INT NOT NULL, duration_ms INT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE developer_audit_events ALTER COLUMN client_id DROP NOT NULL;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='developer_idempotency_keys')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='developer_idempotency_keys' AND column_name='grant_id')
      THEN DROP TABLE developer_idempotency_keys; END IF;
    END $$;
    CREATE TABLE IF NOT EXISTS developer_idempotency_keys (
      client_id UUID NOT NULL REFERENCES developer_clients(id) ON DELETE CASCADE,
      grant_id UUID NOT NULL REFERENCES developer_user_grants(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key VARCHAR(255) NOT NULL, method VARCHAR(10) NOT NULL, path TEXT NOT NULL,
      request_hash CHAR(64) NOT NULL, status_code INT, response_body JSONB, response_body_binary BYTEA,
      response_content_type VARCHAR(120), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      PRIMARY KEY(client_id,grant_id,user_id,method,path,idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_developer_keys_client ON developer_api_keys(client_id);
    CREATE INDEX IF NOT EXISTS idx_developer_grants_lookup ON developer_user_grants(client_id,user_id,status);
    CREATE INDEX IF NOT EXISTS idx_developer_audit_created ON developer_audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_developer_idempotency_expiry ON developer_idempotency_keys(expires_at);
  `);
}

module.exports = { migrate };
