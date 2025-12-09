import axios from 'axios'; // Import axios

// Mock AI Service for development and testing
// This service provides simulated AI responses without external dependencies

const CONVERSATION_SERVICE_URL = process.env.CONVERSATION_SERVICE_URL || 'http://conversation-service:8083';

export class MockAIService {
  constructor() {
    this.isConnected = true;
    this.sessionActive = false;
    this.userContext = {};
    // this.conversationHistory = []; // Removed, now managed externally
    this.isProcessing = false;
    console.log('Mock AI Service initialized');
  }

  async start() {
    // Mock service is always ready
    this.isConnected = true;
    console.log('Mock AI Service started successfully');
    return Promise.resolve();
  }

  async processAudio(audioBuffer, userId, sessionId, context = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Mock AI service not initialized');
      }

      // Retrieve existing history for context
      const currentHistory = await this.getConversationHistory(sessionId);
      const fullContext = { ...context, conversationHistory: currentHistory };

      // Simulate audio processing delay
      await this.delay(500);
      
      // Mock transcription and response
      const transcript = this.generateMockTranscript();
      const response = this.generateMockResponse(transcript, fullContext);
      
      // Persist user message
      await this.addMessageToHistory(sessionId, { 
        role: 'user',
        content: transcript,
        timestamp: new Date()
      });

      // Persist AI response
      await this.addMessageToHistory(sessionId, {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });

      return {
        transcript: transcript,
        response: response,
        confidence: Math.random() * 0.5 + 0.5, // 0.5-1.0
        processingTime: 500
      };
    } catch (error) {
      console.error('Error processing audio with Mock AI:', error);
      throw error;
    }
  }

  async processText(text, userId, sessionId, context = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Mock AI service not initialized');
      }

      // Retrieve existing history for context
      const currentHistory = await this.getConversationHistory(sessionId);
      const fullContext = { ...context, conversationHistory: currentHistory };

      // Simulate text processing delay
      await this.delay(300);
      
      // Generate mock response
      const response = this.generateMockResponse(text, fullContext);
      
      // Persist user message
      await this.addMessageToHistory(sessionId, {
        role: 'user',
        content: text,
        timestamp: new Date()
      });
      
      // Persist AI response
      await this.addMessageToHistory(sessionId, {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });

      return {
        response: response,
        confidence: Math.random() * 0.5 + 0.5, // 0.5-1.0
        processingTime: 300
      };
    } catch (error) {
      console.error('Error processing text with Mock AI:', error);
      throw error;
    }
  }

  async synthesizeSpeech(text, voiceConfig = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Mock AI service not initialized');
      }

      // Simulate speech synthesis delay
      await this.delay(800);
      
      // Generate mock audio buffer (silence)
      const sampleRate = voiceConfig.sampleRate || 16000;
      const duration = voiceConfig.duration || 2.0; // 2 seconds
      const numSamples = Math.floor(sampleRate * duration);
      
      // Create silent audio buffer
      const audioBuffer = Buffer.alloc(numSamples * 2); // 16-bit samples
      
      return audioBuffer;
    } catch (error) {
      console.error('Error synthesizing speech with Mock AI:', error);
      throw error;
    }
  }

  // WebSocket streaming support
  async handleAudioStream(audioBuffer, userId, sessionId, context = {}) {
    if (this.isProcessing) {
      throw new Error('Audio processing already in progress');
    }
    
    this.isProcessing = true;
    try {
      const result = await this.processAudio(audioBuffer, userId, sessionId, context);
      return result;
    } finally {
      this.isProcessing = false;
    }
  }

  // Handle streaming text messages
  async handleTextStream(text, userId, sessionId, context = {}) {
    const result = await this.processText(text, userId, sessionId, context);
    return result;
  }

  setUserContext(context) {
    this.userContext = { ...this.userContext, ...context };
  }

  // buildContext() removed as history is now external
  // formatConversationHistory() removed as history is now external

  async getConversationHistory(sessionId) {
    try {
      const response = await axios.get(`${CONVERSATION_SERVICE_URL}/history/${sessionId}`);
      return response.data; // Expecting an array of message objects
    } catch (error) {
      console.error(`Failed to retrieve conversation history for session ${sessionId}:`, error);
      return [];
    }
  }

  async addMessageToHistory(sessionId, message) {
    try {
      await axios.post(`${CONVERSATION_SERVICE_URL}/history/${sessionId}`, message);
    } catch (error) {
      console.error(`Failed to add message to history for session ${sessionId}:`, error);
    }
  }

  async stop() {
    this.isConnected = false;
    this.sessionActive = false;
    // this.conversationHistory = []; // Removed
    console.log('Mock AI Service stopped successfully');
  }

  // Health check method
  getStatus() {
    return {
      isConnected: this.isConnected,
      sessionActive: this.sessionActive,
      // conversationHistoryLength: this.conversationHistory.length, // Removed
      isProcessing: this.isProcessing
    };
  }

  // Helper methods
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateMockTranscript() {
    const transcripts = [
      "Hello, how are you doing today?",
      "I would like to practice my English speaking skills.",
      "What's the weather like in your area?",
      "Could you help me with pronunciation practice?",
      "Tell me about your favorite book or movie.",
      "I'm interested in learning about artificial intelligence.",
      "How do you think technology will change education?",
      "What are some good ways to improve language skills?",
      "Can we have a conversation about travel?",
      "What do you think makes a good language learning app?"
    ];
    
    return transcripts[Math.floor(Math.random() * transcripts.length)];
  }

  generateMockResponse(input, context = {}) {
    const responses = [
      "That's an interesting point! I'd be happy to help you practice your English.",
      "Great question! Language learning is all about consistent practice and immersion.",
      "I'm doing well, thank you for asking. How has your language learning journey been?",
      "Pronunciation practice is essential. Let's work on some common sounds together.",
      "Technology is definitely transforming education, making learning more accessible worldwide.",
      "Travel conversations are always fun! Where would you like to visit someday?",
      "A good language learning app should provide immediate feedback and engaging content.",
      "Artificial intelligence is revolutionizing many fields, including language education.",
      "Consistent daily practice, even for just 15 minutes, can make a big difference.",
      "I think the key to language learning is finding topics you're genuinely interested in."
    ];
    
    // Add some context awareness based on the history
    let baseResponse = responses[Math.floor(Math.random() * responses.length)];
    
    const history = context.conversationHistory || [];
    const lastUserMessage = history.length > 0 ? history[history.length - 1].content : '';

    if (input.toLowerCase().includes('weather') || lastUserMessage.toLowerCase().includes('weather')) {
      baseResponse = "The weather here is simulated, but I imagine it's pleasant for language practice!"
    } else if (input.toLowerCase().includes('book') || input.toLowerCase().includes('movie') || lastUserMessage.toLowerCase().includes('book') || lastUserMessage.toLowerCase().includes('movie')) {
      baseResponse = "I enjoy stories about language learning journeys and cultural exchanges."
    } else if (input.toLowerCase().includes('travel') || lastUserMessage.toLowerCase().includes('travel')) {
      baseResponse = "Travel is a wonderful way to practice languages! Have you visited any interesting places?"
    }
    
    return baseResponse;
  }
}