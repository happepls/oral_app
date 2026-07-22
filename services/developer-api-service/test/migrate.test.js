const test = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('../src/migrate');

test('startup migration creates the complete Developer API persistence model', async () => {
  let sql = '';
  await migrate({ query: async (value) => { sql = value; return { rows: [] }; } });
  for (const table of ['developer_clients', 'developer_api_keys', 'developer_user_grants', 'developer_audit_events', 'developer_idempotency_keys']) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(sql, /response_body_binary BYTEA/);
  assert.match(sql, /PRIMARY KEY\(client_id,grant_id,user_id,method,path,idempotency_key\)/);
});
