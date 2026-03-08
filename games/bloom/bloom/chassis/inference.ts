import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function callAnthropic(
  system: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
): Promise<Anthropic.Message> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system,
    messages,
  };
  if (tools.length > 0) params.tools = tools;

  console.log(`[inference] calling sonnet (system: ${system.length} chars, msgs: ${messages.length}, tools: ${tools.length})`);
  const t0 = Date.now();

  const response = await client.messages.create(params);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[inference] ${response.stop_reason} in ${elapsed}s — ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);

  return response;
}
