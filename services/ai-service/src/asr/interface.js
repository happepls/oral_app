// services/ai-service/src/asr/interface.js

/**
 * @typedef {Object} AsrConfig
 * @property {string} language - The language of the audio stream (e.g., 'en-US', 'zh-CN').
 * @property {number} sampleRate - The sample rate of the audio stream (e.g., 16000).
 */

/**
 * Abstract base class for a streaming Automatic Speech Recognition (ASR) service.
 * Implementations of this class should handle receiving an audio stream and emitting
 * transcribed text in real-time.
 */
class StreamingAsrService {
  /**
   * Constructor for the ASR service.
   * @param {AsrConfig} config - The configuration for the ASR service.
   */
  constructor(config) {
    if (this.constructor === StreamingAsrService) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    this.config = config;
  }

  /**
   * Creates and returns a new ASR stream.
   * The stream should be a Duplex stream that accepts audio chunks (input)
   * and emits transcription results (output).
   *
   * @returns {import('stream').Duplex} A stream that processes audio and emits text.
   *
   * @example
   * const audioInputStream = getAudioInputStream(); // e.g., from WebSocket
   * const asrService = new ConcreteAsrService({ language: 'en-US', sampleRate: 16000 });
   * const transcriptionStream = asrService.createStream();
   *
   * audioInputStream.pipe(transcriptionStream);
   *
   * transcriptionStream.on('data', (transcription) => {
   *   console.log('Partial or final result:', transcription.text);
   *   if (transcription.isFinal) {
   *     // Handle final result
   *   }
   * });
   */
  createStream() {
    throw new Error("Method 'createStream()' must be implemented.");
  }

  /**
   * Shuts down the ASR service and cleans up resources.
   */
  shutdown() {
    // Optional: Implement cleanup logic if needed
  }
}

module.exports = StreamingAsrService;
