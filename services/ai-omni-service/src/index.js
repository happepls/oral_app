import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { Qwen3OmniService } from './qwen3omni/service.js';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'ai-omni-service'
  });
});

// Create AI service instance
const aiService = new Qwen3OmniService({
  model: process.env.QWEN3_OMNI_MODEL || 'qwen3-omni-flash-realtime',
  baseUrl: process.env.QWEN3_OMNI_BASE_URL || 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
  apiKey: process.env.QWEN3_OMNI_API_KEY
});

// Initialize the AI service
await aiService.start();

// Text processing endpoint
app.post('/api/process/text', async (req, res) => {
  try {
    const { text, userId, context } = req.body;

    if (!text) {
      return res.status(400).json({
        error: 'Text is required'
      });
    }

    const result = await aiService.processText(text, userId, context);

    res.status(200).json({
      code: 200,
      message: 'Success',
      data: result
    });
  } catch (error) {
    console.error('Error processing text:', error);
    res.status(500).json({
      error: 'Failed to process text',
      details: error.message
    });
  }
});

// Chat endpoint for compatibility with user requirements
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, userId } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid request: messages array is required'
      });
    }

    // Extract the latest user message
    const lastUserMessage = messages.findLast(msg => msg.role === 'user');
    if (!lastUserMessage || !lastUserMessage.content) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid request: no user message found'
      });
    }

    // Handle text content
    const text = Array.isArray(lastUserMessage.content) 
      ? lastUserMessage.content.find(item => item.text)?.text || ''
      : lastUserMessage.content;

    if (!text) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid request: no text content found'
      });
    }

    // Process the text - let the service manage its own conversation history
    const result = await aiService.processText(text, userId);

    res.status(200).json({
      code: 200,
      message: 'Chat processed successfully',
      data: {
        messages: [
          ...messages,
          {
            role: 'assistant',
            content: [
              { text: result.response }
            ]
          }
        ],
        response: result.response,
        audioBuffer: result.audioBuffer,
        timestamp: result.timestamp
      }
    });
  } catch (error) {
    console.error('Error processing chat:', error);
    res.status(500).json({
      code: 500,
      message: 'Failed to process chat',
      error: error.message
    });
  }
});


// Audio processing endpoint
app.post('/api/process/audio', async (req, res) => {
  try {
    const { audioBuffer, userId, context } = req.body;

    if (!audioBuffer) {
      return res.status(400).json({
        error: 'Audio buffer is required'
      });
    }

    // Convert base64 audio to buffer if needed
    let audioData = audioBuffer;
    if (typeof audioBuffer === 'string') {
      audioData = Buffer.from(audioBuffer, 'base64');
    }

    const result = await aiService.processAudio(audioData, userId, context);

    res.status(200).json({
      code: 200,
      message: 'Success',
      data: result
    });
  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({
      error: 'Failed to process audio',
      details: error.message
    });
  }
});

// Speech synthesis endpoint
app.post('/api/synthesize/speech', async (req, res) => {
  try {
    const { text, voiceConfig } = req.body;

    if (!text) {
      return res.status(400).json({
        error: 'Text is required'
      });
    }

    const audioBuffer = await aiService.synthesizeSpeech(text, voiceConfig);

    // Convert buffer to base64 for transmission
    const base64Audio = audioBuffer.toString('base64');

    res.status(200).json({
      code: 200,
      message: 'Success',
      data: {
        audioBuffer: base64Audio,
        format: 'base64'
      }
    });
  } catch (error) {
    console.error('Error synthesizing speech:', error);
    res.status(500).json({
      error: 'Failed to synthesize speech',
      details: error.message
    });
  }
});

// WebSocket server for real-time communication
function setupWebSocket() {
  const wss = new WebSocketServer({ server, path: '/stream' });

  wss.on('connection', async (ws, req) => {
    console.log('New WebSocket connection');

    // Assign a unique ID to the connection
    const connectionId = Date.now().toString();

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        const { type, payload } = data;

        switch (type) {
          case 'audio_stream':
            // Handle real-time audio stream
            await handleAudioStream(ws, payload, connectionId);
            break;

          case 'text_message':
            // Handle text message
            await handleTextMessage(ws, payload, connectionId);
            break;

          case 'ping':
            // Handle ping/pong for connection health
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: 'Unknown message type' }
            }));
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Failed to process message', details: error.message }
        }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
      // Clean up any resources associated with this connection
    });

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      payload: {
        connectionId,
        message: 'Connected to AI Omni Service',
        usingRealAPI: aiService.getStatus().usingRealAPI
      }
    }));
  });
}

// Handle real-time audio stream
async function handleAudioStream(ws, payload, connectionId) {
  try {
    const { audioBuffer, userId, context } = payload;

    // Convert base64 audio to buffer
    const audioData = Buffer.from(audioBuffer, 'base64');

    // Process audio in streaming fashion
    const stream = await aiService.handleAudioStream(audioData, userId, context);

    // Send back the response in chunks
    for await (const chunk of stream) {
      ws.send(JSON.stringify({
        type: 'audio_response',
        payload: chunk
      }));
    }
  } catch (error) {
    console.error('Error handling audio stream:', error);
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: 'Failed to process audio stream', details: error.message }
    }));
  }
}

// Handle text message
async function handleTextMessage(ws, payload, connectionId) {
  try {
    const { text, userId, context } = payload;

    // Process text message
    const stream = await aiService.handleTextStream(text, userId, context);

    // Send back the response in chunks
    for await (const chunk of stream) {
      ws.send(JSON.stringify({
        type: 'text_response',
        payload: chunk
      }));
    }
  } catch (error) {
    console.error('Error handling text message:', error);
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: 'Failed to process text message', details: error.message }
    }));
  }
}

// Setup WebSocket server
setupWebSocket();

// Health check server (separate port)
const healthCheckServer = express();
healthCheckServer.get('/health', (req, res) => {
  const status = aiService.getStatus();
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'ai-omni-service',
    aiService: status
  });
});

const HEALTH_CHECK_PORT = process.env.HEALTH_CHECK_PORT || 8081;
const healthServer = healthCheckServer.listen(HEALTH_CHECK_PORT, () => {
  console.log(`Health check server running on port ${HEALTH_CHECK_PORT}`);
});

// Start the main server
const PORT = process.env.AI_SERVICE_PORT || 8082;
server.listen(PORT, () => {
  console.log(`AI Omni Service running on port ${PORT}`);
  console.log(`Using ${process.env.ENABLE_MOCK_MODE === 'true' ? 'mock mode' : 'real Qwen3-Omni API'}`);
  console.log(`API Key configured: ${!!process.env.QWEN3_OMNI_API_KEY}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await aiService.stop();
  server.close(() => {
    console.log('AI Omni Service closed');
    healthServer.close(() => {
      console.log('Health check server closed');
      process.exit(0);
    });
  });
});

// Export for testing
export { app, server, aiService };