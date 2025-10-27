// services/ai-service/src/asr/deepgramAsrService.js
require('dotenv').config();
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const { PassThrough } = require('stream');
const StreamingAsrService = require('./interface');

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_API_KEY) {
  console.error("FATAL ERROR: DEEPGRAM_API_KEY is not defined in the environment variables.");
  process.exit(1);
}

/**
 * @typedef {import('./interface').AsrConfig} AsrConfig
 */

class DeepgramAsrService extends StreamingAsrService {
  /**
   * @param {AsrConfig} config - The configuration for the ASR service.
   */
  constructor(config) {
    super(config);
    this.deepgramClient = createClient(DEEPGRAM_API_KEY);
    this.deepgramConnection = null;
    console.log('DeepgramAsrService initialized.');
  }

  /**
   * Creates and returns a new ASR stream.
   * @returns {import('stream').Duplex} A stream that processes audio and emits text.
   */
  createStream() {
    const stream = new PassThrough({ objectMode: true });

    try {
      this.deepgramConnection = this.deepgramClient.listen.live({
        model: 'nova-2',
        smart_format: true,
        language: this.config.language || 'en-US',
        encoding: 'linear16',
        sample_rate: this.config.sampleRate || 16000,
        punctuate: true,
        interim_results: true,
      });

      this.deepgramConnection.on(LiveTranscriptionEvents.Open, () => {
        console.log('Deepgram connection opened.');

        // Listen for data on the stream and send it to Deepgram
        stream.on('data', (chunk) => {
          if (this.deepgramConnection && this.deepgramConnection.getReadyState() === 1) { // WebSocket.OPEN
            this.deepgramConnection.send(chunk);
          } else {
            console.warn('Deepgram connection not open, unable to send audio data.');
          }
        });
      });

      this.deepgramConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        if (transcript) {
          const result = {
            text: transcript,
            isFinal: data.is_final,
          };
          // Push the transcript result back into the stream for the consumer
          stream.push(result);
        }
      });

      this.deepgramConnection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('Deepgram error:', error);
        stream.emit('error', error);
      });

      this.deepgramConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log('Deepgram connection closed.');
        stream.end(); // End the stream when the connection closes
      });

    } catch (error) {
      console.error('Failed to create Deepgram live connection:', error);
      stream.emit('error', error);
    }
    
    // Override the end method to also shut down the deepgram connection
    const originalEnd = stream.end;
    stream.end = (...args) => {
        this.shutdown();
        return originalEnd.apply(stream, args);
    };

    return stream;
  }

  /**
   * Shuts down the Deepgram connection.
   */
  shutdown() {
    if (this.deepgramConnection) {
      console.log('Shutting down Deepgram connection.');
      this.deepgramConnection.finish();
      this.deepgramConnection = null;
    }
  }
}

module.exports = DeepgramAsrService;
