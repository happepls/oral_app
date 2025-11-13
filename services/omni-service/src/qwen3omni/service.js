const { Qwen3OmniClient } = require('./client');

class Qwen3OmniService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.sessionActive = false;
    this.userContext = {};
    this.conversationHistory = [];
  }

  async start() {
    try {
      // Initialize Qwen3-Omni client
      this.client = new Qwen3OmniClient({
        model: process.env.QWEN3_OMNI_MODEL || 'qwen3-omni',
        baseUrl: process.env.QWEN3_OMNI_BASE_URL || 'http://localhost:8000'
      });
      
      // Connect to the model service
      await this.client.connect();
      this.isConnected = true;
      console.log('Qwen3-Omni service started successfully');
    } catch (error) {
      console.error('Failed to start Qwen3-Omni service:', error);
      throw error;
    }
  }

  async processAudio(audioBuffer, userId, context = {}) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Qwen3-Omni service not initialized');
      }

      // Merge provided context with user context
      const mergedContext = { ...this.userContext, ...context };
      mergedContext.conversationHistory = this.formatConversationHistory();
      
      // Process audio input with context
      const result = await this.client.processAudio(audioBuffer, userId, mergedContext);
      
      // Update conversation history
      this.conversationHistory.push({
        role: 'user',
        content: result.transcript,
        timestamp: new Date()
      });
      
      this.conversationHistory.push({
        role: 'assistant',
        content: result.response,
        timestamp: new Date()
      });
      
      // Keep only the last 10 conversation turns to manage context length
      if (this.conversationHistory.length > 10) {
        this.conversationHistory = this.conversationHistory.slice(-10);
      }
      
      return result;
    } catch (error) {
      console.error('Error processing audio with Qwen3-Omni:', error);
      throw error;
    }
  }

  async processText(text, userId, context = {}) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Qwen3-Omni service not initialized');
      }

      // Merge provided context with user context
      const mergedContext = { ...this.userContext, ...context };
      mergedContext.conversationHistory = this.formatConversationHistory();
      
      // Process text input
      const result = await this.client.processText(text, userId, mergedContext);
      
      // Update conversation history
      this.conversationHistory.push({
        role: 'user',
        content: text,
        timestamp: new Date()
      });
      
      this.conversationHistory.push({
        role: 'assistant',
        content: result.response,
        timestamp: new Date()
      });
      
      // Keep only the last 10 conversation turns to manage context length
      if (this.conversationHistory.length > 10) {
        this.conversationHistory = this.conversationHistory.slice(-10);
      }
      
      return result;
    } catch (error) {
      console.error('Error processing text with Qwen3-Omni:', error);
      throw error;
    }
  }

  async synthesizeSpeech(text, voiceConfig = {}) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Qwen3-Omni service not initialized');
      }

      // Synthesize speech
      const audioBuffer = await this.client.synthesizeSpeech(text, voiceConfig);
      return audioBuffer;
    } catch (error) {
      console.error('Error synthesizing speech with Qwen3-Omni:', error);
      throw error;
    }
  }

  setUserContext(context) {
    this.userContext = { ...this.userContext, ...context };
  }

  buildContext() {
    return {
      ...this.userContext,
      conversationHistory: this.formatConversationHistory()
    };
  }

  formatConversationHistory() {
    if (this.conversationHistory.length === 0) {
      return 'No previous conversation';
    }
    
    return this.conversationHistory.map(entry => 
      `${entry.role}: ${entry.content}`
    ).join('\n');
  }

  async stop() {
    try {
      if (this.client) {
        await this.client.close();
        this.isConnected = false;
        this.sessionActive = false;
        this.conversationHistory = [];
        console.log('Qwen3-Omni service stopped successfully');
      }
    } catch (error) {
      console.error('Error stopping Qwen3-Omni service:', error);
    }
  }
}

module.exports = { Qwen3OmniService };