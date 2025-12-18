const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const { createClient } = require('redis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

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
const MEDIA_SERVICE_URL = 'http://media-processing-service:3005/api/media/upload';

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

    // --- Audio Recording Setup ---
    const recordingDir = path.join('/tmp', 'recordings');
    if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir, { recursive: true });
    }
    const recordingPath = path.join(recordingDir, `${sessionId}.pcm`); // Assuming raw PCM or whatever client sends
    const recordingStream = fs.createWriteStream(recordingPath);
    
    recordingStream.on('error', (err) => {
        console.error(`Error writing recording for session ${sessionId}:`, err);
    });

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
      clientWs.on('message', (message) => {
        if (aiServiceWs.readyState === WebSocket.OPEN) {
          if (Buffer.isBuffer(message)) {
            // Write to recording stream
            if (recordingStream.writable) {
                recordingStream.write(message);
            }

            // console.log(`Wrapping binary message of size ${message.length} from user ${userId}, session ${sessionId} into JSON for AI service.`);
            const messageForAI = JSON.stringify({
              type: 'audio_stream',
              userId: userId,
              sessionId: sessionId,
              audioBuffer: message.toString('base64'),
              context: {} 
            });
            aiServiceWs.send(messageForAI);
          } else {
             // Forward JSON messages (e.g. text chat) directly
             try {
                const msgStr = message.toString();
                const parsed = JSON.parse(msgStr);
                // Ensure userId/sessionId are attached if missing? 
                // For now, just forward what the client sends, trusting it matches the protocol or wrapping it.
                // The Python service expects { type: 'text_message', payload: { text: ... } }
                // Let's assume the client sends the correct format or we map it here.
                // If the client sends { type: 'chat', text: '...' }, we might need to transform.
                // For now, let's just forward.
                console.log(`Forwarding JSON message from user ${userId}: ${msgStr}`);
                aiServiceWs.send(msgStr);
             } catch (e) {
                 console.log(`Received invalid non-binary message from user ${userId}. Ignoring.`);
             }
          }
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
      if (recordingStream) {
          recordingStream.end();
          console.log(`Recording finished for session ${sessionId}. Uploading to media service...`);
          
          try {
              // Wait for stream to finish closing
              await new Promise(resolve => recordingStream.on('finish', resolve));
              
              const form = new FormData();
              // Check if file has size
              const stats = fs.statSync(recordingPath);
              if (stats.size > 0) {
                  form.append('audio', fs.createReadStream(recordingPath));
                  // You might want to pass userId/sessionId metadata if the media service supports it
                  
                  const response = await axios.post(MEDIA_SERVICE_URL, form, {
                      headers: {
                          ...form.getHeaders()
                      },
                      maxContentLength: Infinity,
                      maxBodyLength: Infinity
                  });
                  
                  console.log(`Recording uploaded successfully for session ${sessionId}:`, response.data);
              } else {
                  console.log(`Recording for session ${sessionId} was empty. Skipping upload.`);
              }
          } catch (err) {
              console.error(`Failed to upload recording for session ${sessionId}:`, err.message);
          } finally {
              // Cleanup local file
              if (fs.existsSync(recordingPath)) {
                  fs.unlink(recordingPath, (err) => {
                      if (err) console.error(`Error deleting local recording ${recordingPath}:`, err);
                  });
              }
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