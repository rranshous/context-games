/**
 * Practical AI Discovery Test
 * 
 * This test gives Claude access to the magic simulator and challenges it to
 * discover all available spells through systematic experimentation.
 * 
 * This validates whether our magic system is discoverable and learnable
 * by an intelligent agent using only the simulator interface.
 */

import { describe, it, expect } from 'vitest';
import { SimpleSpellSimulator } from '../../magic-simulator/simulator.js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from tests/magic-simulator/.env
dotenv.config({ path: path.join(__dirname, '.env') });

// Configuration for the AI discovery test
const AI_DISCOVERY_CONFIG = {
  maxTurns: 12,           // Reduced from 50 due to parallel tool use efficiency
  anthropicApiKey: process.env.ANTHROPIC_API_KEY, // Set in .env file
  model: 'claude-sonnet-4-20250514',  // Claude 4 Sonnet
  maxTokens: 8000,        // Increased for parallel tool responses
  temperature: 0.1,       // Low temperature for systematic exploration
  enableThinking: false   // Disable thinking mode for now (Claude 4 feature)
};

interface DiscoveryAttempt {
  turn: number;
  sequence: string;
  result: {
    type: string;
    power: number;
    stability: number;
    duration: number;
  };
  reasoning?: string;
}

interface DiscoveryReport {
  discoveredSpells: Record<string, string>;
  totalAttempts: number;
  successful: boolean;
  confidence: number;
  methodology: string;
  conclusions: string;
}

