/**
 * Cost calculation utilities for Claude API usage
 */

// Claude 4 pricing (as of August 2025)
const CLAUDE_4_PRICING = {
  input: 0.000015,  // $0.000015 per input token
  output: 0.000075  // $0.000075 per output token
};

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

  console.log(`🔍 Token calculation: ${usage.input_tokens} input + ${usage.output_tokens} output = ${usage.input_tokens + usage.output_tokens} total`);

  const inputCost = usage.input_tokens * CLAUDE_4_PRICING.input;
  const outputCost = usage.output_tokens * CLAUDE_4_PRICING.output;
  const totalCost = inputCost + outputCost;
  const totalTokens = usage.input_tokens + usage.output_tokens;

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
 * Add cost information to session state
 * @param {Object} state - Current game state
 * @param {Object} cost - Cost breakdown from calculateCost
 * @returns {Object} Updated state with cost tracking
 */
export function addCostToSession(state, cost) {
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

  // Accumulate costs
  state.sessionCosts.totalCost += cost.totalCost;
  state.sessionCosts.totalTokens += cost.totalTokens;
  state.sessionCosts.inputTokens += cost.inputTokens;
  state.sessionCosts.outputTokens += cost.outputTokens;
  state.sessionCosts.callCount += 1;

  console.log(`💰 Session cost update: +$${cost.totalCost.toFixed(6)} (+${cost.totalTokens} tokens) | Total: $${state.sessionCosts.totalCost.toFixed(6)} (${state.sessionCosts.totalTokens} tokens)`);

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
