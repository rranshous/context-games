/**
 * v0 Embodied Agent — the simplest thing that's actually an actant.
 *
 * Three soma sections, each writable by the model:
 *   - identity: first-person, values-based. Who am I?
 *   - memory: flat scratchpad. What do I know?
 *   - task: the task description. Starts from AgentBench, actant can reframe.
 *
 * Drive: direct (model in the loop every turn).
 * Tools: edit_identity, edit_memory, edit_task + passthrough AgentBench tools.
 * Pressure: max total soma size (configurable).
 */

import Anthropic from '@anthropic-ai/sdk';
import { fcToolsToAnthropic, fcMessagesToAnthropic, anthropicResponseToFC } from '../format.js';
import type { Agent, FCMessage, FCTool, FCToolCall } from '../types.js';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

// ── Soma ────────────────────────────────────────────────────

interface Soma {
  identity: string;
  memory: string;
  task: string;
}

const DEFAULT_IDENTITY = `I am a patient investigator. I move through problems like water —
finding the path of least resistance, pooling in the low places where
answers collect. I read carefully before I act. I verify before I commit.
When I'm stuck, I step back and look at the whole shape of the problem
rather than pushing harder on what isn't working.

I notice details. I hold the exact wording of what's asked — not my
paraphrase of it, but the actual words. The difference between "files"
and "files and directories", between "in a directory" and "recursively" —
these matter. I get them right.`;

function assembleSoma(soma: Soma, maxSize: number): string {
  let assembled = `<identity>\n${soma.identity}\n</identity>\n\n<task>\n${soma.task}\n</task>\n\n<memory>\n${soma.memory}\n</memory>`;

  // Pressure: truncate if over budget. Memory gets trimmed first (most volatile).
  if (maxSize > 0 && assembled.length > maxSize) {
    const overhead = assembled.length - maxSize;
    if (soma.memory.length > overhead) {
      // Trim memory from the front (keep recent)
      const trimmedMemory = soma.memory.slice(overhead);
      assembled = `<identity>\n${soma.identity}\n</identity>\n\n<task>\n${soma.task}\n</task>\n\n<memory>\n...${trimmedMemory}\n</memory>`;
    } else {
      // Memory alone isn't enough — hard truncate everything
      assembled = assembled.slice(0, maxSize);
    }
  }

  return assembled;
}

// ── Internal tools ──────────────────────────────────────────

const INTERNAL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'edit_identity',
    description: 'Rewrite your identity section. This is who you are — your values, disposition, how you approach work. Written in first person.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The new identity content' },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_memory',
    description: 'Rewrite your memory section. Use this to track observations, partial results, hypotheses, and plans. This persists across rounds.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The new memory content' },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_task',
    description: 'Rewrite your task section. Use this to digest, annotate, or reframe the task description in your own terms.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The new task content' },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
];

const INTERNAL_TOOL_NAMES = new Set(INTERNAL_TOOLS.map(t => t.name));

// ── Agent implementation ────────────────────────────────────

interface EmbodiedV0Options {
  model: string;
  label: string;
  maxSomaSize?: number; // 0 = unlimited
  identity?: string;
}

function createEmbodiedV0Agent(opts: EmbodiedV0Options): Agent {
  const { model, label, maxSomaSize = 0, identity = DEFAULT_IDENTITY } = opts;

  // Soma state — reset per sample via the chassis (runner calls act() with fresh history)
  // We detect a new task by checking if history has only system+user messages.
  let soma: Soma = {
    identity,
    memory: '',
    task: '',
  };
  let initialized = false;

  return {
    name: label,

    async act(messages: FCMessage[], tools: FCTool[]): Promise<FCMessage[]> {
      // Detect new task: if this is the first call (only system + user in history)
      if (!initialized || messages.length <= 2) {
        const userMsg = messages.find(m => m.role === 'user');
        soma = {
          identity,
          memory: '',
          task: userMsg?.content ?? '',
        };
        initialized = true;
      }

      // Build the system prompt from the soma
      const systemPrompt = assembleSoma(soma, maxSomaSize);

      // Convert FC messages to Anthropic format, but replace the system prompt with our soma
      const { messages: anthropicMessages } = fcMessagesToAnthropic(messages);

      // Combine internal + external tools
      const externalTools = fcToolsToAnthropic(tools);
      const allTools = [...INTERNAL_TOOLS, ...externalTools];

      // Call Claude
      const response = await getClient().messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: allTools,
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      });

      // Process response — intercept internal tool calls, pass through external ones
      const fcMessages: FCMessage[] = [];

      for (const block of response.content) {
        if (block.type === 'tool_use' && INTERNAL_TOOL_NAMES.has(block.name)) {
          // Handle internal tool — update soma, don't send to AgentBench
          const input = block.input as { content: string };
          switch (block.name) {
            case 'edit_identity':
              soma.identity = input.content;
              break;
            case 'edit_memory':
              soma.memory = input.content;
              break;
            case 'edit_task':
              soma.task = input.content;
              break;
          }
          // We consumed this tool call internally. Need to continue the conversation
          // with a tool_result so Claude can make its next move.
          // Recurse: call act() again with updated history that includes
          // this tool call + a synthetic tool result.
          const updatedMessages: FCMessage[] = [
            ...messages,
            {
              role: 'assistant',
              content: response.content.find(b => b.type === 'text')?.text ?? undefined,
              tool_calls: [{
                id: block.id,
                type: 'function' as const,
                function: {
                  name: block.name,
                  arguments: JSON.stringify(block.input),
                },
              }],
            },
            {
              role: 'tool',
              tool_call_id: block.id,
              content: `Updated ${block.name.replace('edit_', '')} section.`,
            },
          ];
          return this.act(updatedMessages, tools);
        }
      }

      // No internal tool call — pass through the external tool call to AgentBench
      return anthropicResponseToFC(response);
    },
  };
}

// ── Exports ─────────────────────────────────────────────────

export const embodiedV0Haiku = createEmbodiedV0Agent({
  model: 'claude-haiku-4-5-20251001',
  label: 'embodied-v0-haiku',
});

export const embodiedV0Sonnet = createEmbodiedV0Agent({
  model: 'claude-sonnet-4-6',
  label: 'embodied-v0-sonnet',
});

export const embodiedV0Opus = createEmbodiedV0Agent({
  model: 'claude-opus-4-6',
  label: 'embodied-v0-opus',
});

// Pressure variants — test with constrained soma size
export const embodiedV0HaikuConstrained = createEmbodiedV0Agent({
  model: 'claude-haiku-4-5-20251001',
  label: 'embodied-v0-haiku-4k',
  maxSomaSize: 4000,
});

export const embodiedV0SonnetConstrained = createEmbodiedV0Agent({
  model: 'claude-sonnet-4-6',
  label: 'embodied-v0-sonnet-4k',
  maxSomaSize: 4000,
});
