const { Pool } = require('pg');

// Database connection pool configuration
// Pool size and timeouts are configurable via environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || '20'),      // Maximum connections in pool
  min: parseInt(process.env.DB_POOL_MIN || '5'),       // Minimum connections in pool
  idleTimeoutMillis: 30000,                            // Close idle connections after 30s
  connectionTimeoutMillis: 10000,                      // Connection timeout 10s
  allowExitOnIdle: false                               // Keep pool alive in production
});

// Pool event handlers for monitoring
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
  console.log('Database connection established');
});

pool.on('acquire', () => {
  // Log pool stats when connection is acquired
  const stats = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  };
  if (stats.waiting > 5) {
    console.warn('DB connection pool under pressure:', stats);
  }
});

module.exports = {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.error('Database query error:', err.message);
      throw err;
    }
  },
  pool
};
