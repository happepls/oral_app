// Run daily after release approval. Dry-run by default. No app database access.
const { Pool } = require('pg');
async function main() {
  if (!process.env.UMAMI_DATABASE_URL || !/^[0-9a-f-]{36}$/i.test(process.env.UMAMI_WEBSITE_ID || '')) {
    throw new Error('Dedicated Umami database and website configuration required');
  }
  const pool = new Pool({ connectionString: process.env.UMAMI_DATABASE_URL, max: 1,
    connectionTimeoutMillis: 3000, statement_timeout: 30000 });
  const client = await pool.connect();
  try {
    const website = [process.env.UMAMI_WEBSITE_ID];
    const count = await client.query(`SELECT count(*)::int AS expired FROM website_event
      WHERE website_id=$1 AND created_at < now()-interval '90 days'`, website);
    console.log(JSON.stringify({ apply: process.argv.includes('--apply'), ...count.rows[0] }));
    if (!process.argv.includes('--apply')) return;
    await client.query('BEGIN');
    await client.query(`DELETE FROM event_data WHERE website_id=$1 AND website_event_id IN
      (SELECT event_id FROM website_event WHERE website_id=$1 AND created_at < now()-interval '90 days')`, website);
    await client.query(`DELETE FROM website_event WHERE website_id=$1 AND created_at < now()-interval '90 days'`, website);
    await client.query(`DELETE FROM session_data WHERE website_id=$1 AND created_at < now()-interval '90 days'`, website);
    await client.query(`DELETE FROM session_link WHERE website_id=$1 AND created_at < now()-interval '90 days'`, website);
    await client.query(`DELETE FROM session s WHERE website_id=$1 AND created_at < now()-interval '90 days'
      AND NOT EXISTS (SELECT 1 FROM website_event e WHERE e.session_id=s.session_id)
      AND NOT EXISTS (SELECT 1 FROM session_data d WHERE d.session_id=s.session_id)
      AND NOT EXISTS (SELECT 1 FROM revenue r WHERE r.session_id=s.session_id)`, website);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch(() => { console.error('Analytics retention failed; inspect configuration and pinned Umami schema'); process.exitCode = 1; });
