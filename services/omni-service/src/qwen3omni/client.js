const { pipeline } = require('@xenova/transformers');

class Qwen3OmniClient {
  constructor(config) {
    this.config = config || {};
    this.model = null;
    this.asrPipeline = null;
    this.ttsPipeline = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      console.log('Connecting to Qwen3-Omni service...');
      
      // Initialize ASR pipeline
      this.asrPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      
      // Initialize TTS pipeline
      this.ttsPipeline = await pipeline('text-to-speech', 'Xenova/speecht5_tts', {
        quantized: false // Use non-quantized model for better quality
      });
      
      this.isConnected = true;
      console.log('Qwen3-Omni client connected successfully');
    } catch (error) {
      console.error('Failed to connect to Qwen3-Omni service:', error);
      throw error;
    }
  }

  async processAudio(audioBuffer, userId) {
    if (!this.isConnected) {
      throw new Error('Qwen3-Omni client not connected');
    }

    try {
      console.log(`Processing audio for user ${userId}, buffer size: ${audioBuffer.length} bytes`);
      
      // Step 1: ASR - Convert audio to text
      console.log('Performing ASR...');
      const asrResult = await this.asrPipeline(audioBuffer, { 
        return_timestamps: false 
      });
      
      const userTranscript = asrResult.text;
      console.log(`ASR Result: ${userTranscript}`);
      
      // Step 2: LLM - Process text and generate response
      console.log('Generating LLM response...');
      // In a real implementation, this would call the actual Qwen3-Omni LLM
      const llmResponse = `I heard you say: "${userTranscript}". This is a response from the Qwen3-Omni AI assistant.`;
      console.log(`LLM Response: ${llmResponse}`);
      
      return {
        transcript: userTranscript,
        response: llmResponse
      };
    } catch (error) {
      console.error('Error processing audio:', error);
      throw error;
    }
  }

  async processText(text, userId, context = {}) {
    if (!this.isConnected) {
      throw new Error('Qwen3-Omni client not connected');
    }

    try {
      console.log(`Processing text for user ${userId}: ${text}`);
      
      // In a real implementation, this would call the actual Qwen3-Omni LLM
      const llmResponse = `You said: "${text}". This is a response from the Qwen3-Omni AI assistant.`;
      
      return {
        input: text,
        response: llmResponse
      };
    } catch (error) {
      console.error('Error processing text:', error);
      throw error;
    }
  }

  async synthesizeSpeech(text, voiceConfig = {}) {
    if (!this.isConnected) {
      throw new Error('Qwen3-Omni client not connected');
    }

    try {
      console.log(`Synthesizing speech for text: ${text}`);
      
      // Generate speech from text
      const ttsResult = await this.ttsPipeline(text, {
        speaker_embeddings: voiceConfig.speakerEmbeddings || null
      });
      
      // Return audio buffer
      return ttsResult.audio;
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      throw error;
    }
  }

  async close() {
    try {
      this.isConnected = false;
      console.log('Qwen3-Omni client closed successfully');
    } catch (error) {
      console.error('Error closing Qwen3-Omni client:', error);
    }
  }
}

module.exports = { Qwen3OmniClient };