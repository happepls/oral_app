
const express = require('express');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8083;

// Connect to Redis. The hostname 'redis' is resolvable thanks to Docker's networking.
const redis = new Redis({
  host: 'redis',
  port: 6379,
});

redis.on('connect', () => {
  console.log('Successfully connected to Redis.');
});
redis.on('error', (err) => {
  console.error('Could not connect to Redis:', err);
});


app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('Conversation Service is running.');
});

// Endpoint to start a new conversation session
app.post('/start', async (req, res) => {
  const { userId, goalId, forceNew } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'userId is required.' });
  }

  // Use goalId to separate sessions, default to 'general' if not provided
  const effectiveGoalId = goalId || 'general';
  const sessionListKey = `user:${userId}:goal:${effectiveGoalId}:sessions`;
  const legacyUserSessionKey = `user_session:${userId}`; // Keep for backward compat
  
  const SESSION_EXPIRATION_SECONDS = 86400 * 7; // 7 days retention for the list

  try {
    let sessionId;

    // 1. If NOT forcing new, try to get the most recent session
    if (!forceNew) {
      const sessions = await redis.lrange(sessionListKey, 0, 0);
      if (sessions && sessions.length > 0) {
        sessionId = sessions[0];
        console.log(`Found active session for user ${userId}, goal ${effectiveGoalId}: ${sessionId}`);
        
        // Refresh expiration of the list
        await redis.expire(sessionListKey, SESSION_EXPIRATION_SECONDS);
        
        return res.status(200).json({ 
          success: true,
          message: 'Existing session retrieved.',
          data: { sessionId }
        });
      }
    }

    // 2. Create new session
    sessionId = uuidv4();
    console.log(`Creating new session for user ${userId}, goal ${effectiveGoalId}: ${sessionId}`);

    // 3. Push to Redis List and Trim to Max 3
    await redis.lpush(sessionListKey, sessionId);
    await redis.ltrim(sessionListKey, 0, 2); // Keep only top 3
    await redis.expire(sessionListKey, SESSION_EXPIRATION_SECONDS);

    // Update legacy key for backward compatibility
    await redis.set(legacyUserSessionKey, sessionId, 'EX', 86400);

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

// Endpoint to get active sessions for a goal
app.get('/sessions', async (req, res) => {
  const { userId, goalId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ message: 'userId is required.' });
  }

  const effectiveGoalId = goalId || 'general';
  const sessionListKey = `user:${userId}:goal:${effectiveGoalId}:sessions`;

  try {
    const sessions = await redis.lrange(sessionListKey, 0, -1);
    res.status(200).json({ 
      success: true, 
      data: { sessions } 
    });
  } catch (error) {
    console.error(`Failed to retrieve sessions:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Endpoint to retrieve conversation history
app.get('/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const historyKey = `history:${sessionId}`;

  try {
    const history = await redis.lrange(historyKey, 0, -1);
    res.status(200).json(history.map(JSON.parse)); // Parse each message from JSON string
  } catch (error) {
    console.error(`Failed to retrieve history for session ${sessionId}:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Endpoint to add a message to the history
app.post('/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const message = req.body;
  
  if (!message || typeof message !== 'object') {
    return res.status(400).json({ message: 'Invalid message format in request body.' });
  }

  const historyKey = `history:${sessionId}`;
  const HISTORY_EXPIRATION_SECONDS = 86400; // 24 hours

  try {
    // Add the new message to the end of the list
    await redis.rpush(historyKey, JSON.stringify(message));
    // Reset the expiration on the history every time a message is added
    await redis.expire(historyKey, HISTORY_EXPIRATION_SECONDS);
    
    res.status(201).json({ message: 'Message added to history.' });
  } catch (error) {
    console.error(`Failed to add message to history for session ${sessionId}:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});


app.listen(PORT, () => {
  console.log(`Conversation Service listening on port ${PORT}`);
});
