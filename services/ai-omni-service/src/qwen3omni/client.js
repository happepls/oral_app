class Qwen3OmniClient {
  constructor(config = {}) {
    this.config = {
      model: config.model || 'qwen3-omni',
      baseUrl: config.baseUrl || 'http://localhost:8000',
      apiKey: config.apiKey || process.env.QWEN3_OMNI_API_KEY,
      ...config
    };
    
    // Initialize properties
    this.model = null;
    this.pipeline = null;
    this.asrPipeline = null;
    this.ttsPipeline = null;
    this.Readable = null;
    this.fetch = null;
    this.SYSTEM_PROMPT = null;
    
    this.isConnected = false;
    this.sessionId = null;
  }

  // Initialize ESM modules dynamically
  async initializeModules() {
    try {
      // Try dynamic import for ESM modules
      const transformers = await import('@xenova/transformers');
      this.pipeline = transformers.pipeline;
      
      const stream = await import('stream');
      this.Readable = stream.Readable;
      
      // For fetch, use node-fetch if available, otherwise global fetch
      try {
        const nodeFetch = await import('node-fetch');
        this.fetch = nodeFetch.default || nodeFetch;
      } catch {
        this.fetch = globalThis.fetch;
      }
      
      // Load system prompt
      const { SYSTEM_PROMPT } = await import('./prompt/system.js');
      this.SYSTEM_PROMPT = SYSTEM_PROMPT;
      
    } catch (error) {
      console.error('Dynamic import failed, falling back to require:', error);
      // Fallback to require for compatibility
      const transformers = require('@xenova/transformers');
      this.pipeline = transformers.pipeline;
      
      const stream = require('stream');
      this.Readable = stream.Readable;
      
      this.fetch = require('node-fetch');
      
      const { SYSTEM_PROMPT } = require('./prompt/system.js');
      this.SYSTEM_PROMPT = SYSTEM_PROMPT;
    }
  }

  async connect() {
    try {
      console.log('Connecting to Qwen3-Omni service...');
      
      // Initialize ESM modules first
      await this.initializeModules();
      
      // Initialize ASR pipeline
      this.asrPipeline = await this.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      
      // Initialize TTS pipeline
      this.ttsPipeline = await this.pipeline('text-to-speech', 'Xenova/speecht5_tts', {
        quantized: false // Use non-quantized model for better quality
      });
      
      this.isConnected = true;
      console.log('Qwen3-Omni client connected successfully');
      
    } catch (error) {
      console.error('Failed to connect to Qwen3-Omni service:', error);
      throw error;
    }
  }

  async processAudio(audioBuffer, userId, context = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }

      console.log(`Processing audio buffer of size: ${audioBuffer.length} bytes`);
      
      // Step 1: ASR - Convert audio to text
      console.log('Performing ASR...');
      const asrResult = await this.asrPipeline(audioBuffer, { 
        return_timestamps: false 
      });
      const userTranscript = asrResult.text;
      console.log(`ASR Result: ${userTranscript}`);
      
      // Step 2: LLM - Process text and generate response
      console.log('Generating LLM response...');
      const llmResponse = await this.generateLLMResponse(userTranscript, userId, context);
      console.log(`LLM Response: ${llmResponse}`);
      
      // Step 3: TTS - Convert response text to audio
      console.log('Performing TTS...');
      const ttsAudioBuffer = await this.ttsPipeline(llmResponse);
      console.log(`TTS generated audio buffer of size: ${ttsAudioBuffer.length} bytes`);
      
      return {
        transcript: userTranscript,
        response: llmResponse,
        audioBuffer: ttsAudioBuffer,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Error processing audio:', error);
      throw error;
    }
  }

  async processText(text, userId, context = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }

      console.log(`Processing text: ${text}`);
      
      // Generate LLM response
      const llmResponse = await this.generateLLMResponse(text, userId, context);
      console.log(`LLM Response: ${llmResponse}`);
      
      // Generate TTS audio
      const ttsAudioBuffer = await this.ttsPipeline(llmResponse);
      console.log(`TTS generated audio buffer of size: ${ttsAudioBuffer.length} bytes`);
      
      return {
        response: llmResponse,
        audioBuffer: ttsAudioBuffer,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Error processing text:', error);
      throw error;
    }
  }

  async synthesizeSpeech(text, voiceConfig = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }

      console.log(`Synthesizing speech for text: ${text}`);
      
      const audioBuffer = await this.ttsPipeline(text, voiceConfig);
      console.log(`Generated audio buffer of size: ${audioBuffer.length} bytes`);
      
      return audioBuffer;
      
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      throw error;
    }
  }

  async generateLLMResponse(userInput, userId, context = {}) {
    try {
      // Build the prompt with system message and user context
      const prompt = this.buildPrompt(userInput, context);
      
      // For now, use a mock response
      // In a real implementation, this would call the actual Qwen3-Omni API
      const mockResponse = `I heard you say: "${userInput}". This is a response from the Qwen3-Omni AI assistant. Context: ${JSON.stringify(context)}`;
      
      return mockResponse;
      
    } catch (error) {
      console.error('Error generating LLM response:', error);
      throw error;
    }
  }

  buildPrompt(userInput, context = {}) {
    const basePrompt = this.SYSTEM_PROMPT || 'You are a helpful AI assistant.';
    
    const contextString = context.conversationHistory 
      ? `Previous conversation:\n${context.conversationHistory}\n\n`
      : '';
    
    const userContext = context.userContext ? `User context: ${JSON.stringify(context.userContext)}\n\n` : '';
    
    return `${basePrompt}\n\n${contextString}${userContext}User: ${userInput}\nAssistant:`;
  }

  async close() {
    try {
      this.isConnected = false;
      this.sessionId = null;
      
      // Clean up pipelines
      this.asrPipeline = null;
      this.ttsPipeline = null;
      this.model = null;
      
      console.log('Qwen3-Omni client disconnected');
      
    } catch (error) {
      console.error('Error closing client:', error);
      throw error;
    }
  }

  // Health check method
  getStatus() {
    return {
      isConnected: this.isConnected,
      sessionId: this.sessionId,
      model: this.config.model,
      baseUrl: this.config.baseUrl
    };
  }
}

module.exports = { Qwen3OmniClient };