require('dotenv').config();
const express = require('express');
const http = require('http');
const { Qwen3OmniService } = require('./qwen3omni/service');

const app = express();
app.use(express.json({ limit: '10mb' })); // For parsing JSON bodies
app.use(express.raw({ type: 'audio/*', limit: '10mb' })); // For parsing audio data

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'omni-service' });
});

// Text processing endpoint
app.post('/api/process/text', async (req, res) => {
  try {
    // Create a new service instance for each request
    const omniService = new Qwen3OmniService();
    
    try {
      await omniService.start();
      
      const { text, userId, context } = req.body;
      
      if (!text) {
        return res.status(400).json({ 
          code: 400, 
          message: 'Text input is required', 
          data: null 
        });
      }
      
      console.log(`Processing text input: ${text}`);
      
      const result = await omniService.processText(text, userId || 'user-id', context || {});
      
      // Clean up service
      await omniService.stop();
      
      res.json({ 
        code: 200, 
        message: 'Success', 
        data: {
          type: 'text_response', 
          text: result.response,
          lang: req.body.lang || 'en-US'
        }
      });
    } catch (error) {
      // Clean up service
      await omniService.stop();
      
      console.error('Error processing text:', error);
      res.status(500).json({ 
        code: 500, 
        message: `Error processing text: ${error.message}`, 
        data: null 
      });
    }
  } catch (error) {
    console.error('Error processing text request:', error);
    res.status(500).json({ 
      code: 500, 
      message: `Error processing text request: ${error.message}`, 
      data: null 
    });
  }
});

// Audio processing endpoint
app.post('/api/process/audio', async (req, res) => {
  try {
    // Check if request contains audio data
    if (!req.body || !(req.body instanceof Buffer)) {
      return res.status(400).json({ 
        code: 400, 
        message: 'Audio data is required', 
        data: null 
      });
    }
    
    // Create a new service instance for each request
    const omniService = new Qwen3OmniService();
    
    try {
      await omniService.start();
      
      const userId = req.headers['user-id'] || 'user-id';
      const context = req.headers['context'] ? JSON.parse(req.headers['context']) : {};
      
      console.log(`Processing audio data of size: ${req.body.length} bytes`);
      
      const result = await omniService.processAudio(req.body, userId, context);
      
      // Clean up service
      await omniService.stop();
      
      res.json({ 
        code: 200, 
        message: 'Success', 
        data: {
          transcript: result.transcript,
          response: result.response
        }
      });
    } catch (error) {
      // Clean up service
      await omniService.stop();
      
      console.error('Error processing audio:', error);
      res.status(500).json({ 
        code: 500, 
        message: `Error processing audio: ${error.message}`, 
        data: null 
      });
    }
  } catch (error) {
    console.error('Error processing audio request:', error);
    res.status(500).json({ 
      code: 500, 
      message: `Error processing audio request: ${error.message}`, 
      data: null 
    });
  }
});

// Set user context endpoint
app.post('/api/context', async (req, res) => {
  try {
    const { context } = req.body;
    
    // In a real implementation, we would store this context for the user
    // For now, we'll just acknowledge the request
    console.log('Setting user context:', context);
    
    res.json({ 
      code: 200, 
      message: 'User context updated successfully', 
      data: {
        type: 'context_set',
        message: 'User context updated successfully'
      }
    });
  } catch (error) {
    console.error('Error setting user context:', error);
    res.status(500).json({ 
      code: 500, 
      message: `Error setting user context: ${error.message}`, 
      data: null 
    });
  }
});

// Start server on port 8081
const PORT = process.env.PORT || 8081;

// Start the server only if this file is run directly
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Omni Service listening on port ${PORT}`);
  });
}

// Export the app for testing
module.exports = app;