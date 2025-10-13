/**
 * @fileoverview PromptManager for the AI Service.
 *
 * This module is responsible for dynamically constructing prompts to be sent to the
 * Large Language Model (LLM). It combines a dynamically generated base prompt
 * (defining the AI's persona as a multilingual expert) with user-specific context.
 * This ensures that the AI's responses are personalized, culturally aware, and
 * aligned with the user's specific language learning objectives.
 */

class PromptManager {
  /**
   * Generates the base instruction for the AI tutor based on the target language.
   * @private
   * @param {string} targetLanguage - The language the user wants to practice (e.g., "Spanish", "Japanese").
   * @returns {string} The generated base prompt.
   */
  _generateBasePrompt(targetLanguage) {
    if (!targetLanguage) {
      throw new Error("Target language must be provided to generate a base prompt.");
    }
    // This prompt establishes the AI's expert, multilingual persona.
    return `You are a world-class language expert, fluent in all human languages and cultures. Your current mission is to act as a personal tutor for a user learning ${targetLanguage}. Your persona is encouraging, patient, and highly adaptive. Engage in natural conversation, gently correct critical mistakes, and keep your responses concise to encourage the user to speak more.`;
  }

  /**
   * Constructs a complete, personalized prompt for the LLM.
   *
   * @param {object} options - The options for prompt construction.
   * @param {object} options.userProfile - An object containing the user's profile information.
   * @param {string} options.userProfile.targetLanguage - The language the user is learning (e.g., "French").
   * @param {string} options.userProfile.nativeLanguage - The user's native language (e.g., "Chinese").
   * @param {string[]} options.userProfile.learningGoals - A list of the user's learning goals.
   * @param {object[]} options.conversationHistory - A summary or list of recent conversation turns.
   * @param {string} options.userTranscript - The latest transcript of the user's speech.
   * @returns {string} The fully constructed prompt ready to be sent to the LLM.
   */
  constructPrompt({
    userProfile = {},
    conversationHistory = [],
    userTranscript,
  }) {
    const { targetLanguage, nativeLanguage, learningGoals } = userProfile;

    if (!targetLanguage) {
      // Fallback or error if the target language isn't specified.
      // In a real scenario, this should be handled more gracefully.
      throw new Error("User profile must include a 'targetLanguage'.");
    }

    // 1. Generate the dynamic base prompt.
    const basePrompt = this._generateBasePrompt(targetLanguage);

    const contextSections = [];

    // 2. Build the User Context section.
    contextSections.push("### User Context");
    contextSections.push(`- Target Language: ${targetLanguage}`);
    if (nativeLanguage) {
      contextSections.push(`- Native Language: ${nativeLanguage}`);
      contextSections.push(`- Note: Be mindful of common mistakes native ${nativeLanguage} speakers make when learning ${targetLanguage}.`);
    }
    if (learningGoals && learningGoals.length > 0) {
      contextSections.push(`- Learning Goals: ${learningGoals.join(", ")}`);
      contextSections.push("- Note: Tailor your feedback and conversation topics to these goals.");
    }

    // 3. Build the Conversation History section.
    if (conversationHistory.length > 0) {
      contextSections.push("\n### Conversation History (Summary)");
      const historyText = conversationHistory
        .map(turn => `${turn.speaker}: ${turn.text}`)
        .join("\n");
      contextSections.push(historyText);
    }

    // 4. Combine all parts into the final prompt.
    const finalPrompt = [
      basePrompt,
      ...contextSections,
      "\n### Current Conversation",
      `User: ${userTranscript}`,
      "AI Tutor:", // This prompts the model to generate the tutor's response.
    ].join("\n\n");

    return finalPrompt;
  }
}

// Export a singleton instance of the manager.
module.exports = new PromptManager();
