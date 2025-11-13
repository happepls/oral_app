const express = require('express');
const { Qwen3OmniService } = require('../src/qwen3omni/service');

// Mock the Qwen3OmniClient to avoid actual API calls
jest.mock('../src/qwen3omni/client', () => {
  return {
    Qwen3OmniClient: jest.fn().mockImplementation(() => {
      return {
        connect: jest.fn().mockResolvedValue(),
        processText: jest.fn().mockResolvedValue({
          response: 'Mocked response from LLM',
          audioBuffer: Buffer.from('mocked-audio-data')
        }),
        processAudio: jest.fn().mockResolvedValue({
          transcript: 'Mocked transcription',
          response: 'Mocked response from LLM',
          audioBuffer: Buffer.from('mocked-audio-data')
        }),
        setUserContext: jest.fn().mockResolvedValue(),
        close: jest.fn().mockResolvedValue()
      };
    })
  };
});

describe('Omni Service HTTP API', () => {
  let app;
  let server;
  let port;

  beforeAll((done) => {
    app = express();
    require('../src/index'); // This will attach routes to app
    
    // Find an available port
    server = app.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    }
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await fetch(`http://localhost:${port}/health`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.status).toBe('OK');
      expect(data.service).toBe('omni-service');
    });
  });

  describe('POST /api/context', () => {
    it('should set user context', async () => {
      const contextData = {
        context: {
          proficiencyLevel: 'Intermediate',
          learningGoals: 'Business English',
          interests: 'Technology'
        }
      };

      const response = await fetch(`http://localhost:${port}/api/context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(contextData)
      });
      
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.code).toBe(200);
      expect(data.message).toBe('User context updated successfully');
    });
  });

  describe('POST /api/process/text', () => {
    it('should process text input', async () => {
      const textData = {
        text: 'Hello, how are you?',
        userId: 'user123',
        context: {
          proficiencyLevel: 'Intermediate',
          learningGoals: 'Business English',
          interests: 'Technology'
        }
      };

      const response = await fetch(`http://localhost:${port}/api/process/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(textData)
      });
      
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.code).toBe(200);
      expect(data.data.type).toBe('text_response');
      expect(typeof data.data.text).toBe('string');
    });
  });
});