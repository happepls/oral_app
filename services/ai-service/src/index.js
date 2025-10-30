require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const AzureAiService = require('./azure/azureAiService');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 8082;

// WebSocket Server Logic
wss.on('connection', (ws) => {
  console.log('AI-Service: Connection established from comms-service.');

  const azureAiService = new AzureAiService(ws);
  try {
    azureAiService.initialize();
    azureAiService.start();
  } catch (error) {
    console.error('Failed to initialize or start Azure AI Service:', error);
    ws.close(1011, 'Failed to initialize AI service.');
    return;
  }

  // Handle incoming audio from the client WebSocket
  ws.on('message', (message) => {
    // The Azure SDK's PushAudioInputStream expects an ArrayBuffer.
    // Node.js's WebSocket library provides a Buffer. We need to convert it.
    if (Buffer.isBuffer(message)) {
      // Create an ArrayBuffer with the same byte length as the Buffer
      const arrayBuffer = new ArrayBuffer(message.length);
      // Create a view of the ArrayBuffer
      const view = new Uint8Array(arrayBuffer);
      // Copy the contents of the Buffer into the Uint8Array view
      for (let i = 0; i < message.length; ++i) {
        view[i] = message[i];
      }
      azureAiService.handleAudio(arrayBuffer);
    } else {
      console.log('Received non-buffer message:', message);
    }
  });

  ws.on('close', () => {
    console.log('AI-Service: Connection from comms-service closed. Stopping recognition.');
    azureAiService.stop();
  });

  ws.on('error', (error) => {
    console.error('AI-Service: WebSocket error:', error);
    azureAiService.stop();
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
