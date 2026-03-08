import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function callAnthropic(
  system: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  onText?: (text: string) => void,
): Promise<Anthropic.Message> {
  const params: Anthropic.MessageCreateParams = {
    model: 'claude-sonnet-4-6',
    max_tokens: 64000,
    system,
    messages,
  };
  if (tools.length > 0) params.tools = tools;

  console.log(`[inference] calling sonnet (system: ${system.length} chars, msgs: ${messages.length}, tools: ${tools.length})`);
  const t0 = Date.now();

  const stream = client.messages.stream(params);

  // Stream text chunks for real-time observability
  if (onText) {
    stream.on('text', (text) => onText(text));
  }

  const response = await stream.finalMessage();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[inference] ${response.stop_reason} in ${elapsed}s — ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);

  if (response.stop_reason === 'max_tokens') {
    console.warn('[inference] ⚠ hit max_tokens — response may be truncated');
  }

  return response;
}
