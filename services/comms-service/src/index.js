const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const { createClient } = require('redis');

// --- Redis Client Setup ---
const redisClient = createClient({
  url: 'redis://redis:6379' // Assumes 'redis' is the service name in docker-compose
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

const wss = new WebSocketServer({ port: 8080 });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in the environment variables.");
  process.exit(1);
}

const AI_SERVICE_URL = 'ws://ai-omni-service:8082/stream';

console.log('WebSocket server is running on port 8080');

wss.on('connection', async function connection(clientWs, req) {
  console.log('A new client is attempting to connect...');

  try {
    const queryObject = url.parse(req.url, true).query;
    const token = queryObject.token;

    if (!token) {
      console.log('Connection rejected: No token provided.');
      clientWs.close(1008, 'Authorization token is required.');
      return;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.log(`Connection rejected: Invalid token. ${err.message}`);
      clientWs.close(1008, 'Invalid or expired authorization token.');
      return;
    }

    const userId = decoded.id;
    const sessionId = queryObject.sessionId;

    if (!sessionId) {
      console.log('Connection rejected: No sessionId provided.');
      clientWs.close(1008, 'Session ID is required.');
      return;
    }
    
    // --- Session Management with Redis ---
    const sessionKey = `session:${sessionId}`;
    await redisClient.hSet(sessionKey, {
        userId: userId,
        status: 'active',
        connectedAt: new Date().toISOString()
    });
    await redisClient.expire(sessionKey, 3600); // Expire session in 1 hour
    console.log(`Session ${sessionId} for user ${userId} created in Redis.`);


    console.log(`Token verified for user ID: ${userId}, Session ID: ${sessionId}`);
    clientWs.userId = userId;
    clientWs.sessionId = sessionId;

    const aiServiceWs = new WebSocket(AI_SERVICE_URL);

    aiServiceWs.on('open', () => {
      console.log(`Successfully connected to AI Service for user ${userId} and session ${sessionId}`);
      clientWs.send(JSON.stringify({ type: 'info', message: 'Welcome! Your connection is authenticated and bridged to the AI service.' }));

      // NOW that the AI service connection is open, start forwarding messages.
      clientWs.on('message', (message) => {
        if (aiServiceWs.readyState === WebSocket.OPEN) {
          if (Buffer.isBuffer(message)) {
            console.log(`Wrapping binary message of size ${message.length} from user ${userId}, session ${sessionId} into JSON for AI service.`);
            const messageForAI = JSON.stringify({
              type: 'audio_stream',
              userId: userId,
              sessionId: sessionId,
              audioBuffer: message.toString('base64'),
              context: {} 
            });
            aiServiceWs.send(messageForAI);
          } else {
             console.log(`Received non-binary message from user ${userId}. Ignoring.`);
          }
        }
      });

      aiServiceWs.on('message', (message) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          let isJson = false;
          let messageString = '';
          try {
            messageString = message.toString('utf8');
            JSON.parse(messageString);
            isJson = true;
          } catch (e) {
            isJson = false;
          }

          if (isJson) {
            console.log(`Forwarding text message from AI service to user ${userId}: ${messageString}`);
            clientWs.send(messageString);
          } else {
            console.log(`Forwarding binary message of size ${message.length} from AI service to user ${userId}.`);
            clientWs.send(message, { binary: true });
          }
        }
      });
    });

    clientWs.on('close', async () => {
      console.log(`Client connection closed for user ${userId}. Closing connection to AI service and cleaning up session.`);
      // --- Session Cleanup ---
      await redisClient.del(sessionKey);
      console.log(`Session ${sessionId} for user ${userId} removed from Redis.`);

      if (aiServiceWs.readyState === WebSocket.OPEN || aiServiceWs.readyState === WebSocket.CONNECTING) {
        aiServiceWs.close();
      }
    });

    aiServiceWs.on('close', () => {
      console.log(`Connection to AI service closed for user ${userId}.`);
      if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
        clientWs.close(1011, 'AI service connection lost.');
      }
    });

    clientWs.on('error', (error) => {
      console.error(`Error on client connection for user ${userId}:`, error);
      aiServiceWs.close();
    });

    aiServiceWs.on('error', (error) => {
      console.error(`Error on AI service connection for user ${userId}:`, error);
      clientWs.close(1011, 'Internal AI service connection error.');
    });

  } catch (error) {
    console.error('An unexpected error occurred during connection setup:', error);
    clientWs.close(1011, 'Internal server error');
  }
});