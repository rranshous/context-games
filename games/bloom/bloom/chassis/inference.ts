import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function callAnthropic(
  system: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
): Promise<Anthropic.Message> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: 'claude-sonnet-4-6-20250929',
    max_tokens: 8192,
    system,
    messages,
  };
  if (tools.length > 0) params.tools = tools;
  return client.messages.create(params);
}
