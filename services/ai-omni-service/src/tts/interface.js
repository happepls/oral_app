// TTS Interface for AI Omni Service
class TTSInterface {
  constructor() {
    this.service = null;
  }

  async initialize(service) {
    this.service = service;
  }

  async synthesize(text, voiceConfig = {}) {
    if (!this.service) {
      throw new Error('TTS service not initialized');
    }
    
    return await this.service.synthesizeSpeech(text, voiceConfig);
  }

  async synthesizeStreaming(text, voiceConfig = {}) {
    if (!this.service) {
      throw new Error('TTS service not initialized');
    }
    
    return await this.service.synthesizeSpeech(text, voiceConfig);
  }

  getStatus() {
    return this.service ? this.service.getStatus() : { isConnected: false };
  }
}

module.exports = TTSInterface;