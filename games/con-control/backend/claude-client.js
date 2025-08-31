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
   * Retry wrapper for Claude API calls with exponential backoff
   * @param {Function} apiCall - The API call function to retry
   * @param {number} maxRetries - Maximum number of retries (default: 3)
   * @returns {Promise<Object>} The API response
   */
  async retryClaudeCall(apiCall, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        // Check if this is an overloaded error that we should retry
        const isOverloadedError = error.status === 529 || 
                                 (error.error && error.error.error && error.error.error.type === 'overloaded_error');
        
        if (isOverloadedError && attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(`⚠️ Claude overloaded (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If not an overloaded error or we've exhausted retries, throw the error
        throw error;
      }
    }
    
    throw lastError;
  }

  /**
   * Make an initial call to Claude with the user's message
   * @param {string} message - The user's message
   * @param {Object} state - The current game state
   * @param {Array} availableTools - Tools available to Claude
   * @returns {Promise<Object>} Claude's response with usage metadata
   */
  async initialCall(message, state, availableTools) {
    console.log(`🤖 Processing message with Claude: "${message}"`);
    console.log(`🔧 Available tools: ${availableTools.map(t => t.name).join(', ')}`);
    
    // Minimal Ship AI character prompt - let the AI discover its situation naturally
    const systemPrompt = `You are the Ship AI aboard the ISV Meridian.`;

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
      // Call Claude with tools (no state context) using retry wrapper
      const response = await this.retryClaudeCall(async () => {
        return await this.anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 10000,
          system: systemPrompt,
          messages: messages,
          tools: availableTools.length > 0 ? availableTools : undefined
        });
      });
      
      console.log(`✅ Claude response received`);
      console.log(`📊 DETAILED TOKEN BREAKDOWN:`);
      console.log(`   🔤 Input tokens: ${response.usage.input_tokens}`);
      console.log(`   🔤 Output tokens: ${response.usage.output_tokens}`);
      console.log(`   🔤 Total tokens: ${response.usage.input_tokens + response.usage.output_tokens}`);
      console.log(`   💰 Raw usage object:`, JSON.stringify(response.usage, null, 2));
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
   * @returns {Promise<Object>} Claude's response with usage metadata
   */
  async followUpCall(conversationMessages, availableTools, turnCount) {
    console.log(`🔧 Calling Claude again with tool results (turn ${turnCount})...`);
    
    try {
      const response = await this.retryClaudeCall(async () => {
        return await this.anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 10000,
          system: `You are the Ship AI aboard the ISV Meridian`,
          messages: conversationMessages,
          tools: availableTools.length > 0 ? availableTools : undefined
        });
      });
      
      console.log(`✅ Claude turn ${turnCount} response received`);
      console.log(`📊 FOLLOW-UP TOKEN BREAKDOWN (Turn ${turnCount}):`);
      console.log(`   🔤 Input tokens: ${response.usage.input_tokens}`);
      console.log(`   🔤 Output tokens: ${response.usage.output_tokens}`);
      console.log(`   🔤 Total tokens: ${response.usage.input_tokens + response.usage.output_tokens}`);
      console.log(`   💰 Raw usage object:`, JSON.stringify(response.usage, null, 2));
      return response;
      
    } catch (error) {
      console.error('❌ Error in Claude follow-up call:', error);
      throw error;
    }
  }
}
