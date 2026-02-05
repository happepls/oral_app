const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const http = require('http');

const sessions = new Map();

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/health' || parsedUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', service: 'comms-service', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

const JWT_SECRET = process.env.JWT_SECRET || 'oral-ai-jwt-secret-key-2025';

const AI_SERVICE_URL = process.env.AI_SERVICE_WS_URL || 'ws://localhost:8008/stream';

console.log('WebSocket server initializing...');
console.log(`AI Service URL: ${AI_SERVICE_URL}`);

wss.on('connection', async function connection(clientWs, req) {
  const connectionTime = new Date().toISOString();
  console.log(`[CONN] New attempt at ${connectionTime} from ${req.socket.remoteAddress}`);

  try {
    const queryObject = url.parse(req.url, true).query;
    let token = queryObject.token;

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

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
    const scenario = queryObject.scenario;
    const voice = queryObject.voice;

    if (!sessionId) {
      console.log('Connection rejected: No sessionId provided.');
      clientWs.close(1008, 'Session ID is required.');
      return;
    }

    sessions.set(sessionId, {
      userId,
      status: 'active',
      connectedAt: new Date().toISOString()
    });

    console.log(`Token verified for user ID: ${userId}, Session ID: ${sessionId}`);
    clientWs.userId = userId;
    clientWs.sessionId = sessionId;

    let aiServiceWs = null;
    let bridgeReady = false;
    const messageQueue = [];

    const forwardToAI = (message, isBinary) => {
      if (!aiServiceWs || aiServiceWs.readyState !== WebSocket.OPEN) return;
      if (isBinary) {
        aiServiceWs.send(JSON.stringify({
          type: 'audio_stream',
          payload: { userId, sessionId, audioBuffer: message.toString('base64'), context: {} }
        }));
      } else {
        aiServiceWs.send(message.toString());
      }
    };

    clientWs.on('message', (message, isBinary) => {
      if (bridgeReady && aiServiceWs && aiServiceWs.readyState === WebSocket.OPEN) {
        forwardToAI(message, isBinary);
      } else {
        messageQueue.push({ message, isBinary });
      }
    });

    try {
      // Build connection URL with query parameters
      const aiUrl = new URL(AI_SERVICE_URL);
      aiUrl.searchParams.set('token', token);
      aiUrl.searchParams.set('sessionId', sessionId);
      if (scenario) aiUrl.searchParams.set('scenario', scenario);
      if (voice) aiUrl.searchParams.set('voice', voice);
      
      console.log(`Connecting to AI service: ${aiUrl.toString()}`);
      aiServiceWs = new WebSocket(aiUrl.toString());

      aiServiceWs.on('open', () => {
        console.log(`Successfully connected to AI Service for user ${userId} and session ${sessionId}`);

        // Session is now initialized via query params, no need to send session_start

        bridgeReady = true;
        while (messageQueue.length > 0) {
          const { message, isBinary } = messageQueue.shift();
          forwardToAI(message, isBinary);
        }

        clientWs.send(JSON.stringify({ type: 'info', message: 'Welcome! Your connection is authenticated and bridged to the AI service.' }));
      });

      aiServiceWs.on('message', (message) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          let isJson = false;
          let messageString = '';
          let data = null;

          try {
            messageString = message.toString('utf8');
            data = JSON.parse(messageString);
            isJson = true;
          } catch (e) {
            isJson = false;
          }

          if (isJson) {
            if (data.type === 'audio_response' && data.payload) {
              try {
                const audioBuffer = Buffer.from(data.payload, 'base64');
                clientWs.send(audioBuffer, { binary: true });
              } catch (err) {
                console.error('Failed to decode audio payload:', err);
              }
            } else if (data.type === 'text_response') {
              const responseToClient = JSON.stringify({
                type: 'ai_response',
                text: data.payload
              });
              console.log(`Forwarding AI text response to user ${userId}: ${data.payload}`);
              clientWs.send(responseToClient);
            } else {
              console.log(`Forwarding ${data.type} from AI service to user ${userId}`);
              clientWs.send(messageString);
            }
          } else {
            console.log(`Forwarding binary message of size ${message.length} from AI service to user ${userId}.`);
            clientWs.send(message, { binary: true });
          }
        }
      });

      aiServiceWs.on('close', () => {
        console.log(`Connection to AI service closed for user ${userId}.`);
        if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
          clientWs.close(1011, 'AI service connection lost.');
        }
      });

      aiServiceWs.on('error', (error) => {
        console.error(`Error on AI service connection for user ${userId}:`, error.message);
        clientWs.send(JSON.stringify({ 
          type: 'error', 
          message: 'AI service connection failed. Please try again later.' 
        }));
      });

    } catch (error) {
      console.error('Failed to connect to AI service:', error.message);
      clientWs.send(JSON.stringify({ 
        type: 'error', 
        message: 'Could not connect to AI service.' 
      }));
    }

    clientWs.on('close', () => {
      console.log(`Client connection closed for user ${userId}.`);
      sessions.delete(sessionId);
      if (aiServiceWs && (aiServiceWs.readyState === WebSocket.OPEN || aiServiceWs.readyState === WebSocket.CONNECTING)) {
        aiServiceWs.close();
      }
    });

    clientWs.on('error', (error) => {
      console.error(`Error on client connection for user ${userId}:`, error);
      if (aiServiceWs) aiServiceWs.close();
    });

  } catch (error) {
    console.error('An unexpected error occurred during connection setup:', error);
    clientWs.close(1011, 'Internal server error');
  }
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`HTTP and WebSocket server listening on port ${PORT}`);
});
