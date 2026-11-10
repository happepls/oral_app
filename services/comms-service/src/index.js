const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const http = require('http');
const { checkAccess } = require('./sceneAccess');
const { checkLoginSession } = require('./loginSession');
const { accessCookie, sessionCredential } = require('./sessionCredential');

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
  // The browser may send session_start immediately after WebSocket open, while
  // the authority request below is still pending. Buffer only a bounded amount
  // until authorization succeeds; never forward it before that decision.
  const earlyMessages = [];
  let earlyBytes = 0;
  const queueEarly = (message, isBinary) => {
    earlyBytes += message.length;
    if (earlyMessages.length >= 100 || earlyBytes > 2 * 1024 * 1024) {
      clientWs.close(1009, 'Initial message buffer exceeded');
      return;
    }
    earlyMessages.push({ message, isBinary });
  };
  clientWs.on('message', queueEarly);

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
      token = accessCookie(req.headers.cookie);
    }

    if (!token) {
      console.log('Connection rejected: No token provided.');
      clientWs.send(JSON.stringify({ type: 'error', payload: { status: 401, code: 'authentication_required', message: 'authentication_required' } }));
      clientWs.close(1008, 'Authorization token is required.');
      return;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.log(`Connection rejected: Invalid token. ${err.message}`);
      clientWs.send(JSON.stringify({ type: 'error', payload: { status: 401, code: 'authentication_required', message: 'authentication_required' } }));
      clientWs.close(1008, 'Invalid or expired authorization token.');
      return;
    }

    if ((usesRealtimeTicket && decoded.type !== 'realtime_ticket') || (!usesRealtimeTicket && decoded.type !== 'access')) {
      console.log('Connection rejected: token is not a realtime ticket.');
      clientWs.send(JSON.stringify({ type: 'error', payload: { status: 401, code: 'authentication_required', message: 'authentication_required' } }));
      clientWs.close(1008, 'Invalid realtime ticket.');
      return;
    }

    const credential = sessionCredential(token, decoded, req.headers.cookie, JWT_SECRET);
    console.log(`[SESSION_AUTH] ${credential.browserCookie ? 'bound_browser_cookie' : usesRealtimeTicket ? 'ticket' : 'access'}`);
    // Tickets govern admission, not a browser conversation's lifetime. Reuse
    // the identity-bound browser credential, with its original expiry, for
    // ongoing checks and AI callbacks. Ticket-only partners retain their
    // existing short-lived internal bridge token.
    if (!usesRealtimeTicket || decoded.sid) await checkLoginSession(credential.token, credential.claims);
    const aiToken = usesRealtimeTicket && !credential.browserCookie
      ? jwt.sign({ id: decoded.id, type: 'access', ...(decoded.sid ? { sid: decoded.sid } : { delegated_grant_id: decoded.grant_id, delegated_client_id: decoded.client_id }) }, JWT_SECRET, {
          algorithm: 'HS256',
          issuer: 'oral-app',
          audience: 'oral-app-users',
          expiresIn: '2m',
        })
      : credential.token;

    const userId = decoded.id;
    if ((decoded.sid || (!usesRealtimeTicket && process.env.DEVICE_SESSION_LIMIT_ENABLED === 'true'))) {
      let checking = false;
      const verifySession = async () => {
        if (checking || clientWs.readyState !== WebSocket.OPEN) return;
        checking = true;
        try { await checkLoginSession(credential.token, credential.claims); }
        catch (error) {
          if (clientWs.readyState === WebSocket.OPEN) {
            console.warn(`[SESSION_AUTH_FAILED] stage=heartbeat status=${error.status || 503} code=${error.code || 'authorization_unavailable'}`);
            clientWs.send(JSON.stringify({ type: 'error', payload: { status: error.status || 503, code: error.message, message: error.message } }));
            clientWs.close(error.status === 401 ? 4003 : 1011, error.message);
          }
        } finally { checking = false; }
      };
      const timer = setInterval(verifySession, 10000);
      clientWs.once('close', () => clearInterval(timer));
    }
    if (!userId) {
      clientWs.send(JSON.stringify({ type: 'error', payload: { status: 401, code: 'authentication_required', message: 'authentication_required' } }));
      clientWs.close(1008, 'authentication_required');
      return;
    }
    const sessionId = queryObject.sessionId;
    const scenario = queryObject.scenario;
    const voice = queryObject.voice;
    const ALLOWED_MODES = new Set(['recall', 'daily_qa', 'quick_experience']);
    const rawMode = queryObject.mode;
    const mode = (rawMode && ALLOWED_MODES.has(rawMode)) ? rawMode : null;
    if (rawMode && !mode) {
      clientWs.send(JSON.stringify({ type: 'error', payload: { status: 403, code: 'mode_invalid', message: 'mode_invalid' } }));
      clientWs.close(1008, 'mode_invalid');
      return;
    }

    const authorization = await checkAccess(userId, scenario, mode);
    if (clientWs.readyState !== WebSocket.OPEN) return;
    if (!authorization.allowed) {
      clientWs.send(JSON.stringify({ type: 'error', payload: { status: authorization.status, code: authorization.reason, message: authorization.reason } }));
      clientWs.close(authorization.status === 503 ? 1011 : 1008, authorization.reason);
      return;
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
    let downstreamCloseStarted = false;
    const messageQueue = [];

    const closeClientForUpstreamFailure = (upstreamCode, upstreamReason) => {
      if (downstreamCloseStarted || clientWs.readyState !== WebSocket.OPEN) return;
      downstreamCloseStarted = true;
      const reason = upstreamReason?.toString() || 'AI service connection closed';
      const reconnectable = upstreamCode !== 1008 && upstreamCode !== 4400;
      clientWs.send(JSON.stringify({
        type: 'connection_closed',
        payload: {
          code: upstreamCode,
          reason,
          reconnectable,
        }
      }));
      // 1005/1006 are reserved and cannot be sent in a close frame. Normalize
      // every unexpected upstream loss to a retryable server-error close so the
      // browser's normal reconnect path runs instead of remaining falsely OPEN.
      clientWs.close(reconnectable ? 1011 : 1008, reconnectable
        ? 'AI service connection lost'
        : 'AI service rejected connection');
    };

    let sessionCheck;
    let pendingSessionBytes = 0;
    const forwardToAI = async (message, isBinary) => {
      if ((decoded.sid || (!usesRealtimeTicket && process.env.DEVICE_SESSION_LIMIT_ENABLED === 'true'))) {
        pendingSessionBytes += message.length;
        if (pendingSessionBytes > 2 * 1024 * 1024) { clientWs.close(1009, 'Session validation buffer exceeded'); return; }
        try {
          if (!sessionCheck) sessionCheck = checkLoginSession(credential.token, credential.claims).finally(() => { sessionCheck = null; });
          await sessionCheck;
        } catch (error) {
          if (clientWs.readyState === WebSocket.OPEN) {
            console.warn(`[SESSION_AUTH_FAILED] stage=message status=${error.status || 503} code=${error.code || 'authorization_unavailable'}`);
            clientWs.send(JSON.stringify({ type: 'error', payload: { status: error.status || 503, code: error.message, retryable: error.status !== 401 } }));
            clientWs.close(error.status === 401 ? 4003 : 1011, error.message);
          }
          return;
        } finally { pendingSessionBytes -= message.length; }
        if (clientWs.readyState !== WebSocket.OPEN) return;
      }
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

    const handleClientMessage = (message, isBinary) => {
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
    };
    clientWs.off('message', queueEarly);
    clientWs.on('message', handleClientMessage);
    for (const { message, isBinary } of earlyMessages) handleClientMessage(message, isBinary);

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
          closeClientForUpstreamFailure(1011, error.message || 'AI service connection error');
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
                const responseId = Buffer.from(String(data.responseId || ''), 'utf8');
                if (responseId.length > 255) throw new Error('responseId is too long');
                const header = Buffer.from([0x47, 0x4a, 0x01, responseId.length]);
                const packet = Buffer.concat([header, responseId, audioBuffer]);
                console.log(`Forwarding audio_response to user ${userId}, size: ${audioBuffer.length} bytes`);
                clientWs.send(packet, { binary: true });
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
        closeClientForUpstreamFailure(code, reason);
      });

      // Remove duplicate error handler - already handled above
      // aiServiceWs.on('error', ...) is already registered

      // `ws` automatically replies to protocol-level ping frames. Do not send
      // a second manual pong here; application heartbeat is owned by the browser.

    } catch (error) {
      console.error('Failed to connect to AI service:', error.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: `Could not connect to AI service: ${error.message}`
        }));
        closeClientForUpstreamFailure(1011, error.message);
      }
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
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify({ type: 'error', payload: { status: error.status || 503, code: error.message, retryable: error.status !== 401 } }));
    clientWs.close(error.status === 401 ? 4003 : 1011, error.status === 401 ? 'SESSION_REVOKED' : 'Internal server error');
  }
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`HTTP and WebSocket server listening on port ${PORT}`);
});
