const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Redis = require('ioredis');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { createRequireUser } = require('./auth');

const app = express();
const PORT = process.env.PORT || 8083;
const INTERNAL_AUTH_SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!INTERNAL_AUTH_SECRET) throw new Error('INTERNAL_AUTH_SECRET is required');
const JWT_SECRET = process.env.JWT_SECRET;
const requireUser = createRequireUser(JWT_SECRET);
const historyWriteHeaders = { 'Content-Type': 'application/json', 'X-Guaji-Internal-Auth': INTERNAL_AUTH_SECRET };

function requireInternalService(req, res, next) {
  const supplied = req.get('X-Guaji-Internal-Auth');
  if (!supplied) return res.status(401).json({ message: 'Internal authentication required.' });
  const expected = Buffer.from(INTERNAL_AUTH_SECRET);
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return res.status(401).json({ message: 'Invalid internal authentication.' });
  }
  next();
}

// Connect to Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryDelayOnFailover: 1000,
  maxRetriesPerRequest: 3,
  lazyConnect: true
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

const SESSION_EXPIRATION_S = 86400 * 7; // 7 days in seconds

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'conversation-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', (req, res) => {
  const metrics = [
    `# HELP nodejs_uptime_seconds Uptime of the Node.js process`,
    `# TYPE nodejs_uptime_seconds gauge`,
    `nodejs_uptime_seconds ${process.uptime()}`,
    `# HELP nodejs_memory_rss_bytes Resident Set Size memory`,
    `# TYPE nodejs_memory_rss_bytes gauge`,
    `nodejs_memory_rss_bytes ${process.memoryUsage().rss}`,
    `# HELP nodejs_heap_total_bytes Total heap size`,
    `# TYPE nodejs_heap_total_bytes gauge`,
    `nodejs_heap_total_bytes ${process.memoryUsage().heapTotal}`,
    `# HELP nodejs_heap_used_bytes Used heap size`,
    `# TYPE nodejs_heap_used_bytes gauge`,
    `nodejs_heap_used_bytes ${process.memoryUsage().heapUsed}`
  ];
  
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics.join('\n'));
});

app.get('/', (req, res) => {
  res.status(200).send('Conversation Service is running.');
});

