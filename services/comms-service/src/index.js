require('dotenv').config();
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');

const wss = new WebSocketServer({ port: 8080 });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in the environment variables.");
  process.exit(1);
}

console.log('WebSocket server is running on port 8080');

wss.on('connection', async function connection(ws, req) {
  console.log('A new client is attempting to connect...');

  try {
    // 1. Extract JWT from the query parameter
    const queryObject = url.parse(req.url, true).query;
    const token = queryObject.token;

    if (!token) {
      console.log('Connection rejected: No token provided in query string.');
      ws.close(1008, 'Authorization token is required.');
      return;
    }

    // 2. Verify the token internally
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.log(`Connection rejected: Invalid token. ${err.message}`);
      ws.close(1008, 'Invalid or expired authorization token.');
      return;
    }

    const userId = decoded.id; // Assuming the token payload has an 'id' field
    console.log(`Token verified successfully for user ID: ${userId}`);
    
    ws.userId = userId; // Attach userId to the ws connection object for later use

    ws.on('error', console.error);

    ws.on('message', function message(data) {
      console.log(`received from ${this.userId}: %s`, data);
      // Echo the message back to the client
      ws.send(`Echo from ${this.userId}: ${data}`);
    });

    ws.send('Welcome! Your connection is authenticated.');
    console.log(`Client connected and authenticated with user ID: ${ws.userId}`);

  } catch (error) {
    console.error('An unexpected error occurred during connection setup:', error);
    ws.close(1011, 'Internal server error');
  }
});
