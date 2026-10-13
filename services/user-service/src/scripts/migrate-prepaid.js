require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../models/db');

async function main() {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../migrations/20261007_prepaid_memberships.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Prepaid membership migration completed');
  } finally { client.release(); await pool.end(); }
}
main().catch(error => { console.error('Prepaid migration failed:', error.code || error.name); process.exitCode = 1; });
