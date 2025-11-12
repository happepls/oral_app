require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const Qwen3OmniService = require('./qwen3omni/qwen3OmniService');

const wss = new WebSocketServer({ port: 8082 });

let aiService = null; // To hold the active AI service instance

wss.on('connection', async (ws) => {
    console.log('AI-Service: Connection established from comms-service.');

    // 1. Clean up any existing service instance before creating a new one.
    if (aiService) {
        console.log('Cleaning up previous AI service instance...');
        try {
            await aiService.stop();
        } catch (error) {
            console.error('Error during cleanup of previous AI service instance:', error);
        }
        aiService = null;
    }

    // 2. Create and start the new service instance (only Qwen3-Omni is supported now)
    console.log('Using Qwen3-Omni AI engine');
    aiService = new Qwen3OmniService(ws);
    
    try {
        await aiService.start();
    } catch (error) {
        console.error(`Failed to initialize or start Qwen3-Omni AI Service:`, error);
        ws.close(1011, `Internal server error during AI service initialization.`);
        aiService = null; // Ensure instance is cleared on startup failure
        return;
    }

    ws.on('message', (message) => {
        if (aiService) {
            aiService.handleAudio(message);
        }
    });

    ws.on('close', async () => {
        console.log('AI-Service: Connection closed from comms-service.');
        // The cleanup is now handled at the start of a new connection,
        // but we can also stop the current service instance here.
        if (aiService) {
            await aiService.stop();
            aiService = null;
        }
    });

    ws.on('error', (error) => {
        console.error('AI-Service: WebSocket error:', error);
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