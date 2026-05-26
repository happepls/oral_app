const redis = require('./redisClient');

const CHANNEL_PREFIX = 'sse:notifications:';

async function publishNotification(userId, eventType, payload) {
  const channel = `${CHANNEL_PREFIX}${userId}`;
  const message = JSON.stringify({ type: eventType, payload, timestamp: Date.now() });
  try {
    await redis.publish(channel, message);
  } catch (err) {
    console.error(`[SSE_PUB] Failed to publish ${eventType} for user ${userId}:`, err.message);
  }
}

module.exports = { publishNotification, CHANNEL_PREFIX };
