class Qwen3OmniClient {
  constructor(config = {}) {
    this.config = {
      model: config.model || 'qwen2.5-omni', // 使用文档中提到的模型名称
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
    
    // 初始化 DashScope 客户端
    this.dashscope = null;
  }

  // Initialize ESM modules dynamically
  async initializeModules() {
    // Dynamically import ESM modules
    const transformers = await import('@xenova/transformers');
    this.pipeline = transformers.pipeline;

    const stream = await import('stream');
    this.Readable = stream.Readable;

    // For fetch, use node-fetch
    const nodeFetch = await import('node-fetch');
    this.fetch = nodeFetch.default || nodeFetch;

    // Load system prompt
    const { SYSTEM_PROMPT } = await import('./prompt/system.js');
    this.SYSTEM_PROMPT = SYSTEM_PROMPT;
    
    // 初始化 DashScope SDK (optional - falls back to local models)
    try {
      // Try to import DashScope SDK if available
      const dashscopeModule = await import('@alicloud/dashscope').catch(() => null);
      if (dashscopeModule) {
        this.dashscope = dashscopeModule.default || dashscopeModule;
        // 设置 API Key
        if (this.config.apiKey) {
          this.dashscope.apiKey = this.config.apiKey;
        }
        console.log('DashScope SDK initialized successfully');
      } else {
        console.log('DashScope SDK not available, using local models only');
      }
    } catch (error) {
      console.warn('Failed to initialize DashScope SDK, using local models:', error);
    }
  }

  async connect() {
    try {
      console.log('Connecting to Qwen3-Omni service...');
      
      // Initialize ESM modules first
      await this.initializeModules();
      
      // 如果有 API Key 且启用了真实模式，则跳过本地模型加载
      if (this.config.apiKey && process.env.ENABLE_MOCK_MODE !== 'true') {
        console.log('Using real Qwen3-Omni API mode');
        this.isConnected = true;
        return;
      }
      
      // Configure environment to use local models and disable network downloads
      process.env.TRANSFORMERS_CACHE = '/usr/src/app/models';
      process.env.TRANSFORMERS_OFFLINE = '1';
      process.env.HF_HUB_OFFLINE = '1';
      process.env.HF_HUB_DISABLE_SYMLINKS_WARNING = '1';
      process.env.ALLOW_REMOTE_MODELS = 'false';
      
      // Check if model files exist locally
      console.log('Checking local model files...');
      
      // Try to load ASR pipeline with standard model name
      try {
        console.log('Loading ASR pipeline (Whisper-tiny.en)...');
        this.asrPipeline = await this.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
          local_files_only: true
        });
        console.log('ASR pipeline loaded successfully');
      } catch (asrError) {
        console.error('Failed to load ASR pipeline:', asrError);
        
        // Try alternative loading method - disable local_files_only
        console.log('Trying alternative ASR loading method...');
        this.asrPipeline = await this.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
        console.log('ASR pipeline loaded successfully with alternative method');
      }
      
      // Try to load TTS pipeline with standard model name
      try {
        console.log('Loading TTS pipeline (SpeechT5)...');
        this.ttsPipeline = await this.pipeline('text-to-speech', 'Xenova/speecht5_tts', {
          local_files_only: true
        });
        console.log('TTS pipeline loaded successfully');
      } catch (ttsError) {
        console.error('Failed to load TTS pipeline:', ttsError);
        
        // Try alternative loading method - disable local_files_only
        console.log('Trying alternative TTS loading method...');
        this.ttsPipeline = await this.pipeline('text-to-speech', 'Xenova/speecht5_tts');
        console.log('TTS pipeline loaded successfully with alternative method');
      }
      
      this.isConnected = true;
      console.log('Qwen3-Omni client connected successfully');
      
    } catch (error) {
      console.error('Failed to connect to Qwen3-Omni service:', error);
      
      // Provide more detailed error information
      if (error.message.includes('Unauthorized access') || error.message.includes('huggingface')) {
        console.error('Network access issue detected. Ensure models are available locally and network access is not required.');
        console.error('Check if model files exist in /usr/src/app/models/ directory');
        console.error('Current working directory:', process.cwd());
        console.error('Models directory contents:');
        
        // Try to list models directory
        try {
          const fs = await import('fs');
          const modelsDir = '/usr/src/app/models';
          if (fs.existsSync(modelsDir)) {
            const files = fs.readdirSync(modelsDir);
            console.error('Models directory exists, contents:', files);
          } else {
            console.error('Models directory does not exist:', modelsDir);
          }
        } catch (fsError) {
          console.error('Cannot check models directory:', fsError);
        }
      }
      
      throw error;
    }
  }

  async processAudio(audioBuffer, userId, context = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }

      console.log(`Processing audio buffer of size: ${audioBuffer.length} bytes`);
      
      // 如果使用真实 API 模式
      if (this.config.apiKey && process.env.ENABLE_MOCK_MODE !== 'true') {
        return await this.processAudioWithRealAPI(audioBuffer, userId, context);
      }
      
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
      
      // 如果使用真实 API 模式
      if (this.config.apiKey && process.env.ENABLE_MOCK_MODE !== 'true') {
        return await this.processTextWithRealAPI(text, userId, context);
      }
      
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
      
      // 如果使用真实 API 模式
      if (this.config.apiKey && process.env.ENABLE_MOCK_MODE !== 'true') {
        return await this.synthesizeSpeechWithRealAPI(text, voiceConfig);
      }
      
      const audioBuffer = await this.ttsPipeline(text, voiceConfig);
      console.log(`Generated audio buffer of size: ${audioBuffer.length} bytes`);
      
      return audioBuffer;
      
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      throw error;
    }
  }

  // 使用真实 API 处理音频
  async processAudioWithRealAPI(audioBuffer, userId, context = {}) {
    try {
      if (!this.dashscope) {
        throw new Error('DashScope SDK not initialized');
      }

      // 构造用户输入：包含文本指令和音频文件
      // 注意：在实际实现中，您需要将音频缓冲区上传到可访问的 URL 或使用 DashScope 支持的其他方式
      const messages = [
        {
          "role": "user",
          "content": [
            {"text": "请听这段音频，并用英语回复我。"},
            // 这里需要将 audioBuffer 转换为 DashScope 支持的格式
            // 例如上传到 OSS 或使用 base64 编码
            {"audio": "audio_data_placeholder"} // 需要替换为实际的音频数据
          ]
        }
      ];

      // 发起流式调用
      const response = await this.dashscope.MultiModalConversation.call({
        model: this.config.model,
        messages: messages,
        stream: true,
        result_format: 'message'
      });

      // 处理流式响应
      let fullResponse = '';
      for await (const chunk of response) {
        if (chunk.choices && chunk.choices[0].message.content) {
          const contentList = chunk.choices[0].message.content;
          for (const item of contentList) {
            if (item.text) {
              fullResponse += item.text;
            }
          }
        }
      }

      // 生成 TTS 音频（如果需要）
      // 注意：真实 API 可能已经返回了音频，这里可能不需要额外的 TTS 步骤
      
      return {
        transcript: "Audio input processed", // 实际实现中应从响应中提取转录文本
        response: fullResponse,
        audioBuffer: null, // 实际实现中应从响应中提取音频数据
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error processing audio with real API:', error);
      throw error;
    }
  }

  // 使用真实 API 处理文本
  async processTextWithRealAPI(text, userId, context = {}) {
    try {
      // Build the prompt with system message and user context
      const prompt = this.buildPrompt(text, context);
      
      // 使用 WebSocket 连接处理文本
      const response = await this.connectWebSocketAndSendMessage(prompt);
      
      return {
        response: response.text,
        audioBuffer: response.audio || null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error processing text with real API:', error);
      throw error;
    }
  }
  
  // 使用 WebSocket 连接处理消息
  async connectWebSocketAndSendMessage(prompt) {
    const WebSocket = (await import('ws')).default;
    
    return new Promise((resolve, reject) => {
      // Construct the WebSocket URL with proper parameters
      const wsUrl = `${this.config.baseUrl}?model=${this.config.model}`;
      
      console.log(`Connecting to WebSocket: ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      let fullResponse = '';
      let audioResponse = null;
      let isInitialized = false;
      
      ws.on('open', () => {
        console.log('WebSocket connection established');
        
        // Send initialization message according to Qwen3-Omni realtime API spec
        const initMessage = {
          // Event ID generated by client
          "event_id": `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          "type": "session.update",
          "session": {
            // Output modalities: text only or text+audio
            "modalities": ["text", "audio"],
            // Voice for audio output
            "voice": "Cherry",
            // Input audio format (only pcm16 supported)
            "input_audio_format": "pcm16",
            // Output audio format (only pcm24 supported)
            "output_audio_format": "pcm24",
            // System message to set model's role/purpose
            "instructions": this.SYSTEM_PROMPT,
            // Input audio transcription configuration
            "input_audio_transcription": {
              "model": "gummy-realtime-v1"
            },
            // Voice activity detection - server-side VAD
            "turn_detection": {
              "type": "server_vad",
              // VAD detection threshold - higher for noisy environments, lower for quiet environments
              "threshold": 0.5,
              // Silence duration before triggering response (ms)
              "silence_duration_ms": 800,
              // Prefix padding for VAD detection (ms)
              "prefix_padding_ms": 300,
              // Create response when speech ends
              "create_response": true,
              // Allow interrupting ongoing responses
              "interrupt_response": true
            }
          }
        };
        
        console.log('Sending init message:', JSON.stringify(initMessage, null, 2));
        ws.send(JSON.stringify(initMessage));
      });
      
      let lastMessageTime = Date.now();
      let messageCount = 0;
      let completionTimeout = null;
      
      // Function to check for response completion
      const checkForCompletion = () => {
        const timeSinceLastMessage = Date.now() - lastMessageTime;
        console.log(`Checking completion: ${messageCount} messages, last message ${timeSinceLastMessage}ms ago`);
        
        // If no messages received for 2 seconds, consider response complete
        if (timeSinceLastMessage > 2000 && messageCount > 0) {
          console.log('Response appears complete (no messages for 2+ seconds)');
          ws.close();
          
          // Combine audio chunks if any
          let finalAudio = null;
          if (audioResponse && audioResponse.length > 0) {
            finalAudio = Buffer.concat(audioResponse);
          }
          
          resolve({ 
            text: fullResponse, 
            audio: finalAudio 
          });
          return true;
        }
        return false;
      };
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log('Received WebSocket message:', JSON.stringify(message, null, 2));
          
          // Update last message time and count
          lastMessageTime = Date.now();
          messageCount++;
          
          // Reset completion timeout
          if (completionTimeout) {
            clearTimeout(completionTimeout);
          }
          
          if (message.type === 'session.created') {
            console.log('Session created successfully');
            isInitialized = true;
            
            // Send user message after session is created
            const userMessage = {
              "type": "conversation.item.create",
              "item": {
                "type": "message",
                "role": "user",
                "content": [
                  {
                    "type": "input_text",
                    "text": prompt
                  }
                ]
              }
            };
            
            console.log('Sending user message:', JSON.stringify(userMessage, null, 2));
            ws.send(JSON.stringify(userMessage));
            
            // Trigger response generation
            const responseRequest = {
              "type": "response.create",
              "response": {
                "modalities": ["text", "audio"],
                "instructions": this.SYSTEM_PROMPT
              }
            };
            
            console.log('Sending response request:', JSON.stringify(responseRequest, null, 2));
            ws.send(JSON.stringify(responseRequest));
            
          } else if (message.type === 'response.text.delta') {
            // Handle text response chunks
            if (message.delta) {
              fullResponse += message.delta;
              console.log(`Text delta received: ${message.delta}`);
            }
          } else if (message.type === 'response.audio_transcript.delta') {
            // Handle audio transcript chunks
            if (message.delta) {
              console.log(`Audio transcript delta received: ${message.delta}`);
              fullResponse += message.delta; // Add transcript to full response
            }
          } else if (message.type === 'response.audio.delta') {
            // Handle audio response chunks
            if (message.delta) {
              // Decode base64 audio data
              const audioChunk = Buffer.from(message.delta, 'base64');
              if (!audioResponse) {
                audioResponse = [];
              }
              audioResponse.push(audioChunk);
              console.log(`Audio delta received: ${audioChunk.length} bytes`);
            }
          } else if (message.type === 'response.done') {
            console.log('Response completed (response.done)');
            ws.close();
            
            // Combine audio chunks if any
            let finalAudio = null;
            if (audioResponse && audioResponse.length > 0) {
              finalAudio = Buffer.concat(audioResponse);
            }
            
            resolve({ 
              text: fullResponse, 
              audio: finalAudio 
            });
            return;
          } else if (message.type === 'response.completed') {
            console.log('Response completed (response.completed/done)');
            ws.close();
            
            // Combine audio chunks if any
            let finalAudio = null;
            if (audioResponse && audioResponse.length > 0) {
              finalAudio = Buffer.concat(audioResponse);
            }
            
            resolve({ 
              text: fullResponse, 
              audio: finalAudio 
            });
            return;
          } else if (message.type === 'error') {
            console.error('API error:', message.error);
            ws.close();
            reject(new Error(message.error.message || 'Unknown API error'));
            return;
          } else if (message.type === 'session.updated') {
            console.log('Session updated:', message.session);
          } else if (message.type === 'response.created') {
            console.log('Response created:', message.response);
          } else if (message.type === 'response.output_item.added') {
            console.log('Response output item added:', message.item);
          } else if (message.type === 'response.output_item.done') {
            console.log('Response output item done:', message.item);
            // Set a short timeout to check for completion after item is done
            completionTimeout = setTimeout(() => {
              checkForCompletion();
            }, 1000);
          } else {
            console.log('Unhandled message type:', message.type);
          }
          
          // Set completion check timeout after each message
          completionTimeout = setTimeout(() => {
            checkForCompletion();
          }, 3000);
          
        } catch (parseError) {
          console.error('Error parsing message:', parseError);
          console.error('Raw message:', data.toString());
        }
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });
      
      ws.on('close', (code, reason) => {
        console.log(`WebSocket connection closed: ${code} ${reason}`);
        if (!fullResponse && isInitialized) {
          reject(new Error('WebSocket connection closed without receiving a complete response'));
        } else if (!isInitialized) {
          reject(new Error('WebSocket connection closed before initialization'));
        }
      });
      
      // Set timeout
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log('WebSocket connection timeout - closing connection');
          ws.close();
        }
        reject(new Error('WebSocket connection timed out'));
      }, 30000);
    });
  }

  // 使用真实 API 合成语音
  async synthesizeSpeechWithRealAPI(text, voiceConfig = {}) {
    try {
      if (!this.dashscope) {
        throw new Error('DashScope SDK not initialized');
      }

      // 构造用户输入
      const messages = [
        {
          "role": "user",
          "content": [
            {"text": text}
          ]
        }
      ];

      // 发起流式调用，指定 TTS 参数
      const parameters = {
        voice: voiceConfig.voice || 'Cherry' // 使用默认音色或指定音色
      };

      const response = await this.dashscope.MultiModalConversation.call({
        model: this.config.model,
        messages: messages,
        stream: true,
        result_format: 'message',
        parameters: parameters
      });

      // 处理流式响应，提取音频数据
      let audioData = null;
      for await (const chunk of response) {
        if (chunk.choices && chunk.choices[0].message.content) {
          const contentList = chunk.choices[0].message.content;
          for (const item of contentList) {
            if (item.audio) {
              // 提取音频数据
              audioData = item.audio; // 实际实现中可能需要进一步处理
              break;
            }
          }
        }
        if (audioData) break;
      }

      return audioData;
    } catch (error) {
      console.error('Error synthesizing speech with real API:', error);
      throw error;
    }
  }

  async generateLLMResponse(userInput, userId, context = {}) {
    try {
      // Build the prompt with system message and user context
      const prompt = this.buildPrompt(userInput, context);
      
      // 如果使用真实 API 模式
      if (this.config.apiKey && process.env.ENABLE_MOCK_MODE !== 'true' && this.dashscope) {
        // 构造用户输入
        const messages = [
          {
            "role": "user",
            "content": [
              {"text": prompt}
            ]
          }
        ];

        // 发起流式调用
        const response = await this.dashscope.MultiModalConversation.call({
          model: this.config.model,
          messages: messages,
          stream: true,
          result_format: 'message'
        });

        // 处理流式响应
        let fullResponse = '';
        for await (const chunk of response) {
          if (chunk.choices && chunk.choices[0].message.content) {
            const contentList = chunk.choices[0].message.content;
            for (const item of contentList) {
              if (item.text) {
                fullResponse += item.text;
              }
            }
          }
        }
        
        return fullResponse;
      }
      
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
    
    // Handle conversation history from messages array
    let conversationHistory = '';
    if (context.messages && Array.isArray(context.messages)) {
      conversationHistory = context.messages.map(msg => {
        if (msg.role === 'user') {
          const content = Array.isArray(msg.content) ? msg.content.find(item => item.text)?.text || msg.content[0]?.text || '' : msg.content;
          return `User: ${content}`;
        } else if (msg.role === 'assistant') {
          const content = Array.isArray(msg.content) ? msg.content.find(item => item.text)?.text || msg.content[0]?.text || '' : msg.content;
          return `Assistant: ${content}`;
        }
        return '';
      }).filter(line => line).join('\n');
    }
    
    const contextString = conversationHistory 
      ? `Previous conversation:\n${conversationHistory}\n\n`
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
      baseUrl: this.config.baseUrl,
      usingRealAPI: !!(this.config.apiKey && process.env.ENABLE_MOCK_MODE !== 'true')
    };
  }
}

export { Qwen3OmniClient };