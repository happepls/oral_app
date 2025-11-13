const { pipeline } = require('@xenova/transformers');
const { Readable } = require('stream');

class Qwen3OmniService {
    constructor(ws) {
        this.ws = ws;
        this.isProcessing = false;
        this.model = null;
        this.processor = null;
        this.asrPipeline = null;
        this.ttsPipeline = null;
    }

    // Initializes the Qwen3-Omni service
    async initialize() {
        try {
            console.log("Initializing Qwen3-Omni service...");
            // Initialize ASR pipeline
            this.asrPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
            
            // Initialize TTS pipeline
            this.ttsPipeline = await pipeline('text-to-speech', 'Xenova/speecht5_tts', {
                quantized: false // Use non-quantized model for better quality
            });
            
            console.log("Qwen3-Omni service initialized with ASR and TTS pipelines.");
        } catch (err) {
            console.error(`Error initializing Qwen3-Omni service: ${err.message}`);
            throw err;
        }
    }

    // Sets up the event handlers for the Qwen3-Omni service
    setupEvents() {
        const sendJson = (data) => {
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify(data));
            }
        };

        // Handle session start
        console.log("Qwen3-Omni session started.");

        // Handle session stop
        console.log("Qwen3-Omni session stopped.");
        sendJson({ type: 'session_stopped' });

        // Handle errors
        console.error(`Qwen3-Omni service error occurred`);
        sendJson({ type: 'error', message: 'Internal service error' });
    }

    // Starts the Qwen3-Omni service
    async start() {
        try {
            await this.initialize();
            this.setupEvents();
            console.log("Qwen3-Omni service started.");
        } catch (err) {
            console.error(`Error starting Qwen3-Omni service: ${err.message}`);
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify({ type: 'error', message: `Failed to start AI service: ${err.message}` }));
            }
            throw err;
        }
    }

    // Stops the Qwen3-Omni service
    async stop() {
        try {
            this.isProcessing = false;
            console.log("Qwen3-Omni service stopped.");
        } catch (err) {
            console.error(`Error stopping Qwen3-Omni service: ${err.message}`);
        }
    }

    // Handles incoming audio data from the client
    async handleAudio(audioData) {
        if (!this.isProcessing) {
            this.isProcessing = true;
            console.log("Starting audio processing...");
        }

        try {
            // Convert audio data to the format expected by Qwen3-Omni
            console.log(`Received audio data of size: ${audioData.length} bytes`);
            
            // Step 1: ASR - Convert audio to text
            console.log("Performing ASR...");
            const asrResult = await this.asrPipeline(audioData, { 
                return_timestamps: false 
            });
            const userTranscript = asrResult.text;
            console.log(`ASR Result: ${userTranscript}`);
            
            // Send intermediate ASR result
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify({ 
                    type: 'asr_result', 
                    text: userTranscript, 
                    isFinal: true,
                    lang: 'en-US'
                }));
            }
            
            // Step 2: LLM - Process text and generate response
            console.log("Generating LLM response...");
            // For now, we'll use a simple mock response
            // In a real implementation, this would call the actual Qwen3-Omni LLM
            const llmResponse = `I heard you say: "${userTranscript}". This is a response from the Qwen3-Omni AI assistant.`;
            console.log(`LLM Response: ${llmResponse}`);
            
            // Step 3: TTS - Convert response text to audio
            console.log("Performing TTS...");
            // Note: In a real implementation, we would need to handle the TTS pipeline properly
            // For now, we'll send the text response back to the client
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify({ 
                    type: 'tts_result', 
                    text: llmResponse,
                    lang: 'en-US'
                }));
            }
            
            console.log("Audio processing completed.");
        } catch (err) {
            console.error(`Error processing audio: ${err.message}`);
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.send(JSON.stringify({ type: 'error', message: `Audio processing error: ${err.message}` }));
            }
        } finally {
            this.isProcessing = false;
        }
    }
}

module.exports = Qwen3OmniService;