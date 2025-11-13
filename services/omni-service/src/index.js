require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    code: 200, 
    message: 'Omni service is running',
    data: { timestamp: new Date().toISOString() }
  });
});

// WebSocket connection handling
wss.on('connection', async function connection(ws, req) {
  console.log('New client connected to omni-service');
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'info',
    message: 'Welcome to the Omni service!'
  }));

  // Handle incoming messages
  ws.on('message', async (message) => {
    try {
      // For now, just echo the message back
      // This will be replaced with actual ASR-LLM-TTS processing
      console.log('Received message:', message);
      
      // Echo back for testing
      ws.send(message);
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Error processing your request'
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from omni-service');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 8081;
const WS_PORT = process.env.WS_PORT || 8082;

server.listen(PORT, () => {
  console.log(`Omni service HTTP server running on port ${PORT}`);
  console.log(`Omni service WebSocket server running on port ${WS_PORT}`);
});