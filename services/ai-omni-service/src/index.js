import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';

import { MockAIService } from './mock-ai-service.js';

dotenv.config();

class UnifiedAIService {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.aiService = new MockAIService();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupHealthCheck();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        code: 200, 
        message: 'AI Omni Service is running', 
        data: { 
          service: 'ai-omni-service',
          status: 'healthy',
          timestamp: new Date().toISOString()
        }
      });
    });

    // Text processing API
    this.app.post('/api/process/text', async (req, res) => {
      try {
        const { text, userId, context = {} } = req.body;
        
        if (!text || !userId) {
          return res.status(400).json({
            code: 400,
            message: 'Missing required fields: text and userId',
            data: null
          });
        }

        const result = await this.aiService.processText(text, userId, context);
        
        res.json({
          code: 200,
          message: 'Text processed successfully',
          data: result
        });
      } catch (error) {
        console.error('Error processing text:', error);
        res.status(500).json({
          code: 500,
          message: 'Internal server error',
          data: null
        });
      }
    });

    // Audio processing API
    this.app.post('/api/process/audio', async (req, res) => {
      try {
        const { audioBuffer, userId, context = {} } = req.body;
        
        if (!audioBuffer || !userId) {
          return res.status(400).json({
            code: 400,
            message: 'Missing required fields: audioBuffer and userId',
            data: null
          });
        }

        // Convert base64 to buffer if needed
        const buffer = Buffer.isBuffer(audioBuffer) 
          ? audioBuffer 
          : Buffer.from(audioBuffer, 'base64');

        const result = await this.aiService.processAudio(buffer, userId, context);
        
        res.json({
          code: 200,
          message: 'Audio processed successfully',
          data: result
        });
      } catch (error) {
        console.error('Error processing audio:', error);
        res.status(500).json({
          code: 500,
          message: 'Internal server error',
          data: null
        });
      }
    });

    // Speech synthesis API
    this.app.post('/api/synthesize/speech', async (req, res) => {
      try {
        const { text, voiceConfig = {} } = req.body;
        
        if (!text) {
          return res.status(400).json({
            code: 400,
            message: 'Missing required field: text',
            data: null
          });
        }

        const audioBuffer = await this.aiService.synthesizeSpeech(text, voiceConfig);
        
        res.json({
          code: 200,
          message: 'Speech synthesized successfully',
          data: {
            audioBuffer: audioBuffer.toString('base64'),
            bufferSize: audioBuffer.length
          }
        });
      } catch (error) {
        console.error('Error synthesizing speech:', error);
        res.status(500).json({
          code: 500,
          message: 'Internal server error',
          data: null
        });
      }
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      console.log('WebSocket client connected');
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          switch (message.type) {
            case 'audio_stream':
              await this.handleAudioStream(ws, message);
              break;
            case 'text_message':
              await this.handleTextMessage(ws, message);
              break;
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              break;
            default:
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Unknown message type'
              }));
          }
        } catch (error) {
          console.error('WebSocket message handling error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process message'
          }));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'WebSocket connection established',
        timestamp: Date.now()
      }));
    });
  }

  async handleAudioStream(ws, message) {
    const { audioBuffer, userId, context = {} } = message;
    
    try {
      const buffer = Buffer.isBuffer(audioBuffer) 
        ? audioBuffer 
        : Buffer.from(audioBuffer, 'base64');

      const result = await this.aiService.processAudio(buffer, userId, context);
      
      ws.send(JSON.stringify({
        type: 'audio_response',
        data: result
      }));
    } catch (error) {
      console.error('Audio stream processing error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process audio stream'
      }));
    }
  }

  async handleTextMessage(ws, message) {
    const { text, userId, context = {} } = message;
    
    try {
      const result = await this.aiService.processText(text, userId, context);
      
      ws.send(JSON.stringify({
        type: 'text_response',
        data: result
      }));
    } catch (error) {
      console.error('Text message processing error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process text message'
      }));
    }
  }

  setupHealthCheck() {
    // Start health check server on separate port
    const healthServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          code: 200,
          message: 'Service is healthy',
          data: { status: 'ok', timestamp: new Date().toISOString() }
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const healthPort = process.env.HEALTH_CHECK_PORT || 8081;
    healthServer.listen(healthPort, () => {
      console.log(`Health check server running on port ${healthPort}`);
    });
  }

  async start() {
    // Initialize AI service
    await this.aiService.start();
    
    const port = process.env.AI_SERVICE_PORT || 8082;
    this.server.listen(port, () => {
      console.log(`Unified AI Omni Service running on port ${port}`);
      console.log(`WebSocket server available at ws://localhost:${port}`);
      console.log(`HTTP API available at http://localhost:${port}`);
    });
  }
}

// Start the service if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const service = new UnifiedAIService();
  service.start().catch(console.error);
}

export { UnifiedAIService };