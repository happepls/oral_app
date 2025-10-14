const { WebSocketServer } = require('ws');
const axios = require('axios');

// Service URLs available through the Docker network
const USER_SERVICE_URL = 'http://user-service:3000/api/users/verify';
const CONVERSATION_SERVICE_URL = 'http://conversation-service:8083/start';

const wss = new WebSocketServer({ port: 8080 });



console.log('WebSocket server is running on port 8080');



wss.on('connection', async function connection(ws, req) {

  console.log('A new client is attempting to connect...');

  console.log('Incoming headers:', req.headers);



  // 1. Extract JWT from the Authorization header

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Connection rejected: No Bearer token provided.');
    ws.send('Error: Authorization token is required.');
    ws.close();
    return;
  }
  const token = authHeader; // Send the full "Bearer <token>" string

  let userId;

  // 2. Verify the token with the User Service
  try {
    const response = await axios.post(USER_SERVICE_URL, {}, {
      headers: { 'Authorization': token }
    });
    userId = response.data.user.id;
    console.log(`Token verified successfully for user ID: ${userId}`);
  } catch (error) {
    console.error('Connection rejected: Token verification failed.', error.response ? error.response.data : error.message);
    ws.send('Error: Invalid or expired authorization token.');
    ws.close();
    return;
  }

  console.log(`Client connected with user ID: ${userId}`);

  // 3. Notify the Conversation Service to start a new session with the authenticated user ID
  try {
    const response = await axios.post(CONVERSATION_SERVICE_URL, { userId });
    console.log('Successfully started a new conversation session:', response.data);
    ws.send(`Session started: ${response.data.sessionId}`);
  } catch (error) {
    console.error('Failed to start conversation session:', error.message);
    ws.send('Error: Could not start a new session.');
    ws.close();
    return;
  }

  ws.on('error', console.error);

  ws.on('message', function message(data) {
    console.log(`received from ${userId}: %s`, data);
    // Echo the message back to the client
    ws.send(`Echo from ${userId}: ${data}`);
  });

  ws.send('Welcome to the WebSocket server!');
});
