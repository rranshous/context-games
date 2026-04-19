/**
 * OpenRouter inference client with token tracking.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class BudgetExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExhaustedError';
  }
}

export interface InferenceMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface InferenceResult {
  text: string;
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, any>;
  }>;
  tokensUsed: { input: number; output: number };
  raw: any;
}

export interface InferenceOptions {
  model: string;
  system: string;
  messages: InferenceMessage[];
  tools?: any[];
  maxTokens?: number;
  thinkingBudget?: number;
}

let apiKey: string | undefined;

export function setApiKey(key: string) {
  apiKey = key;
}

export async function callModel(opts: InferenceOptions): Promise<InferenceResult> {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set');

  const body: any = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    messages: [{ role: 'system', content: opts.system }, ...opts.messages],
  };

  // Only add thinking for Anthropic models that support it
  if (opts.thinkingBudget && opts.model.includes('anthropic/')) {
    body.thinking = { type: 'enabled', budget_tokens: opts.thinkingBudget };
  }

  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = 'auto';
  }

  // Retry with backoff for rate limits
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const delay = 2000 * Math.pow(2, attempt - 1); // 2s, 4s
      await new Promise(r => setTimeout(r, delay));
    }

    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 429) {
      lastError = new Error(`OpenRouter 429: rate limited (attempt ${attempt + 1}/3)`);
      continue;
    }

    if (resp.status === 402 || resp.status === 403) {
      const errText = await resp.text();
      throw new BudgetExhaustedError(`OpenRouter ${resp.status} (out of credits): ${errText}`);
    }

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenRouter ${resp.status}: ${errText}`);
    }

  const data = await resp.json();
  const choice = data.choices?.[0]?.message;
  if (!choice) throw new Error('No response from model');

  const text = (choice.content ?? '').toString().trim();
  const rawToolCalls: any[] = choice.tool_calls ?? [];

  const toolCalls = rawToolCalls.map((tc: any) => {
    let args: Record<string, any> = {};
    try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch { /* ignore */ }
    return {
      id: tc.id ?? '',
      name: tc.function?.name ?? '(unknown)',
      args,
    };
  });

  const usage = data.usage ?? {};
  const tokensUsed = {
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0,
  };

    return { text, toolCalls, tokensUsed, raw: data };
  }

  throw lastError ?? new Error('callModel: unexpected retry exhaustion');
}
