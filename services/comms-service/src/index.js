const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const { createClient } = require('redis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const http = require('http');

// --- Redis Client Setup ---
const redisClient = createClient({
  url: 'redis://redis:6379' // Assumes 'redis' is the service name in docker-compose
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// Create HTTP server for health checks and WS
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
if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in the environment variables.");
  process.exit(1);
}

const AI_SERVICE_URL = 'ws://ai-omni-service:8082/stream';
const MEDIA_SERVICE_URL = 'http://media-processing-service:3005/api/media/upload';

console.log('WebSocket server is running on port 8080');

wss.on('connection', async function connection(clientWs, req) {
// ... existing connection logic ...
  const connectionTime = new Date().toISOString();
  console.log(`[CONN] New attempt at ${connectionTime} from ${req.socket.remoteAddress}`);

  // Aggressive logging removed to reduce noise
  // clientWs.on('message', (data, isBinary) => {
  //     const type = isBinary ? 'Binary' : 'Text';
  //     const content = isBinary ? `${data.length} bytes` : data.toString();
  //     console.log(`[RAW RECV] ${type}: ${content.substring(0, 50)}...`);
  // });

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

    // --- Audio Recording Setup ---
    const recordingDir = path.join('/tmp', 'recordings');
    if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir, { recursive: true });
    }
    
    const userRecordingPath = path.join(recordingDir, `${sessionId}_user.pcm`);
    const aiRecordingPath = path.join(recordingDir, `${sessionId}_ai.pcm`);
    
    const userRecordingStream = fs.createWriteStream(userRecordingPath);
    const aiRecordingStream = fs.createWriteStream(aiRecordingPath);
    
    userRecordingStream.on('error', (err) => console.error(`Error writing user recording for session ${sessionId}:`, err));
    aiRecordingStream.on('error', (err) => console.error(`Error writing AI recording for session ${sessionId}:`, err));

    const aiServiceWs = new WebSocket(AI_SERVICE_URL);

    aiServiceWs.on('open', () => {
      console.log(`Successfully connected to AI Service for user ${userId} and session ${sessionId}`);
      
      // Send initialization message to AI Service
      aiServiceWs.send(JSON.stringify({
          type: 'session_start',
          userId: userId,
          sessionId: sessionId,
          token: token
      }));

      clientWs.send(JSON.stringify({ type: 'info', message: 'Welcome! Your connection is authenticated and bridged to the AI service.' }));

      // NOW that the AI service connection is open, start forwarding messages.
      clientWs.on('message', (message, isBinary) => {
        if (aiServiceWs.readyState === WebSocket.OPEN) {
          if (isBinary) {
            // Write to user recording stream
            if (userRecordingStream.writable) {
                userRecordingStream.write(message);
            }

            const messageForAI = JSON.stringify({
              type: 'audio_stream',
              payload: {
                  userId: userId,
                  sessionId: sessionId,
                  audioBuffer: message.toString('base64'),
                  context: {} 
              }
            });
            console.log(`Forwarding audio chunk (${message.length} bytes) to AI service`);
            aiServiceWs.send(messageForAI);
          } else {
             try {
                const msgStr = message.toString();
                const msgJson = JSON.parse(msgStr);
                
                if (['webrtc_offer', 'webrtc_answer', 'webrtc_candidate'].includes(msgJson.type)) {
                     console.log(`[WebRTC] Forwarding ${msgJson.type} from Client ${userId} to AI`);
                     aiServiceWs.send(msgStr);
                } else {
                     console.log(`[FORWARD TEXT] Client -> AI (${userId}): ${msgStr}`);
                     aiServiceWs.send(msgStr);
                }
             } catch (e) {
                 // Not JSON or parse error, just forward as string
                 console.log(`[FORWARD RAW] Client -> AI (${userId}): ${message.toString()}`);
                 aiServiceWs.send(message.toString());
             }
          }
        } else {
            console.log(`[DROP] Client -> AI (${userId}): AI service not ready (State: ${aiServiceWs.readyState})`);
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
                // Decode base64 and send as binary
                try {
                    const audioBuffer = Buffer.from(data.payload, 'base64');

                    // Write AI audio to AI recording stream
                    if (aiRecordingStream.writable) {
                        aiRecordingStream.write(audioBuffer);
                    }

                    // console.log(`Forwarding audio response as binary (${audioBuffer.length} bytes) to user ${userId}`);
                    clientWs.send(audioBuffer, { binary: true });
                } catch (err) {
                    console.error('Failed to decode audio payload:', err);
                }
            } else if (data.type === 'text_response') {
                // Map to 'ai_response' for frontend compatibility if needed, 
                // OR just forward and update frontend.
                // Let's forward as 'ai_response' to match existing frontend logic
                const responseToClient = JSON.stringify({
                    type: 'ai_response',
                    text: data.payload // Python sends text in payload
                });
                console.log(`Forwarding AI text response to user ${userId}: ${data.payload}`);
                clientWs.send(responseToClient);
            } else if (['webrtc_offer', 'webrtc_answer', 'webrtc_candidate'].includes(data.type)) {
                // WebRTC Signaling Forwarding
                console.log(`[WebRTC] Forwarding ${data.type} from AI service to user ${userId}`);
                clientWs.send(messageString);
            } else {
                // Forward other JSON messages (system_message, connection_established, etc.)
                console.log(`Forwarding ${data.type} from AI service to user ${userId}`);
                clientWs.send(messageString);
            }

          } else {
            console.log(`Forwarding binary message of size ${message.length} from AI service to user ${userId}.`);
            clientWs.send(message, { binary: true });
          }
        }
      });
    });

    clientWs.on('close', async () => {
      console.log(`Client connection closed for user ${userId}. Closing connection to AI service and cleaning up session.`);
      
      // --- Finalize Recording and Upload ---
      if (userRecordingStream && aiRecordingStream) {
          userRecordingStream.end();
          aiRecordingStream.end();
          console.log(`Recording finished for session ${sessionId}. Uploading to media service...`);
          
          try {
              // Wait for streams to finish closing
              await Promise.all([
                  new Promise(resolve => userRecordingStream.on('finish', resolve)),
                  new Promise(resolve => aiRecordingStream.on('finish', resolve))
              ]);
              
              const form = new FormData();
              let hasFiles = false;
              
              // Check user audio
              if (fs.existsSync(userRecordingPath) && fs.statSync(userRecordingPath).size > 0) {
                  form.append('user_audio', fs.createReadStream(userRecordingPath), { filename: path.basename(userRecordingPath) });
                  hasFiles = true;
              }
              
              // Check AI audio
              if (fs.existsSync(aiRecordingPath) && fs.statSync(aiRecordingPath).size > 0) {
                  form.append('ai_audio', fs.createReadStream(aiRecordingPath), { filename: path.basename(aiRecordingPath) });
                  hasFiles = true;
              }

              if (hasFiles) {
                  const response = await axios.post(MEDIA_SERVICE_URL, form, {
                      headers: {
                          ...form.getHeaders()
                      },
                      maxContentLength: Infinity,
                      maxBodyLength: Infinity
                  });
                  
                  console.log(`Recordings uploaded successfully for session ${sessionId}:`, response.data);
              } else {
                  console.log(`Recordings for session ${sessionId} were empty. Skipping upload.`);
              }
          } catch (err) {
              console.error(`Failed to upload recordings for session ${sessionId}:`, err.message);
          } finally {
              // Cleanup local files
              [userRecordingPath, aiRecordingPath].forEach(p => {
                  if (fs.existsSync(p)) {
                      fs.unlink(p, (err) => {
                          if (err) console.error(`Error deleting local recording ${p}:`, err);
                      });
                  }
              });
          }
      }

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

server.listen(8080, () => {
    console.log('HTTP and WebSocket server listening on port 8080');
});