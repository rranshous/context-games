/**
 * Cost calculation utilities for Claude API usage
 */

// Claude 4 pricing (as of August 2025) - CORRECTED RATES
const CLAUDE_4_PRICING = {
  input: 0.000003,         // $3 per 1M input tokens
  output: 0.000015,        // $15 per 1M output tokens  
  cache_read: 0.0000003,   // $0.30 per 1M tokens (0.1x base rate)
  cache_write: 0.00000375  // $3.75 per 1M tokens (1.25x base rate)
};

// Track session-wide totals for comparison
let sessionTotalRawCost = 0;
let sessionTotalRawTokens = 0;

// DEBUGGING: Let's verify these rates against your actual usage
console.log(`💰 Using pricing rates: $${CLAUDE_4_PRICING.input} input, $${CLAUDE_4_PRICING.output} output per token`);
console.log(`🔍 COST TRACKING ANALYSIS MODE: Will compare our estimates vs actual Anthropic charges`);

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

  console.log(`🧮 DETAILED COST CALCULATION:`);
  console.log(`🔍 COMPLETE USAGE OBJECT:`, JSON.stringify(usage, null, 2));
  
  // Extract ALL possible token fields from usage object
  const regularInputTokens = usage.input_tokens || 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  
  // Log each component with exact values
  console.log(`   📥 Regular input tokens: ${regularInputTokens}`);
  console.log(`   💾 Cache creation tokens: ${cacheCreationTokens}`);
  console.log(`   ⚡ Cache read tokens: ${cacheReadTokens}`);
  console.log(`   📤 Output tokens: ${outputTokens}`);
  
  // Check for any additional fields we might be missing
  const knownFields = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'cache_creation', 'service_tier'];
  const unknownFields = Object.keys(usage).filter(key => !knownFields.includes(key));
  if (unknownFields.length > 0) {
    console.log(`   ⚠️ UNKNOWN USAGE FIELDS DETECTED:`, unknownFields);
    unknownFields.forEach(field => {
      console.log(`      - ${field}: ${usage[field]}`);
    });
  }
  
  // Calculate costs for each component
  const regularInputCost = regularInputTokens * CLAUDE_4_PRICING.input;
  const cacheWriteCost = cacheCreationTokens * CLAUDE_4_PRICING.cache_write;
  const cacheReadCost = cacheReadTokens * CLAUDE_4_PRICING.cache_read;
  const outputCost = outputTokens * CLAUDE_4_PRICING.output;
  
  console.log(`   � Cost breakdown:`);
  console.log(`      �📥 Regular input: ${regularInputTokens} × $${CLAUDE_4_PRICING.input} = $${regularInputCost.toFixed(6)}`);
  console.log(`      💾 Cache creation: ${cacheCreationTokens} × $${CLAUDE_4_PRICING.cache_write} = $${cacheWriteCost.toFixed(6)}`);
  console.log(`      ⚡ Cache read: ${cacheReadTokens} × $${CLAUDE_4_PRICING.cache_read} = $${cacheReadCost.toFixed(6)}`);
  console.log(`      📤 Output: ${outputTokens} × $${CLAUDE_4_PRICING.output} = $${outputCost.toFixed(6)}`);
  
  // Check for detailed cache creation breakdown
  if (usage.cache_creation) {
    console.log(`   🔍 Cache creation details:`);
    const ephemeral5m = usage.cache_creation.ephemeral_5m_input_tokens || 0;
    const ephemeral1h = usage.cache_creation.ephemeral_1h_input_tokens || 0;
    console.log(`      - 5-minute cache: ${ephemeral5m} tokens`);
    console.log(`      - 1-hour cache: ${ephemeral1h} tokens`);
    
    // Verify cache_creation_input_tokens matches the sum
    const expectedCacheTotal = ephemeral5m + ephemeral1h;
    if (expectedCacheTotal !== cacheCreationTokens) {
      console.log(`   ⚠️ Cache token mismatch: expected ${expectedCacheTotal}, got ${cacheCreationTokens}`);
    }
  }
  
  // Check service tier
  if (usage.service_tier) {
    console.log(`   🏷️ Service tier: ${usage.service_tier}`);
  }

  const totalInputCost = regularInputCost + cacheWriteCost + cacheReadCost;
  const totalCost = totalInputCost + outputCost;
  const totalTokens = regularInputTokens + cacheCreationTokens + cacheReadTokens + outputTokens;

  // Track raw totals for session summary
  sessionTotalRawCost += totalCost;
  sessionTotalRawTokens += totalTokens;

  console.log(`   💵 TOTAL CALL COST: $${totalCost.toFixed(6)} (${totalTokens} tokens)`);
  console.log(`   📊 Session running totals: $${sessionTotalRawCost.toFixed(6)} (${sessionTotalRawTokens} tokens)`);

  return {
    inputCost: totalInputCost,
    outputCost: outputCost,
    totalCost: totalCost,
    inputTokens: regularInputTokens + cacheCreationTokens + cacheReadTokens,
    outputTokens: outputTokens,
    totalTokens: totalTokens,
    // Additional cache details for precise tracking
    regularInputTokens: regularInputTokens,
    cacheCreationTokens: cacheCreationTokens,
    cacheReadTokens: cacheReadTokens,
    // Full usage object for debugging
    rawUsage: usage
  };
}

/**
 * Add cost information to session state with accurate token counting
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

  // Use the precise cost calculation - no more conservative estimates
  // We now have accurate pricing and cache handling
  state.sessionCosts.totalCost += cost.totalCost;
  state.sessionCosts.totalTokens += cost.totalTokens;
  state.sessionCosts.inputTokens += cost.inputTokens;
  state.sessionCosts.outputTokens += cost.outputTokens;
  state.sessionCosts.callCount += 1;
  
  const callType = isInitialCall ? 'INITIAL' : 'FOLLOW-UP';
  console.log(`💰 ${callType} CALL ADDED TO SESSION:`);
  console.log(`   💵 This call: $${cost.totalCost.toFixed(6)} (${cost.totalTokens} tokens)`);
  console.log(`   💵 Session total: $${state.sessionCosts.totalCost.toFixed(6)} (${state.sessionCosts.totalTokens} tokens)`);
  
  // Show cache details if present
  if (cost.cacheCreationTokens > 0 || cost.cacheReadTokens > 0) {
    console.log(`   💾 Cache usage: ${cost.cacheReadTokens} read + ${cost.cacheCreationTokens} created`);
  }
  
  // Show token breakdown for transparency
  console.log(`   📊 Token breakdown: ${cost.regularInputTokens} regular + ${cost.cacheCreationTokens} cache write + ${cost.cacheReadTokens} cache read + ${cost.outputTokens} output`);

  return state;
}

/**
 * Get session cost summary for logging
 * @returns {Object} Session cost comparison data
 */
export function getSessionSummary() {
  return {
    rawCost: sessionTotalRawCost,
    rawTokens: sessionTotalRawTokens
  };
}

/**
 * Reset session tracking (for new sessions)
 */
export function resetSessionTracking() {
  sessionTotalRawCost = 0;
  sessionTotalRawTokens = 0;
  console.log(`🔄 Reset session cost tracking`);
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
