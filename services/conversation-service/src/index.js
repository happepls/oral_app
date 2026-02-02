const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8000;

const sessions = new Map();
const history = new Map();

const SESSION_EXPIRATION_MS = 86400 * 7 * 1000;
const HISTORY_EXPIRATION_MS = 86400 * 1000;

function cleanupExpired() {
  const now = Date.now();
  for (const [key, value] of sessions.entries()) {
    if (value.expiresAt < now) {
      sessions.delete(key);
    }
  }
  for (const [key, value] of history.entries()) {
    if (value.expiresAt < now) {
      history.delete(key);
    }
  }
}

setInterval(cleanupExpired, 60000);

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
    const existing = sessions.get(sessionListKey);

    if (!forceNew && existing && existing.expiresAt > Date.now()) {
      sessionId = existing.list[0];
      console.log(`Found active session for user ${userId}, goal ${effectiveGoalId}: ${sessionId}`);
      existing.expiresAt = Date.now() + SESSION_EXPIRATION_MS;
      return res.status(200).json({ 
        success: true,
        message: 'Existing session retrieved.',
        data: { sessionId }
      });
    }

    sessionId = uuidv4();
    console.log(`Creating new session for user ${userId}, goal ${effectiveGoalId}: ${sessionId}`);

    const list = existing ? [sessionId, ...existing.list].slice(0, 3) : [sessionId];
    sessions.set(sessionListKey, {
      list,
      expiresAt: Date.now() + SESSION_EXPIRATION_MS
    });

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
    const existing = sessions.get(sessionListKey);
    const list = existing && existing.expiresAt > Date.now() ? existing.list : [];
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
  const historyKey = `history:${sessionId}`;

  try {
    const existing = history.get(historyKey);
    const messages = existing && existing.expiresAt > Date.now() ? existing.messages : [];
    res.status(200).json(messages);
  } catch (error) {
    console.error(`Failed to retrieve history for session ${sessionId}:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const message = req.body;
  
  if (!message || typeof message !== 'object') {
    return res.status(400).json({ message: 'Invalid message format in request body.' });
  }

  const historyKey = `history:${sessionId}`;

  try {
    const existing = history.get(historyKey);
    const messages = existing ? existing.messages : [];
    messages.push(message);
    
    history.set(historyKey, {
      messages,
      expiresAt: Date.now() + HISTORY_EXPIRATION_MS
    });
    
    res.status(201).json({ message: 'Message added to history.' });
  } catch (error) {
    console.error(`Failed to add message to history for session ${sessionId}:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Conversation Service listening on port ${PORT}`);
});
