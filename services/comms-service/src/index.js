require('dotenv').config();
const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');

const wss = new WebSocketServer({ port: 8080 });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in the environment variables.");
  process.exit(1);
}

const AI_SERVICE_URL = 'ws://ai-service:8082/stream';

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
    console.log(`Token verified for user ID: ${userId}`);
    clientWs.userId = userId;

    const aiServiceWs = new WebSocket(AI_SERVICE_URL);

    aiServiceWs.on('open', () => {
      console.log(`Successfully connected to AI Service for user ${userId}`);
      clientWs.send('Welcome! Your connection is authenticated and bridged to the AI service.');

      // NOW that the AI service connection is open, start forwarding messages.
      clientWs.on('message', (message) => {
        console.log(`Forwarding message from user ${userId} to AI service.`);
        // No need to check readyState here, as we are in the 'open' handler.
        aiServiceWs.send(message);
      });

      // Also, set up the return path.
      aiServiceWs.on('message', (message) => {
        console.log(`Forwarding message from AI service to user ${userId}`);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(message);
        }
      });
    });

    // --- Keep the lifecycle event handlers outside ---

    clientWs.on('close', () => {
      console.log(`Client connection closed for user ${userId}. Closing connection to AI service.`);
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
