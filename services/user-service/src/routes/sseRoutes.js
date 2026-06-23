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
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3
  });

  const channel = `${CHANNEL_PREFIX}${userId}`;

  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, 30000);

  // CRITICAL: ioredis emits an 'error' event whenever the connection drops.
  // Without an 'error' listener, Node treats it as an uncaught exception and
  // CRASHES the whole user-service process (observed: "Error: Connection is
  // closed." taking down /api/users/* and /api/stripe/* with 502s). Attach a
  // handler so a transient Redis blip only kills THIS SSE stream, not the API.
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    try { subscriber.unsubscribe(channel); } catch (_) {}
    try { subscriber.disconnect(); } catch (_) {}
  };

  subscriber.on('error', (err) => {
    console.error('[SSE] subscriber Redis error:', err.message);
    cleanup();
    try { res.end(); } catch (_) {}
  });

  subscriber.subscribe(channel).catch((err) => {
    console.error('[SSE] subscribe failed:', err.message);
    cleanup();
    try { res.end(); } catch (_) {}
  });

  subscriber.on('message', (ch, message) => {
    if (ch !== channel) return;
    try {
      const event = JSON.parse(message);
      res.write(`event: ${event.type}\ndata: ${message}\n\n`);
    } catch (err) {
      console.error('[SSE] Failed to forward message:', err.message);
    }
  });

  req.on('close', cleanup);
});

module.exports = router;
