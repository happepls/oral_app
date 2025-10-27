const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = 8082;

// WebSocket Server Logic
wss.on('connection', (ws) => {
  console.log('AI-Service: Connection established from comms-service.');

  ws.on('message', (message) => {
    // For now, just log the received message.
    // This is where the ASR -> LLM -> TTS pipeline will be triggered.
    console.log(`AI-Service: Message received. Type: ${typeof message}`);
    console.log('AI-Service: Received audio chunk from comms-service:', message.toString());
    // Echo back for testing
    ws.send('AI-Service Echo: message received.');
  });

  ws.on('close', () => {
    console.log('AI-Service: Connection from comms-service closed.');
  });

  ws.on('error', (error) => {
    console.error('AI-Service: WebSocket error:', error);
  });
});

// HTTP Server Logic
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'AI Service is healthy' });
});

app.get('/', (req, res) => {
  res.send('AI Service is running');
});

// Upgrade HTTP server to handle WebSocket requests
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;

  if (pathname === '/stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`AI Service is listening on port ${PORT}`);
});
