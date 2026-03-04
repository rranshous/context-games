// inference.ts — API call + agentic loop

const API_ENDPOINT = '/api/inference/anthropic/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface APIResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface ToolExecutor {
  (name: string, input: Record<string, unknown>): unknown;
}

async function callAPI(body: Record<string, unknown>): Promise<APIResponse | null> {
  try {
    const resp = await fetch(API_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.error(`[INFERENCE] API error ${resp.status}:`, await resp.text());
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.error('[INFERENCE] Fetch error:', err);
    return null;
  }
}

export async function agenticLoop(
  tag: string,
  system: string,
  userPrompt: string,
  tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>,
  executeTool: ToolExecutor,
  maxTurns: number = 10,
): Promise<string> {
  console.log(`[${tag}] → API call (system: ${system.length} chars, tools: ${tools.length})`);

  let messages: Array<Record<string, unknown>> = [
    { role: 'user', content: userPrompt },
  ];

  let turns = 0;
  let finalText = '';

  while (turns < maxTurns) {
    turns++;
    const response = await callAPI({
      model: MODEL,
      system,
      messages,
      tools,
      max_tokens: MAX_TOKENS,
    });

    if (!response) {
      console.error(`[${tag}] ← API call failed on turn ${turns}`);
      break;
    }

    console.log(`[${tag}] ← Response (turn ${turns}, stop: ${response.stop_reason}, tokens: ${response.usage.input_tokens}in/${response.usage.output_tokens}out)`);

    // Process response blocks
    let hasToolUse = false;
    const toolResults: Array<Record<string, unknown>> = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        finalText = block.text;
        console.log(`[${tag}] 💭 ${block.text.substring(0, 200)}${block.text.length > 200 ? '...' : ''}`);
      }
      if (block.type === 'tool_use' && block.name && block.id) {
        hasToolUse = true;
        const inputSummary = JSON.stringify(block.input).substring(0, 100);
        try {
          const result = executeTool(block.name, block.input || {});
          const resultStr = JSON.stringify(result);
          const resultSummary = resultStr.substring(0, 150);
          console.log(`[${tag}] → Tool: ${block.name} ${inputSummary} → ${resultSummary}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: resultStr,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[${tag}] → Tool: ${block.name} ${inputSummary} → ERROR: ${errMsg}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: errMsg }),
            is_error: true,
          });
        }
      }
    }

    // If no tool use or end_turn, we're done
    if (!hasToolUse || response.stop_reason === 'end_turn') {
      break;
    }

    // Continue conversation with tool results
    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];
  }

  console.log(`[${tag}] ← Loop complete (${turns} turn${turns !== 1 ? 's' : ''})`);
  return finalText;
}
