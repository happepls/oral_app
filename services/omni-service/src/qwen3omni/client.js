const { pipeline } = require('@xenova/transformers');
const fetch = require('node-fetch');
const { SYSTEM_PROMPT } = require('../prompt/system');

class Qwen3OmniClient {
  constructor(config) {
    this.config = config || {};
    this.model = null;
    this.asrPipeline = null;
    this.ttsPipeline = null;
    this.isConnected = false;
    // 强制启用模拟模式
    this.useMock = true;
  }

  async connect() {
    try {
      console.log('Initializing Qwen3-Omni client...');
      
      // 在模拟模式下跳过模型初始化
      if (this.useMock) {
        console.log('Using mock mode - skipping model initialization');
        this.isConnected = true;
        return;
      }
      
      // Initialize ASR pipeline
      this.asrPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      
      // Initialize TTS pipeline
      this.ttsPipeline = await pipeline('text-to-speech', 'Xenova/speecht5_tts', {
        quantized: false // Use non-quantized model for better quality
      });
      
      this.isConnected = true;
      console.log('Qwen3-Omni client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Qwen3-Omni client:', error);
      // 即使模型初始化失败也允许连接，使用模拟模式
      this.useMock = true;
      this.isConnected = true;
      console.log('Falling back to mock mode due to initialization error');
    }
  }

  async processAudio(audioBuffer, userId, context = {}) {
    if (!this.isConnected) {
      throw new Error('Qwen3-Omni client not connected');
    }

    try {
      console.log(`Processing audio for user ${userId}, buffer size: ${audioBuffer.length} bytes`);
      
      // 在模拟模式下跳过ASR
      let userTranscript = "Hello, this is a test message";
      if (!this.useMock && this.asrPipeline) {
        // Step 1: ASR - Convert audio to text
        console.log('Performing ASR...');
        const asrResult = await this.asrPipeline(audioBuffer, { 
          return_timestamps: false 
        });
        
        userTranscript = asrResult.text;
        console.log(`ASR Result: ${userTranscript}`);
      } else {
        console.log('Using mock ASR result');
      }
      
      // Step 2: LLM - Process text and generate response
      console.log('Generating LLM response...');
      const llmResponse = await this.callLLM(userTranscript, userId, context);
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
      
      const llmResponse = await this.callLLM(text, userId, context);
      
      return {
        input: text,
        response: llmResponse
      };
    } catch (error) {
      console.error('Error processing text:', error);
      throw error;
    }
  }

  async callLLM(text, userId, context = {}) {
    // 如果启用模拟模式，返回预设响应
    if (this.useMock) {
      console.log('Using mock LLM response');
      return this.generateMockResponse(text, context);
    }

    try {
      // Construct prompt with context
      let prompt = SYSTEM_PROMPT
        .replace('{{proficiencyLevel}}', context.proficiencyLevel || 'Intermediate')
        .replace('{{learningGoals}}', context.learningGoals || 'General conversation')
        .replace('{{interests}}', context.interests || 'Various topics')
        .replace('{{conversationHistory}}', context.conversationHistory || 'No previous conversation');
      
      prompt += `\nUser: ${text}\nAssistant:`;
      
      // Send request to LLM via HTTP
      const llmUrl = this.config.baseUrl || 'http://localhost:8000';
      
      const response = await fetch(`${llmUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          max_tokens: 150,
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        throw new Error(`LLM request failed with status ${response.status}`);
      }
      
      const responseData = await response.json();
      return responseData.text || responseData.output || 'No response generated';
    } catch (error) {
      console.error('Error calling LLM:', error);
      // 如果外部LLM调用失败，回退到模拟响应
      console.log('Falling back to mock response');
      return this.generateMockResponse(text, context);
    }
  }

  // 生成模拟响应的方法
  generateMockResponse(inputText, context) {
    const responses = [
      "That's interesting! Tell me more about it.",
      "I understand what you're saying. How can I help you with that?",
      "Thanks for sharing. What else would you like to talk about?",
      "I see. Could you elaborate on that point?",
      "That's a good question. Let me think about it.",
      "I appreciate you telling me that. Is there anything specific you'd like to practice?",
      "Great! I'm here to help you with your English conversation skills."
    ];
    
    // 根据输入内容选择合适的响应
    if (inputText.toLowerCase().includes('hello') || inputText.toLowerCase().includes('hi')) {
      return "Hello there! How can I assist you with your English practice today?";
    }
    
    if (inputText.toLowerCase().includes('help')) {
      return "I'm here to help you practice English conversation. We can talk about various topics like technology, daily life, or anything you're interested in!";
    }
    
    // 随机选择一个响应
    const randomIndex = Math.floor(Math.random() * responses.length);
    return responses[randomIndex];
  }

  async synthesizeSpeech(text, voiceConfig = {}) {
    if (!this.isConnected) {
      throw new Error('Qwen3-Omni client not connected');
    }

    // 在模拟模式下跳过TTS
    if (this.useMock) {
      console.log('Using mock speech synthesis');
      // 返回空的音频缓冲区
      return Buffer.alloc(0);
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
      // Clean up resources if needed
      this.isConnected = false;
      console.log('Qwen3-Omni client closed successfully');
    } catch (error) {
      console.error('Error closing Qwen3-Omni client:', error);
    }
  }
}

module.exports = { Qwen3OmniClient };