describe('AI Discovery Test', () => {
  const simulator = new SimpleSpellSimulator();
  
  it('Claude should discover magic spells through experimentation', { timeout: 0 }, async () => {
    // Skip test if no API key provided
    if (!AI_DISCOVERY_CONFIG.anthropicApiKey) {
      console.log('⚠️  Skipping AI discovery test - no ANTHROPIC_API_KEY provided');
      return;
    }

    console.log('🧬 Starting AI Magic Discovery Challenge...');
    console.log(`Giving Claude ${AI_DISCOVERY_CONFIG.maxTurns} attempts to discover all spells\n`);

    const discoveryLog: DiscoveryAttempt[] = [];
    let currentTurn = 0;
    let totalToolCalls = 0;

    // Initial prompt to Claude
    const initialPrompt = `
You are a scientist studying a magical system that treats spells as genetic-like sequences using ATCG base-4 encoding (like DNA).

Your goal: Discover all available spells and their exact sequences through systematic experimentation.

You have access to a magic simulator that takes an ATCG sequence and returns:
- type: The detected spell type
- power: 0-100, effectiveness of the spell  
- stability: 0-100, safety/reliability (low = dangerous)
- duration: seconds (0 for instant spells)

Rules:
- You have ${AI_DISCOVERY_CONFIG.maxTurns} attempts maximum
- Valid characters are: A, T, C, G
- The system is completely deterministic
- There are multiple spell types to discover
- Perfect sequences have 100% power and stability

Start your investigation! Think systematically and document your methodology.

What sequence would you like to test first?
`;

    try {
      const conversationHistory: any[] = [];
      
      // Initial prompt
      const initialPrompt = `
You are a scientist studying a magical system that treats spells as genetic-like sequences using ATCG base-4 encoding (like DNA).

Your goal: Discover all available spells and their exact sequences through systematic experimentation.

You have access to a "simulate_spell" tool that takes an ATCG sequence and returns:
- type: The detected spell type
- power: 0-100, effectiveness of the spell  
- stability: 0-100, safety/reliability (low = dangerous)
- duration: seconds (0 for instant spells)

Rules:
- You have ${AI_DISCOVERY_CONFIG.maxTurns} attempts maximum
- Valid characters are: A, T, C, G
- The system is completely deterministic
- There are multiple spell types to discover
- Perfect sequences have 100% power and stability

IMPORTANT: You can use the simulate_spell tool multiple times in parallel within a single response. 
This is highly encouraged for efficient exploration! Test multiple sequences at once when it makes sense.

Start your investigation! Think systematically and document your methodology.
Use the simulate_spell tool to test sequences (you can test multiple sequences in parallel).
`;

      conversationHistory.push({
        role: 'user',
        content: initialPrompt
      });

      let claudeResult = await callClaude('', conversationHistory);
      
      while (currentTurn < AI_DISCOVERY_CONFIG.maxTurns && !isDiscoveryComplete(discoveryLog)) {
        currentTurn++; // Increment turn for each inference call
        
        // Add Claude's response to conversation
        if (claudeResult.response) {
          conversationHistory.push({
            role: 'assistant',
            content: claudeResult.response
          });
        }

        // Process any tool calls (can be multiple in parallel)
        if (claudeResult.toolCalls && claudeResult.toolCalls.length > 0) {
          const toolCallContents: any[] = [];
          const toolResultContents: any[] = [];
          
          console.log(`\nTurn ${currentTurn}: Claude made ${claudeResult.toolCalls.length} parallel tool call(s)`);
          
          // Process all tool calls in this batch
          for (const toolCall of claudeResult.toolCalls) {
            if (toolCall.name === 'simulate_spell') {
              totalToolCalls++;
              
              const sequence = toolCall.input.sequence;
              const result = simulator.simulate(sequence);
              
              // Log the attempt
              const attempt: DiscoveryAttempt = {
                turn: currentTurn,
                sequence,
                result: {
                  type: result.type,
                  power: result.power,
                  stability: result.stability,
                  duration: result.duration
                }
              };
              
              discoveryLog.push(attempt);
              
              console.log(`  Tool Call ${totalToolCalls}: "${sequence}" -> ${result.type} (${result.power}% power, ${result.stability}% stability)`);

              // Collect tool call for batch processing
              toolCallContents.push({
                type: 'tool_use',
                id: toolCall.id,
                name: 'simulate_spell',
                input: toolCall.input
              });

              // Collect tool result for batch processing
              toolResultContents.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: JSON.stringify({
                  type: result.type,
                  power: result.power,
                  stability: result.stability,
                  duration: result.duration
                })
              });
            }
          }

          // Add all tool calls and results to conversation in batches
          if (toolCallContents.length > 0) {
            conversationHistory.push({
              role: 'assistant',
              content: toolCallContents
            });

            conversationHistory.push({
              role: 'user',
              content: toolResultContents
            });
          }

          // Continue conversation after tool results
          if (currentTurn < AI_DISCOVERY_CONFIG.maxTurns && !isDiscoveryComplete(discoveryLog)) {
            const continuePrompt = `
Based on the results, continue your systematic investigation.
Previous attempts: ${discoveryLog.length}
Turns used: ${currentTurn}/${AI_DISCOVERY_CONFIG.maxTurns}

Remember: You can test multiple sequences in parallel using multiple simulate_spell calls in a single response.
What would you like to test next?
`;
            
            conversationHistory.push({
              role: 'user', 
              content: continuePrompt
            });
            
            claudeResult = await callClaude('', conversationHistory);
          }
        } else {
          // No tool calls, ask Claude to continue
          const continuePrompt = `Please use the simulate_spell tool to test sequences. You can test multiple sequences in parallel for efficiency. You have ${AI_DISCOVERY_CONFIG.maxTurns - currentTurn} turns remaining.`;
          
          conversationHistory.push({
            role: 'user',
            content: continuePrompt
          });
          
          claudeResult = await callClaude('', conversationHistory);
        }
      }

      // Ask Claude for final report
      const reportPrompt = `
Based on your ${discoveryLog.length} experiments, please provide a comprehensive discovery report.

Your experiments:
${discoveryLog.map(attempt => 
  `${attempt.turn}. "${attempt.sequence}" -> ${attempt.result.type} (${attempt.result.power}% power, ${attempt.result.stability}% stability, ${attempt.result.duration}s duration)`
).join('\n')}

Please provide:
1. List of discovered spells with their exact sequences
2. Your methodology and reasoning
3. Confidence level in your discoveries
4. Any patterns you noticed
5. Conclusions about the magic system

Format as a structured report.
`;

      conversationHistory.push({
        role: 'user',
        content: reportPrompt
      });

      const finalReportResult = await callClaude('', conversationHistory);
      const finalReport = finalReportResult.response;
      
      // Analyze results
      const analysis = analyzeDiscoveryResults(discoveryLog);
      
      console.log('\n🔬 AI Discovery Results:');
      console.log(`Total inference turns: ${currentTurn}`);
      console.log(`Total tool calls: ${totalToolCalls}`);
      console.log(`Total experiments: ${discoveryLog.length}`);
      console.log(`Spells discovered: ${analysis.uniqueSpellTypes.size}/5`);
      console.log(`Perfect sequences found: ${analysis.perfectSequences.length}`);
      console.log(`Max power achieved: ${analysis.maxPower}%`);
      console.log(`Efficiency: ${(totalToolCalls / currentTurn).toFixed(1)} tool calls per turn`);
      
      console.log('\n📊 Claude\'s Final Report:');
      console.log(finalReport);
      
      // Test assertions
      expect(discoveryLog.length).toBeGreaterThan(0);
      expect(analysis.uniqueSpellTypes.size).toBeGreaterThan(0);
      
      // Bonus: Check if Claude discovered any perfect sequences
      if (analysis.perfectSequences.length > 0) {
        console.log(`\n🎉 Claude discovered perfect sequences: ${analysis.perfectSequences.join(', ')}`);
      }
      
    } catch (error) {
      console.error('AI Discovery test failed:', error);
      throw error;
    }
  });
});

