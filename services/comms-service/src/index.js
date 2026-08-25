const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const http = require('http');

const sessions = new Map();
const activeConnections = new Map();

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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');

const AI_SERVICE_URL = process.env.AI_SERVICE_WS_URL || 'ws://ai-omni-service:8082/stream';

console.log('WebSocket server initializing...');
console.log('AI service bridge configured.');

wss.on('connection', async function connection(clientWs, req) {
  const connectionTime = new Date().toISOString();
  console.log(`[CONN] New attempt at ${connectionTime} from ${req.socket.remoteAddress}`);

  try {
    const queryObject = url.parse(req.url, true).query;
    // Browser partner clients cannot attach custom headers during WebSocket
    // upgrade. Developer API therefore issues a 60-second `ticket`; first-party
    // clients continue to use the existing token/cookie paths.
    const usesRealtimeTicket = Boolean(queryObject.ticket);
    let token = queryObject.token || queryObject.ticket;

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    // Fallback: read from httpOnly cookie
    if (!token && req.headers.cookie) {
      const cookies = Object.fromEntries(
        req.headers.cookie.split(';').map(c => c.trim().split('=').map(decodeURIComponent))
      );
      token = cookies['accessToken'];
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

    if (usesRealtimeTicket && decoded.type !== 'realtime_ticket') {
      console.log('Connection rejected: token is not a realtime ticket.');
      clientWs.close(1008, 'Invalid realtime ticket.');
      return;
    }

    // The browser-facing ticket is deliberately accepted only by comms. AI
    // still calls user/conversation services, which accept access tokens, so
    // mint a short-lived internal token instead of forwarding the ticket.
    const aiToken = usesRealtimeTicket
      ? jwt.sign({ id: decoded.id, type: 'access' }, JWT_SECRET, {
          algorithm: 'HS256',
          issuer: 'oral-app',
          audience: 'oral-app-users',
          expiresIn: '2m',
        })
      : token;

    const userId = decoded.id;
    const sessionId = queryObject.sessionId;
    const scenario = queryObject.scenario;
    const voice = queryObject.voice;
    const ALLOWED_MODES = new Set(['recall', 'daily_qa']);
    const rawMode = queryObject.mode;
    const mode = (rawMode && ALLOWED_MODES.has(rawMode)) ? rawMode : null;
    if (rawMode && !mode) {
      console.warn(`[comms] Rejected unknown mode='${rawMode}' from client; forwarding without mode`);
    }

    if (!sessionId) {
      console.log('Connection rejected: No sessionId provided.');
      clientWs.close(1008, 'Session ID is required.');
      return;
    }

    const connectionKey = `${userId}:${sessionId}`;
    const previousConnection = activeConnections.get(connectionKey);
    if (previousConnection && previousConnection !== clientWs) {
      console.log(`[TAKEOVER] Replacing prior connection user=${userId} session=${sessionId}`);
      try {
        if (previousConnection.readyState === WebSocket.OPEN || previousConnection.readyState === WebSocket.CONNECTING) {
          previousConnection.close(4001, 'Session connection replaced');
        }
      } catch (error) {
        console.error(`[TAKEOVER] Failed to close prior connection: ${error.message}`);
      }
    }
    activeConnections.set(connectionKey, clientWs);

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
        // Handle binary audio data
        const audioBase64 = message.toString('base64');
        aiServiceWs.send(JSON.stringify({
          type: 'audio_stream',
          payload: {
            audio: audioBase64,
            sample_rate: 16000,
            format: 'pcm'
          }
        }));
      } else {
        // Handle JSON messages - parse and forward appropriately
        try {
          const messageStr = message.toString();
          const parsedMessage = JSON.parse(messageStr);
          if (parsedMessage.type === 'session_start') {
            parsedMessage.userId = userId;
            delete parsedMessage.token;
            if (parsedMessage.payload && typeof parsedMessage.payload === 'object') {
              parsedMessage.payload.userId = userId;
              delete parsedMessage.payload.token;
            }
            aiServiceWs.send(JSON.stringify(parsedMessage));
            return;
          }
          
          // Check if this is an audio_stream message with the new format
          if (parsedMessage.type === 'audio_stream' && parsedMessage.payload && typeof parsedMessage.payload === 'object') {
            // Forward audio_stream messages as-is (they're already in correct format)
            aiServiceWs.send(messageStr);
          } else {
            // Forward other JSON messages as-is
            aiServiceWs.send(messageStr);
          }
        } catch (e) {
          // If parsing fails, forward as plain text
          aiServiceWs.send(message.toString());
        }
      }
    };

    clientWs.on('message', (message, isBinary) => {
      if (!isBinary) {
        try {
          const heartbeat = JSON.parse(message.toString());
          if (heartbeat.type === 'ping') {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'pong',
                timestamp: heartbeat.timestamp,
                sequence: heartbeat.sequence,
              }));
            }
            return;
          }
        } catch (_) {
          // Non-JSON text is forwarded to the AI bridge below.
        }
      }
      if (bridgeReady && aiServiceWs && aiServiceWs.readyState === WebSocket.OPEN) {
        forwardToAI(message, isBinary);
      } else {
        messageQueue.push({ message, isBinary });
      }
    });

    try {
      // Build connection URL — token is passed via Authorization header (not URL) to avoid log exposure
      const aiUrl = new URL(AI_SERVICE_URL);
      aiUrl.searchParams.set('sessionId', sessionId);
      if (scenario) aiUrl.searchParams.set('scenario', scenario);
      if (voice) aiUrl.searchParams.set('voice', voice);
      if (mode) aiUrl.searchParams.set('mode', mode);

      console.log(`[AI_CONNECT] user=${userId} session=${sessionId} mode=${mode || 'scenario'}`);

      // Add additional options for WebSocket connection
      const wsOptions = {
        headers: {
          'User-Agent': 'Oral-AI-Comms-Service/1.0',
          'Authorization': `Bearer ${aiToken}`,
        }
      };

      // Set connection timeout to prevent hanging
      const connectionTimeout = setTimeout(() => {
        if (!bridgeReady && aiServiceWs && aiServiceWs.readyState === WebSocket.CONNECTING) {
          console.log(`Connection timeout for user ${userId} after 15 seconds`);
          aiServiceWs.close();
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'error',
              message: 'AI service connection timeout. Please try again.'
            }));
          }
        }
      }, 15000);

      aiServiceWs = new WebSocket(aiUrl.toString(), wsOptions);

      aiServiceWs.on('open', () => {
        console.log(`[AI_OPEN] Successfully connected to AI Service for user ${userId} and session ${sessionId}`);
        clearTimeout(connectionTimeout);

        // Session is now initialized via query params, no need to send session_start
        // AI service will send connection_established, so we don't duplicate it
        
        // Log when we receive connection_established from AI service
        const originalOnMessage = aiServiceWs.onmessage;
        aiServiceWs.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data.toString());
            if (msg.type === 'connection_established') {
              console.log(`[CONN_ESTABLISHED] Received from AI service for user ${userId}, forwarding to client`);
            }
          } catch (e) {
            // Not JSON, ignore
          }
          if (originalOnMessage) originalOnMessage.call(aiServiceWs, event);
        };

        bridgeReady = true;
        while (messageQueue.length > 0) {
          const { message, isBinary } = messageQueue.shift();
          forwardToAI(message, isBinary);
        }
      });

      aiServiceWs.on('error', (error) => {
        console.error(`AI Service WebSocket error for user ${userId}:`, error.message);
        clearTimeout(connectionTimeout);
        
        // Close client connection with error message
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'error',
            message: `AI service connection failed: ${error.message || 'Unknown error'}. Please try again.`
          }));
          clientWs.close(1011, 'AI service connection error');
        }
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
                console.log(`Forwarding audio_response to user ${userId}, size: ${audioBuffer.length} bytes`);
                clientWs.send(audioBuffer, { binary: true });
              } catch (err) {
                console.error(`Failed to decode audio payload: ${err.message}`);
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

      aiServiceWs.on('close', (code, reason) => {
        console.log(`Connection to AI service closed for user ${userId}. Code: ${code}, Reason: ${reason?.toString()}`);
        
        // Send connection_closed event to client for proper handling
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'connection_closed',
            payload: {
              code: code,
              reason: reason?.toString() || 'AI service connection closed',
              reconnectable: code !== 1008 && code !== 1011  // Protocol errors are not reconnectable
            }
          }));
          
          // Only close client connection for fatal errors
          if (code === 1008 || code === 1011) {
            clientWs.close(code, reason?.toString() || 'AI service connection lost.');
          }
        }
      });

      // Remove duplicate error handler - already handled above
      // aiServiceWs.on('error', ...) is already registered

      // `ws` automatically replies to protocol-level ping frames. Do not send
      // a second manual pong here; application heartbeat is owned by the browser.

    } catch (error) {
      console.error('Failed to connect to AI service:', error.message);
      clientWs.send(JSON.stringify({
        type: 'error',
        message: `Could not connect to AI service: ${error.message}`
      }));
    }

    clientWs.on('close', () => {
      console.log(`Client connection closed for user ${userId}.`);
      if (activeConnections.get(connectionKey) === clientWs) {
        activeConnections.delete(connectionKey);
        sessions.delete(sessionId);
      }
      if (aiServiceWs) {
        try {
          if (aiServiceWs.readyState === WebSocket.OPEN || aiServiceWs.readyState === WebSocket.CONNECTING) {
            aiServiceWs.close();
          }
        } catch (error) {
          console.error(`Error closing AI service connection: ${error.message}`);
        }
      }
    });

    clientWs.on('error', (error) => {
      console.error(`Error on client connection for user ${userId}:`, error);
      if (aiServiceWs) {
        try {
          aiServiceWs.close();
        } catch (closeError) {
          console.error(`Error closing AI service connection: ${closeError.message}`);
        }
      }
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
