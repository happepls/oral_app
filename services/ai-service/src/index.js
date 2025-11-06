require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const AzureAiService = require('./azure/azureAiService');

const wss = new WebSocketServer({ port: 8082 });

console.log('AI Service is listening on port 8082');

wss.on('connection', (ws) => {
  console.log('AI-Service: Connection established from comms-service.');

  let azureService;
  try {
    azureService = new AzureAiService(ws);
    azureService.initialize();
    azureService.start();
  } catch (error) {
    console.error('Failed to initialize or start Azure AI Service:', error);
    ws.close(1011, 'Failed to initialize AI service.');
    return;
  }

  ws.on('message', (message) => {
    if (azureService) {
       if (Buffer.isBuffer(message)) {
        const arrayBuffer = message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength);
        azureService.handleAudio(arrayBuffer);
      }
    }
  });

  ws.on('close', () => {
    console.log('AI-Service: Connection from comms-service closed. Stopping recognition.');
    if (azureService) {
      azureService.stop();
    }
  });

  ws.on('error', (error) => {
    console.error('AI-Service: WebSocket error:', error);
    if (azureService) {
      azureService.stop();
    }
  });
});

// Simple health check endpoint
const app = express();
app.get('/health', (req, res) => res.send('OK'));
const server = app.listen(8081, () => console.log('AI Service health check listening on port 8081'));

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

