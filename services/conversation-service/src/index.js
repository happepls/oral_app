
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
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'userId is required.' });
  }

  const userSessionKey = `user_session:${userId}`;
  const SESSION_EXPIRATION_SECONDS = 86040; // 23.9 hours

  try {
    // 1. Try to get the existing session from Redis
    let sessionId = await redis.get(userSessionKey);

    if (sessionId) {
      // 2. If session exists, refresh its expiration and return it
      console.log(`Found existing session for user ${userId}: ${sessionId}`);
      await redis.expire(userSessionKey, SESSION_EXPIRATION_SECONDS);
      res.status(200).json({ 
        message: 'Existing session retrieved.',
        sessionId: sessionId 
      });
    } else {
      // 3. If no session, create a new one
      sessionId = uuidv4();
      console.log(`Creating new session for user ${userId}: ${sessionId}`);
      
      // Store the new session ID in Redis with the specified expiration
      await redis.set(userSessionKey, sessionId, 'EX', SESSION_EXPIRATION_SECONDS);
      
      res.status(201).json({ 
        message: 'New conversation session started.',
        sessionId: sessionId 
      });
    }
  } catch (error) {
    console.error(`Failed to get/create session for user ${userId}:`, error);
    res.status(500).json({ message: 'Internal server error while managing session.' });
  }
});

app.listen(PORT, () => {
  console.log(`Conversation Service listening on port ${PORT}`);
});
