require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');
const { hash } = require('../src/auth');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const apiKey = `gj_local_${crypto.randomBytes(24).toString('base64url')}`;
  const redirectUri = process.env.SEED_REDIRECT_URI || 'http://localhost:4173/callback';
  try {
    const client = (await db.query(`INSERT INTO developer_clients (name, redirect_uris, status) VALUES ('Local Quality Partner', $1, 'active') RETURNING id`, [[redirectUri]])).rows[0];
    await db.query('INSERT INTO developer_api_keys (client_id, key_hash, key_prefix, status) VALUES ($1,$2,$3,\'active\')', [client.id, hash(apiKey), apiKey.slice(0, 12)]);
    const scope = ['profile:read','profile:write','goals:read','goals:write','conversations:read','conversations:write','ai:generate','realtime:connect'].join(' ');
    const authorizationUrl = `http://localhost:3000/developer/authorize?client_id=${encodeURIComponent(client.id)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=local-quality`;
    console.log(JSON.stringify({ client_id: client.id, api_key: apiKey, authorization_url: authorizationUrl, note: 'The API key is shown once. A signed-in user must approve the authorization URL to receive a one-time code.' }, null, 2));
  } finally { await db.end(); }
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; });
