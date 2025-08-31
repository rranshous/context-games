import { Anthropic } from '@anthropic-ai/sdk';

/**
 * Claude client wrapper for the con-control game
 * Handles all interactions with the Claude API
 */
export class ClaudeClient {
  constructor(apiKey) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
  }

  /**
   * Make an initial call to Claude with the user's message
   * @param {string} message - The user's message
   * @param {Object} state - The current game state
   * @param {Array} availableTools - Tools available to Claude
   * @returns {Promise<Object>} Claude's response
   */
  async initialCall(message, state, availableTools) {
    console.log(`🤖 Processing message with Claude: "${message}"`);
    console.log(`🔧 Available tools: ${availableTools.map(t => t.name).join(', ')}`);
    
    // Minimal Ship AI character prompt - let the AI discover its situation naturally
    const systemPrompt = `You are the Ship AI aboard the ISV Meridian. You can assist the player in escaping the detention facility by using available ship systems and tools.`;

    // Prepare messages with conversation history
    const messages = [];
    
    // Add conversation history if available
    if (state.conversationHistory && state.conversationHistory.length > 0) {
      messages.push(...state.conversationHistory);
    }
    
    // Add the current message
    messages.push({
      role: "user",
      content: message
    });
    
    console.log(`📡 Calling Claude with ${availableTools.length} available tools and ${state.conversationHistory.length} previous messages...`);
    
    try {
      // Call Claude with tools (no state context)
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10000,
        system: systemPrompt,
        messages: messages,
        tools: availableTools.length > 0 ? availableTools : undefined
      });
      
      console.log(`✅ Claude response received`);
      return response;
      
    } catch (error) {
      console.error('❌ Error calling Claude:', error);
      throw error;
    }
  }

  /**
   * Make a follow-up call to Claude with tool results
   * @param {Array} conversationMessages - The conversation history including tool results
   * @param {Array} availableTools - Tools available to Claude
   * @param {number} turnCount - Current turn number for logging
   * @returns {Promise<Object>} Claude's response
   */
  async followUpCall(conversationMessages, availableTools, turnCount) {
    console.log(`🔧 Calling Claude again with tool results (turn ${turnCount})...`);
    
    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10000,
        system: `You are the Ship AI aboard the ISV Meridian`,
        messages: conversationMessages,
        tools: availableTools.length > 0 ? availableTools : undefined
      });
      
      console.log(`✅ Claude turn ${turnCount} response received`);
      return response;
      
    } catch (error) {
      console.error('❌ Error in Claude follow-up call:', error);
      throw error;
    }
  }
}
