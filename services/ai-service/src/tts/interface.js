// services/ai-service/src/tts/interface.js

/**
 * @typedef {Object} TtsConfig
 * @property {string} language - The default language for the synthesis (e.g., 'en-US', 'zh-CN').
 * @property {string} voice - The specific voice to use for the synthesis.
 * @property {string} format - The format of the output audio (e.g., 'mp3', 'pcm').
 * @property {number} sampleRate - The sample rate of the output audio.
 */

/**
 * Abstract base class for a streaming Text-to-Speech (TTS) service.
 * Implementations should handle receiving text and synthesizing it into an audio stream.
 */
class StreamingTtsService {
  /**
   * Constructor for the TTS service.
   * @param {TtsConfig} config - The configuration for the TTS service.
   */
  constructor(config) {
    if (this.constructor === StreamingTtsService) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    this.config = config;
  }

  /**
   * Creates a new TTS stream.
   * The stream should be a Duplex stream that accepts text chunks (input)
   * and emits audio chunks (output).
   *
   * @returns {import('stream').Duplex} A stream that accepts text and emits audio.
   *
   * @example
   * const ttsService = new ConcreteTtsService({ language: 'en-US', voice: 'sara', format: 'mp3', sampleRate: 24000 });
   * const textToSpeechStream = ttsService.createStream();
   * const audioOutputStream = getAudioOutputStream(); // e.g., to WebSocket
   *
   * textToSpeechStream.pipe(audioOutputStream);
   *
   * textToSpeechStream.write('Hello world.');
   * textToSpeechStream.write('How are you today?');
   * textToSpeechStream.end();
   */
  createStream() {
    throw new Error("Method 'createStream()' must be implemented.");
  }

  /**
   * Shuts down the TTS service and cleans up resources.
   */
  shutdown() {
    // Optional: Implement cleanup logic if needed
  }
}

module.exports = StreamingTtsService;
