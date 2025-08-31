/**
 * Cost calculation utilities for Claude API usage
 */

// Claude 4 pricing (as of August 2025)
// NOTE: These rates may need verification against actual Anthropic pricing
const CLAUDE_4_PRICING = {
  input: 0.000015,  // $0.000015 per input token ($15 per 1M)
  output: 0.000075  // $0.000075 per output token ($75 per 1M)
};

// DEBUGGING: Let's verify these rates against your actual usage
console.log(`💰 Using pricing rates: $${CLAUDE_4_PRICING.input} input, $${CLAUDE_4_PRICING.output} output per token`);

/**
 * Calculate the cost for a Claude API response
 * @param {Object} usage - Usage object from Claude API response
 * @param {number} usage.input_tokens - Number of input tokens
 * @param {number} usage.output_tokens - Number of output tokens
 * @returns {Object} Cost breakdown
 */
export function calculateCost(usage) {
  if (!usage || typeof usage.input_tokens !== 'number' || typeof usage.output_tokens !== 'number') {
    console.warn('⚠️ Invalid usage data for cost calculation:', usage);
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    };
  }

  console.log(`🧮 COST CALCULATION:`);
  console.log(`   📥 Input tokens: ${usage.input_tokens} × $${CLAUDE_4_PRICING.input} = $${(usage.input_tokens * CLAUDE_4_PRICING.input).toFixed(6)}`);
  console.log(`   📤 Output tokens: ${usage.output_tokens} × $${CLAUDE_4_PRICING.output} = $${(usage.output_tokens * CLAUDE_4_PRICING.output).toFixed(6)}`);

  const inputCost = usage.input_tokens * CLAUDE_4_PRICING.input;
  const outputCost = usage.output_tokens * CLAUDE_4_PRICING.output;
  const totalCost = inputCost + outputCost;
  const totalTokens = usage.input_tokens + usage.output_tokens;

  console.log(`   💵 Total call cost: $${totalCost.toFixed(6)} (${totalTokens} tokens)`);

  return {
    inputCost,
    outputCost,
    totalCost,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens
  };
}

/**
 * Add cost information to session state with corrected token counting
 * @param {Object} state - Current game state
 * @param {Object} cost - Cost breakdown from calculateCost
 * @param {boolean} isInitialCall - Whether this is the first call in a conversation
 * @returns {Object} Updated state with cost tracking
 */
export function addCostToSession(state, cost, isInitialCall = false) {
  // Initialize session costs if not present
  if (!state.sessionCosts) {
    state.sessionCosts = {
      totalCost: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      callCount: 0
    };
  }

  // For the initial call, count all tokens
  if (isInitialCall) {
    const fullCost = cost.totalCost;
    const fullTokens = cost.totalTokens;
    
    state.sessionCosts.totalCost += fullCost;
    state.sessionCosts.totalTokens += fullTokens;
    state.sessionCosts.inputTokens += cost.inputTokens;
    state.sessionCosts.outputTokens += cost.outputTokens;
    state.sessionCosts.callCount += 1;
    
    console.log(`� Initial call: +$${fullCost.toFixed(6)} (+${fullTokens} tokens) | Total: $${state.sessionCosts.totalCost.toFixed(6)} (${state.sessionCosts.totalTokens} tokens)`);
  } else {
    // For follow-up calls, only count the NEW OUTPUT tokens + minimal input overhead
    // This is more conservative and avoids double-counting context
    const newOutputTokens = cost.outputTokens;
    const estimatedNewInputTokens = 50; // Conservative estimate for tool results + system overhead
    const newTokens = newOutputTokens + estimatedNewInputTokens;
    const newCost = (estimatedNewInputTokens * CLAUDE_4_PRICING.input) + (newOutputTokens * CLAUDE_4_PRICING.output);
    
    state.sessionCosts.totalCost += newCost;
    state.sessionCosts.totalTokens += newTokens;
    state.sessionCosts.inputTokens += estimatedNewInputTokens;
    state.sessionCosts.outputTokens += newOutputTokens;
    state.sessionCosts.callCount += 1;
    
    console.log(`💰 FOLLOW-UP CALL ADDED TO SESSION:`);
    console.log(`   📊 API reported: ${cost.inputTokens} input + ${cost.outputTokens} output = ${cost.totalTokens} total`);
    console.log(`   📊 We counted: ${estimatedNewInputTokens} input + ${newOutputTokens} output = ${newTokens} total`);
    console.log(`   � This call: $${newCost.toFixed(6)} (${newTokens} conservative tokens)`);
    console.log(`   💵 Session total: $${state.sessionCosts.totalCost.toFixed(6)} (${state.sessionCosts.totalTokens} tokens)`);
    console.log(`   ⚠️ Note: Conservative count to avoid double-counting context`);
  }

  return state;
}

/**
 * Format cost for display
 * @param {number} cost - Cost in USD
 * @returns {string} Formatted cost string
 */
export function formatCost(cost) {
  if (cost < 0.01) {
    return `$${(cost * 1000).toFixed(2)}¢`; // Show as cents for small amounts
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Format token count for display
 * @param {number} tokens - Number of tokens
 * @returns {string} Formatted token string
 */
export function formatTokens(tokens) {
  if (tokens < 1000) {
    return `${tokens}`;
  } else if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return `${(tokens / 1000000).toFixed(1)}M`;
}
