// services/ai-service/src/llm/interface.js

/**
 * @typedef {Object} LlmConfig
 * @property {string} model - The identifier of the language model to use.
 * @property {number} maxTokens - The maximum number of tokens to generate.
 */

/**
 * @typedef {Object} ChatMessage
 * @property {'system' | 'user' | 'assistant'} role - The role of the message sender.
 * @property {string} content - The content of the message.
 */

/**
 * Abstract base class for a Large Language Model (LLM) service.
 */
class LlmService {
  /**
   * Constructor for the LLM service.
   * @param {LlmConfig} config - The configuration for the LLM service.
   */
  constructor(config) {
    if (this.constructor === LlmService) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    this.config = config;
  }

  /**
   * Generates a response based on a conversation history.
   * This can be a streaming or non-streaming response depending on the implementation.
   *
   * @param {ChatMessage[]} messages - An array of chat messages representing the conversation history.
   * @returns {Promise<string> | AsyncGenerator<string>} A promise that resolves with the full response,
   * or an async generator that yields response chunks.
   *
   * @example
   * const llm = new ConcreteLlmService({ model: 'qwen-turbo', maxTokens: 150 });
   * const messages = [
   *   { role: 'system', content: 'You are a helpful assistant.' },
   *   { role: 'user', content: 'Hello, who are you?' }
   * ];
   * const response = await llm.generateResponse(messages);
   * console.log(response);
   */
  generateResponse(messages) {
    throw new Error("Method 'generateResponse()' must be implemented.");
  }

  /**
   * Shuts down the LLM service and cleans up resources.
   */
  shutdown() {
    // Optional: Implement cleanup logic if needed
  }
}

module.exports = LlmService;
