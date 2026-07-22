BEGIN;

DROP TABLE IF EXISTS developer_idempotency_keys;
DROP TABLE IF EXISTS developer_audit_events;
DROP TABLE IF EXISTS developer_api_keys;
DROP TABLE IF EXISTS developer_user_grants;
DROP TABLE IF EXISTS developer_clients;

COMMIT;