app.post('/start', requireUser, async (req, res) => {
  const { goalId, forceNew } = req.body;
  const userId = req.authUserId;

  const effectiveGoalId = goalId || 'general';
  const sessionListKey = `user:${userId}:goal:${effectiveGoalId}:sessions`;

  try {
    let sessionId;

    if (!forceNew) {
      // Try to get existing session list from Redis
      const existingSessionData = await redis.get(sessionListKey);
      if (existingSessionData) {
        const parsedData = JSON.parse(existingSessionData);
        if (parsedData.expiresAt > Date.now()) {
          sessionId = parsedData.list[0];
          console.log(`Found active session for user ${userId}, goal ${effectiveGoalId}: ${sessionId}`);

          // Update expiration time
          parsedData.expiresAt = Date.now() + (SESSION_EXPIRATION_S * 1000); // Convert to ms
          await redis.setex(sessionListKey, SESSION_EXPIRATION_S, JSON.stringify(parsedData));

          return res.status(200).json({
            success: true,
            message: 'Existing session retrieved.',
            data: { sessionId }
          });
        }
      }
    }

    sessionId = uuidv4();
    console.log(`Creating new session for user ${userId}, goal ${effectiveGoalId}: ${sessionId}`);

    // Create new session list with the new session ID
    const sessionData = {
      list: [sessionId],
      expiresAt: Date.now() + (SESSION_EXPIRATION_S * 1000) // Convert to ms
    };

    await redis.setex(sessionListKey, SESSION_EXPIRATION_S, JSON.stringify(sessionData));

    // Initialize conversation in history-analytics-service
    try {
      const initResponse = await fetch(`http://history-analytics-service:3004/api/history/conversation`, {
        method: 'POST',
        headers: historyWriteHeaders,
        body: JSON.stringify({
          sessionId,
          userId,
          goalId: effectiveGoalId === 'general' ? undefined : String(effectiveGoalId),
          messages: [],
          startTime: new Date().toISOString()
        })
      });
      
      if (!initResponse.ok) {
        console.error(`Failed to initialize conversation in history service: ${initResponse.status} ${await initResponse.text()}`);
      } else {
        console.log(`Initialized conversation record for session ${sessionId} in history service`);
      }
    } catch (initError) {
      console.error(`Error initializing conversation in history service:`, initError);
    }

    res.status(201).json({
      success: true,
      message: 'New conversation session started.',
      data: { sessionId }
    });

  } catch (error) {
    console.error(`Failed to manage session for user ${userId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while managing session.'
    });
  }
});

app.delete('/internal/users/:userId/goals/:goalId/sessions', requireInternalService, async (req, res) => {
  try {
    const key = `user:${req.params.userId}:goal:${req.params.goalId}:sessions`;
    const deleted = await redis.del(key);
    res.json({ deleted_session_index_count: deleted });
  } catch (error) {
    console.error('Failed to delete goal session index:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/sessions', requireUser, async (req, res) => {
  const { goalId } = req.query;
  const userId = req.authUserId;

  const effectiveGoalId = goalId || 'general';
  const sessionListKey = `user:${userId}:goal:${effectiveGoalId}:sessions`;

  try {
    const existingSessionData = await redis.get(sessionListKey);
    let list = [];

    if (existingSessionData) {
      const parsedData = JSON.parse(existingSessionData);
      if (parsedData.expiresAt > Date.now()) {
        list = parsedData.list;
      }
    }

    res.status(200).json({
      success: true,
      data: { sessions: list }
    });
  } catch (error) {
    console.error(`Failed to retrieve sessions:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/history/:sessionId', requireUser, async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Try to get history from history-analytics-service first
    try {
      const historyResponse = await fetch(`http://history-analytics-service:3004/api/history/session/${sessionId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.authToken}` }
      });

      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        console.log(`Retrieved history for session ${sessionId} from history-analytics-service`);
        console.log(`Messages count:`, historyData.data?.messages?.length || 0);
        return res.status(200).json({
          success: true,
          data: historyData.data || { messages: [] }
        });
      }
    } catch (fetchError) {
      console.log(`Failed to fetch from history-analytics-service, using fallback: ${fetchError.message}`);
    }

    res.status(502).json({ message: 'History service is unavailable.' });
  } catch (error) {
    console.error(`Failed to retrieve history for session ${sessionId}:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

async function forwardMessages(sessionId, userId, messages) {
  const historyResponse = await fetch(
    `http://history-analytics-service:3004/api/history/session/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      headers: historyWriteHeaders,
      body: JSON.stringify({ userId, messages })
    }
  );
  if (!historyResponse.ok) {
    const detail = await historyResponse.text();
    const error = new Error(`History write failed (${historyResponse.status})`);
    error.status = historyResponse.status;
    error.detail = detail.slice(0, 300);
    throw error;
  }
}

app.post('/internal/history/:sessionId/messages', requireInternalService, async (req, res) => {
  const { sessionId } = req.params;
  const { userId, messages } = req.body;
  if (!userId || !Array.isArray(messages)) {
    return res.status(400).json({ message: 'userId and messages are required.' });
  }
  try {
    await forwardMessages(sessionId, String(userId), messages);
    res.status(201).json({ message: 'Messages saved successfully.' });
  } catch (error) {
    console.error(`Internal history write failed for ${sessionId}:`, error.message);
    res.status(error.status === 403 ? 403 : 502).json({ message: 'History service write failed.' });
  }
});

