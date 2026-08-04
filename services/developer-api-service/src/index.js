require('dotenv').config();
const { Pool } = require('pg');
const { createApp } = require('./app');
const { migrate } = require('./migrate');

const required = ['DATABASE_URL', 'DELEGATED_JWT_SECRET', 'JWT_SECRET', 'INTERNAL_AUTH_SECRET'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 });
const port = Number(process.env.PORT || 3010);

async function main() {
  await migrate(db);
  const app = createApp({
    db,
    delegatedSecret: process.env.DELEGATED_JWT_SECRET,
    realtimeSecret: process.env.JWT_SECRET,
    internalAuthSecret: process.env.INTERNAL_AUTH_SECRET,
    aiTimeoutMs: Number(process.env.AI_UPSTREAM_TIMEOUT_MS || 60000),
  });
  app.listen(port, '0.0.0.0', () => console.log(`Developer API listening on ${port}`));
}

main().catch((err) => { console.error(`Developer API startup failed: ${err.message}`); process.exitCode = 1; });
