const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./models/db');

const app = express();
const PORT = process.env.PORT || 8000;

const sessions = new Map();
const SESSION_EXPIRATION_MS = 86400 * 7 * 1000;

function cleanupExpired() {
  const now = Date.now();
  for (const [key, value] of sessions.entries()) {
    if (value.expiresAt < now) {
      sessions.delete(key);
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

  try {
    const result = await db.query(
      `SELECT role, content, audio_url, created_at 
       FROM conversation_history 
       WHERE session_id = $1 
       ORDER BY created_at ASC`,
      [sessionId]
    );
    
    const messages = result.rows.map(row => ({
      role: row.role,
      content: row.content,
      audioUrl: row.audio_url,
      timestamp: row.created_at
    }));

    res.status(200).json({
      success: true,
      data: { messages }
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
    await db.query(
      `INSERT INTO conversation_history (session_id, user_id, role, content, audio_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, userId || null, role, content, audioUrl || null]
    );
    
    res.status(201).json({ message: 'Message added to history.' });
  } catch (error) {
    console.error(`Failed to add message to history for session ${sessionId}:`, error);
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
    const result = await db.query(
      `UPDATE conversation_history 
       SET content = $1, audio_url = COALESCE($2, audio_url)
       WHERE session_id = $3 AND role = $4 
       AND id = (SELECT id FROM conversation_history WHERE session_id = $3 AND role = $4 ORDER BY created_at DESC LIMIT 1)
       RETURNING id`,
      [content, audioUrl, sessionId, role]
    );
    
    if (result.rows.length === 0) {
      await db.query(
        `INSERT INTO conversation_history (session_id, user_id, role, content, audio_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, userId || null, role, content, audioUrl || null]
      );
    }
    
    res.status(200).json({ message: 'Message updated.' });
  } catch (error) {
    console.error(`Failed to update message for session ${sessionId}:`, error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.get('/history/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await db.query(
      `SELECT DISTINCT ON (session_id) session_id, role, content, created_at 
       FROM conversation_history 
       WHERE user_id = $1 
       ORDER BY session_id, created_at DESC`,
      [userId]
    );
    
    const conversations = result.rows.map(row => ({
      sessionId: row.session_id,
      lastMessage: row.content,
      timestamp: row.created_at
    }));

    res.status(200).json({
      success: true,
      data: conversations
    });
  } catch (error) {
    console.error(`Failed to retrieve history for user ${userId}:`, error);
    res.status(200).json({ success: true, data: [] });
  }
});

app.get('/history/stats/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const sessionCount = await db.query(
      `SELECT COUNT(DISTINCT session_id) as total_sessions FROM conversation_history WHERE user_id = $1`,
      [userId]
    );
    
    const messageCount = await db.query(
      `SELECT COUNT(*) as total_messages FROM conversation_history WHERE user_id = $1`,
      [userId]
    );

    res.status(200).json({
      success: true,
      data: {
        totalSessions: parseInt(sessionCount.rows[0]?.total_sessions || 0),
        totalMessages: parseInt(messageCount.rows[0]?.total_messages || 0),
        learningDays: 0,
        proficiency: 0
      }
    });
  } catch (error) {
    console.error(`Failed to retrieve stats for user ${userId}:`, error);
    res.status(200).json({ 
      success: true, 
      data: { totalSessions: 0, totalMessages: 0, learningDays: 0, proficiency: 0 }
    });
  }
});

app.listen(PORT, () => {
  console.log(`Conversation Service listening on port ${PORT}`);
});