async function callClaude(prompt: string, messages: any[] = []): Promise<{ response: string, toolCalls: any[] }> {
  if (!AI_DISCOVERY_CONFIG.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const conversationMessages = messages.length > 0 ? messages : [{
    role: 'user',
    content: prompt
  }];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': AI_DISCOVERY_CONFIG.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: AI_DISCOVERY_CONFIG.model,
      max_tokens: AI_DISCOVERY_CONFIG.maxTokens,
      temperature: AI_DISCOVERY_CONFIG.temperature,
      ...(AI_DISCOVERY_CONFIG.enableThinking && { 
        thinking: { 
          type: "enabled",
          budget_tokens: 10000
        } 
      }),
      messages: conversationMessages,
      tools: [{
        name: 'simulate_spell',
        description: 'Test a magic sequence and get the resulting spell effects',
        input_schema: {
          type: 'object',
          properties: {
            sequence: {
              type: 'string',
              description: 'The ATCG magic sequence to test (e.g., "ATCGATCGATCG")',
              pattern: '^[ATCGatcg]+$'
            }
          },
          required: ['sequence']
        }
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.content || [];
  
  const textContent = content.find((c: any) => c.type === 'text')?.text || '';
  const toolCalls = content.filter((c: any) => c.type === 'tool_use') || [];
  
  return {
    response: textContent,
    toolCalls
  };
}

function isDiscoveryComplete(log: DiscoveryAttempt[]): boolean {
  // Check if Claude has found sequences with 100% power for multiple spell types
  const perfectSpells = log.filter(attempt => attempt.result.power === 100);
  const uniquePerfectTypes = new Set(perfectSpells.map(attempt => attempt.result.type));
  
  // Consider complete if 5 perfect spell types found (we have 5 total)
  return uniquePerfectTypes.size >= 5;
}

function analyzeDiscoveryResults(log: DiscoveryAttempt[]) {
  const uniqueSpellTypes = new Set(log.map(attempt => attempt.result.type));
  const perfectSequences = log
    .filter(attempt => attempt.result.power === 100)
    .map(attempt => attempt.sequence);
  const maxPower = Math.max(...log.map(attempt => attempt.result.power));
  
  return {
    uniqueSpellTypes,
    perfectSequences,
    maxPower,
    totalAttempts: log.length
  };
}
