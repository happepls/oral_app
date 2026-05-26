const express = require('express');
const router = express.Router();
const Redis = require('ioredis');
const { protect } = require('../middleware/enhancedAuthMiddleware');
const { CHANNEL_PREFIX } = require('../utils/notificationPublisher');

router.get('/api/users/sse', protect, (req, res) => {
  const userId = req.user.id;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

  const subscriber = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
  });

  const channel = `${CHANNEL_PREFIX}${userId}`;
  subscriber.subscribe(channel);

  subscriber.on('message', (ch, message) => {
    if (ch !== channel) return;
    try {
      const event = JSON.parse(message);
      res.write(`event: ${event.type}\ndata: ${message}\n\n`);
    } catch (err) {
      console.error('[SSE] Failed to forward message:', err.message);
    }
  });

  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    subscriber.unsubscribe(channel);
    subscriber.disconnect();
  });
});

module.exports = router;