app.post('/history/:sessionId', requireUser, async (req, res) => {
  const { sessionId } = req.params;
  const { role, content, audioUrl, messages } = req.body;
  const userId = req.authUserId;

  console.log(`POST /history/${sessionId} received request`);
  console.log(`Request body keys: ${Object.keys(req.body)}`);
  console.log(`Has messages array: ${messages && Array.isArray(messages)}`);
  console.log(`Has userId: ${userId}`);

  const normalized = Array.isArray(messages) ? messages : [{ role, content, audioUrl, id: req.body.id, timestamp: req.body.timestamp }];
  if (!normalized.length || normalized.some(message => !message.role || (!message.content && !message.audioUrl))) {
    return res.status(400).json({ message: 'Each message requires role and content or audioUrl.' });
  }
  try {
    await forwardMessages(sessionId, userId, normalized);
    return res.status(201).json({ message: 'Messages saved successfully.' });
  } catch (error) {
    console.error(`History write failed for ${sessionId}:`, error.message);
    return res.status(error.status === 403 ? 403 : 502).json({ message: 'History service write failed.' });
  }
});

app.put('/history/:sessionId/message', requireUser, async (req, res) => {
  const { sessionId } = req.params;
  const { role, content, audioUrl, userId } = req.body;

  if (!role || !content) {
    return res.status(400).json({ message: 'role and content are required.' });
  }

  try {
    // For now, just acknowledge the request since conversation history is handled by history-analytics-service
    res.status(200).json({ message: 'Message acknowledged (history updates handled by history-analytics-service).' });
  } catch (error) {
    console.error(`Failed to acknowledge message update for session ${sessionId}:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/history/user/:userId', requireUser, async (req, res) => {
  const { userId } = req.params;
  if (String(userId) !== req.authUserId) return res.status(403).json({ message: 'Forbidden.' });

  try {
    // For now, return an empty history since conversation history is handled by history-analytics-service
    res.status(200).json({
      success: true,
      data: []
    });
  } catch (error) {
    console.error(`Failed to retrieve history for user ${userId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve history', data: [] });
  }
});

// ---------------------------------------------------------------------------
// Phase state persistence — stores dual-phase progress in Redis
// Key: phase:{sessionId}  TTL: 24h
// ---------------------------------------------------------------------------
const PHASE_TTL_S = 86400; // 24 hours

app.post('/phase', requireInternalService, async (req, res) => {
  const { userId, sessionId, phase, taskIndex, imageUrl } = req.body;
  if (!userId || !sessionId || !phase) {
    return res.status(400).json({ message: 'userId, sessionId and phase are required.' });
  }
  const key = `phase:${sessionId}`;
  const data = { userId, phase, taskIndex: taskIndex ?? 0, imageUrl: imageUrl || null, updatedAt: Date.now() };
  try {
    await redis.setex(key, PHASE_TTL_S, JSON.stringify(data));
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Phase] Failed to save phase state:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/phase/:sessionId', requireUser, async (req, res) => {
  const { sessionId } = req.params;
  try {
    const raw = await redis.get(`phase:${sessionId}`);
    if (!raw) {
      return res.status(404).json({ success: false, message: 'Phase state not found.' });
    }
    const data = JSON.parse(raw);
    if (String(data.userId) !== req.authUserId) return res.status(403).json({ message: 'Forbidden.' });
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[Phase] Failed to get phase state:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.delete('/phase/:sessionId', requireInternalService, async (req, res) => {
  const { sessionId } = req.params;
  try {
    await redis.del(`phase:${sessionId}`);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Phase] Failed to delete phase state:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/history/stats/:userId', requireUser, async (req, res) => {
  const { userId } = req.params;
  if (String(userId) !== req.authUserId) return res.status(403).json({ message: 'Forbidden.' });

  try {
    // For now, return zero stats since conversation history is handled by history-analytics-service
    res.status(200).json({
      success: true,
      data: {
        totalSessions: 0,
        totalMessages: 0
      }
    });
  } catch (error) {
    console.error(`Failed to retrieve stats for user ${userId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve stats',
      data: { totalSessions: 0, totalMessages: 0 }
    });
  }
});

// Connect to Redis before starting the server
(async () => {
  try {
    await redis.connect();
    console.log('Successfully connected to Redis');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    process.exit(1);
  }
})();

app.listen(PORT, () => {
  console.log(`Conversation Service listening on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await redis.quit();
  process.exit(0);
});
