// LLM Interface for AI Omni Service
class LLMInterface {
  constructor() {
    this.service = null;
  }

  async initialize(service) {
    this.service = service;
  }

  async generateResponse(text, userId, context = {}) {
    if (!this.service) {
      throw new Error('LLM service not initialized');
    }
    
    return await this.service.processText(text, userId, context);
  }

  async generateStreamingResponse(text, userId, context = {}) {
    if (!this.service) {
      throw new Error('LLM service not initialized');
    }
    
    return await this.service.handleTextStream(text, userId, context);
  }

  getStatus() {
    return this.service ? this.service.getStatus() : { isConnected: false };
  }
}

module.exports = LLMInterface;