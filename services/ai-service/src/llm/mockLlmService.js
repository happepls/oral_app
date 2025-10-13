// services/ai-service/src/llm/mockLlmService.js

const LlmService = require('./interface');
const PromptManager = require('../prompt/manager');

/**
 * @typedef {import('./interface').LlmConfig} LlmConfig
 * @typedef {import('./interface').ChatMessage} ChatMessage
 */

/**
 * A mocked implementation of the LlmService for testing and development.
 * It uses the PromptManager to construct a prompt but returns a fixed,
 * predefined response instead of calling a real LLM API.
 */
class MockLlmService extends LlmService {
  /**
   * @param {LlmConfig} config - The configuration for the LLM service.
   */
  constructor(config) {
    super(config);
    console.log('MockLlmService initialized.');
  }

  /**
   * Generates a mocked response based on user context and transcript.
   *
   * @param {object} options - The options for generating a response.
   * @param {string} options.userTranscript - The latest transcript of the user's speech.
   * @param {object} options.userProfile - The user's profile data.
   * @param {object[]} options.conversationHistory - A summary of the recent conversation.
   * @returns {Promise<string>} A promise that resolves with the mocked response.
   */
  async generateResponse({ userTranscript, userProfile, conversationHistory }) {
    // Use the real PromptManager to build the prompt. This allows us to test
    // the prompt construction logic even in a mocked environment.
    const finalPrompt = PromptManager.constructPrompt({
      userProfile,
      conversationHistory,
      userTranscript,
    });

    console.log('--- [MockLlmService] Generated Prompt ---');
    console.log(finalPrompt);
    console.log('------------------------------------------');

    // For demonstration, we'll simulate a small delay.
    await new Promise(resolve => setTimeout(resolve, 500));

    // Return a fixed, generic response for testing purposes.
    const mockResponse = `This is a mocked response for a user learning ${userProfile.targetLanguage}. You said: "${userTranscript}". That's a good start!`;
    
    return mockResponse;
  }

  /**
   * Shuts down the mocked service.
   */
  shutdown() {
    console.log('MockLlmService shutdown.');
  }
}

module.exports = MockLlmService;
