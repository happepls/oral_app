const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 8083;

// Connect to Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
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

app.get('/', (req, res) => {
  res.status(200).send('Conversation Service is running.');
});

app.post('/start', async (req, res) => {
  const { userId, goalId, forceNew } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'userId is required.' });
  }

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

app.get('/sessions', async (req, res) => {
  const { userId, goalId } = req.query;

  if (!userId) {
    return res.status(400).json({ message: 'userId is required.' });
  }

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

app.get('/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    // For now, return an empty history since conversation history is handled by history-analytics-service
    res.status(200).json({
      success: true,
      data: { messages: [] }
    });
  } catch (error) {
    console.error(`Failed to retrieve history for session ${sessionId}:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { role, content, audioUrl, userId } = req.body;

  if (!role || !content) {
    return res.status(400).json({ message: 'role and content are required.' });
  }

  try {
    // For now, just acknowledge the request since conversation history is handled by history-analytics-service
    res.status(201).json({ message: 'Message acknowledged (history stored by history-analytics-service).' });
  } catch (error) {
    console.error(`Failed to acknowledge message for session ${sessionId}:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.put('/history/:sessionId/message', async (req, res) => {
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

app.get('/history/user/:userId', async (req, res) => {
  const { userId } = req.params;

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

app.get('/history/stats/:userId', async (req, res) => {
  const { userId } = req.params;

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
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await redis.quit();
  process.exit(0);
});
