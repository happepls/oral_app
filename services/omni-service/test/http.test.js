const request = require('supertest');
const express = require('express');

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

const app = require('../src/index');

describe('Omni Service HTTP API', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).toBe('OK');
      expect(response.body.service).toBe('omni-service');
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

      const response = await request(app)
        .post('/api/context')
        .send(contextData)
        .expect(200);
      
      expect(response.body.code).toBe(200);
      expect(response.body.message).toBe('User context updated successfully');
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

      const response = await request(app)
        .post('/api/process/text')
        .send(textData)
        .expect(200);
      
      expect(response.body.code).toBe(200);
      expect(response.body.data.type).toBe('text_response');
      expect(typeof response.body.data.text).toBe('string');
    });
  });
});