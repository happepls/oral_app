const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  lazyConnect: true
});

redis.on('connect', () => console.log('[user-service] Redis connected'));
redis.on('error', (err) => console.error('[user-service] Redis error:', err.message));

module.exports = redis;
