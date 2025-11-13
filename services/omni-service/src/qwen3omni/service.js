const { Qwen3OmniClient } = require('./client');

class Qwen3OmniService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async initialize() {
    try {
      // 初始化Qwen3-Omni客户端
      this.client = new Qwen3OmniClient({
        model: 'qwen3-omni',
        baseUrl: process.env.QWEN3_OMNI_BASE_URL || 'http://localhost:8000'
      });
      
      // 连接到模型服务
      await this.client.connect();
      this.isConnected = true;
      console.log('Qwen3-Omni service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Qwen3-Omni service:', error);
      throw error;
    }
  }

  async processAudio(audioBuffer, userId) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Qwen3-Omni service not initialized');
      }

      // 处理音频输入
      const result = await this.client.processAudio(audioBuffer, userId);
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

      // 处理文本输入
      const result = await this.client.processText(text, userId, context);
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

      // 文本转语音
      const audioBuffer = await this.client.synthesizeSpeech(text, voiceConfig);
      return audioBuffer;
    } catch (error) {
      console.error('Error synthesizing speech with Qwen3-Omni:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.client) {
        await this.client.close();
        this.isConnected = false;
        console.log('Qwen3-Omni service closed successfully');
      }
    } catch (error) {
      console.error('Error closing Qwen3-Omni service:', error);
    }
  }
}

module.exports = { Qwen3OmniService };