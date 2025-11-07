require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const AzureAiService = require('./azure/azureAiService');

const wss = new WebSocketServer({ port: 8082 });

let azureAiService = null; // To hold the single, active AI service instance

wss.on('connection', async (ws) => {
    console.log('AI-Service: Connection established from comms-service.');

    // 1. Clean up any existing service instance before creating a new one.
    if (azureAiService) {
        console.log('Cleaning up previous AI service instance...');
        try {
            await azureAiService.stop();
        } catch (error) {
            console.error('Error during cleanup of previous AI service instance:', error);
        }
        azureAiService = null;
    }

    // 2. Create and start the new service instance.
    azureAiService = new AzureAiService(ws);
    try {
        await azureAiService.start();
    } catch (error) {
        console.error("Failed to initialize or start Azure AI Service:", error);
        ws.close(1011, "Internal server error during AI service initialization.");
        azureAiService = null; // Ensure instance is cleared on startup failure
        return;
    }

    ws.on('message', (message) => {
        if (azureAiService) {
            azureAiService.handleAudio(message);
        }
    });

    ws.on('close', async () => {
        console.log('AI-Service: Connection closed from comms-service.');
        // The cleanup is now handled at the start of a new connection,
        // but we can also stop the current service instance here.
        if (azureAiService) {
            await azureAiService.stop();
            azureAiService = null;
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

