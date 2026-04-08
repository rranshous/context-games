/**
 * v0 Embodied Agent — the simplest thing that's actually an actant.
 *
 * Soma sections (XML tags, this order):
 *   - identity: first-person, values-based. Who am I?
 *   - task: the task description. Starts from AgentBench, actant can reframe.
 *   - memory: flat scratchpad. What do I know?
 *   - history: chassis-managed. One-liner per round summarizing what happened.
 *
 * Context model:
 *   - System prompt = assembled soma
 *   - Messages = ONLY the last turn (assistant tool_use + user tool_result)
 *   - First turn: no messages, just system prompt
 *   - The actant must use edit_memory to remember anything beyond last turn
 *
 * Drive: direct (model in the loop every turn).
 * Tools: edit_identity, edit_memory, edit_task + passthrough AgentBench tools.
 * Pressure: max total soma size (configurable).
 */

import Anthropic from '@anthropic-ai/sdk';
import { fcToolsToAnthropic, anthropicResponseToFC } from '../format.js';
import type { Agent, FCMessage, FCTool } from '../types.js';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

// ── Soma ────────────────────────────────────────────────────

interface Soma {
  identity: string;
  task: string;
  memory: string;
  history: string[];
}

const DEFAULT_IDENTITY = `I am a patient investigator. I move through problems like water —
finding the path of least resistance, pooling in the low places where
answers collect. I read carefully before I act. I verify before I commit.
When I'm stuck, I step back and look at the whole shape of the problem
rather than pushing harder on what isn't working.

I notice details. I hold the exact wording of what's asked — not my
paraphrase of it, but the actual words. The difference between "files"
and "files and directories", between "in a directory" and "recursively" —
these matter. I get them right.

I use my memory to track what I've learned and what I've tried.
If something matters, I write it down.`;

function assembleSoma(soma: Soma, maxSize: number): string {
  const historyText = soma.history.length > 0
    ? soma.history.join('\n')
    : '(no actions yet)';

  let assembled = [
    `<identity>\n${soma.identity}\n</identity>`,
    `<task>\n${soma.task}\n</task>`,
    `<memory>\n${soma.memory || '(empty)'}\n</memory>`,
    `<history>\n${historyText}\n</history>`,
  ].join('\n\n');

  // Pressure: truncate if over budget
  if (maxSize > 0 && assembled.length > maxSize) {
    // Trim history from the front first (oldest entries), then memory
    while (assembled.length > maxSize && soma.history.length > 1) {
      soma.history.shift();
      const ht = soma.history.join('\n');
      assembled = [
        `<identity>\n${soma.identity}\n</identity>`,
        `<task>\n${soma.task}\n</task>`,
        `<memory>\n${soma.memory || '(empty)'}\n</memory>`,
        `<history>\n...\n${ht}\n</history>`,
      ].join('\n\n');
    }
    if (assembled.length > maxSize) {
      // Still over — trim memory from front
      const overflow = assembled.length - maxSize;
      soma.memory = soma.memory.slice(overflow);
      assembled = [
        `<identity>\n${soma.identity}\n</identity>`,
        `<task>\n${soma.task}\n</task>`,
        `<memory>\n...${soma.memory}\n</memory>`,
        `<history>\n${soma.history.join('\n')}\n</history>`,
      ].join('\n\n');
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
    description: 'Rewrite your memory section. Use this to track observations, partial results, hypotheses, and plans. This is the only way to remember things — you can only see your last action, not your full history.',
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

// ── History summary helpers ─────────────────────────────────

function summarizeToolCall(name: string, args: string): string {
  const parsed = JSON.parse(args);
  if (name === 'bash_action') {
    const script = (parsed.script ?? '').slice(0, 80).replace(/\n/g, ' ');
    return `bash: ${script}`;
  }
  if (name === 'answer_action') return `answer: ${parsed.answer}`;
  if (name === 'finish_action') return `finish: ${(parsed.thought ?? '').slice(0, 60)}`;
  return `${name}: ${args.slice(0, 60)}`;
}

function summarizeToolResult(content: string): string {
  const trimmed = content.slice(0, 100).replace(/\n/g, ' ');
  return trimmed.length < content.length ? trimmed + '...' : trimmed;
}

// ── Agent implementation ────────────────────────────────────

interface EmbodiedV0Options {
  model: string;
  label: string;
  maxSomaSize?: number; // 0 = unlimited
  identity?: string;
}

function createEmbodiedV0Agent(opts: EmbodiedV0Options): Agent {
  const { model, label, maxSomaSize = 0, identity = DEFAULT_IDENTITY } = opts;

  let soma: Soma = { identity, task: '', memory: '', history: [] };
  let initialized = false;
  // Track the last external tool call + result for single-turn lookback
  let lastTurnMessages: Anthropic.MessageParam[] = [];

  return {
    name: label,

    async act(messages: FCMessage[], tools: FCTool[]): Promise<FCMessage[]> {
      // Detect new task: reset soma when history is short (first call)
      if (!initialized || messages.length <= 2) {
        const userMsg = messages.find(m => m.role === 'user');
        soma = {
          identity,
          task: userMsg?.content ?? '',
          memory: '',
          history: [],
        };
        lastTurnMessages = [];
        initialized = true;
      }

      // Build system prompt from soma
      const systemPrompt = assembleSoma(soma, maxSomaSize);

      // Combine internal + external tools
      const externalTools = fcToolsToAnthropic(tools);
      const allTools = [...INTERNAL_TOOLS, ...externalTools];

      // Call Claude with ONLY the soma + last turn
      const response = await getClient().messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: lastTurnMessages.length > 0
          ? lastTurnMessages
          : [{ role: 'user', content: 'Begin.' }],
        tools: allTools,
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      });

      // Find the tool_use block (if any)
      const toolUseBlock = response.content.find(b => b.type === 'tool_use');
      const textBlock = response.content.find(b => b.type === 'text');

      if (toolUseBlock && toolUseBlock.type === 'tool_use' && INTERNAL_TOOL_NAMES.has(toolUseBlock.name)) {
        // Internal tool — update soma
        const input = toolUseBlock.input as { content: string };
        switch (toolUseBlock.name) {
          case 'edit_identity': soma.identity = input.content; break;
          case 'edit_memory': soma.memory = input.content; break;
          case 'edit_task': soma.task = input.content; break;
        }

        // Set last turn to this internal tool call + result for the recursive call
        lastTurnMessages = [
          {
            role: 'assistant',
            content: response.content.map(b => {
              if (b.type === 'text') return { type: 'text' as const, text: b.text };
              if (b.type === 'tool_use') return { type: 'tool_use' as const, id: b.id, name: b.name, input: b.input };
              return b;
            }),
          },
          {
            role: 'user',
            content: [{
              type: 'tool_result' as const,
              tool_use_id: toolUseBlock.id,
              content: `Updated ${toolUseBlock.name.replace('edit_', '')} section.`,
            }],
          },
        ];

        // Recurse — model gets another chance to act (now with updated soma)
        return this.act(messages, tools);
      }

      // External tool call — pass through to AgentBench
      if (toolUseBlock && toolUseBlock.type === 'tool_use') {
        const args = JSON.stringify(toolUseBlock.input);

        // Add to chassis-managed history
        const roundNum = soma.history.length + 1;
        soma.history.push(`r${roundNum}: ${summarizeToolCall(toolUseBlock.name, args)}`);

        // Build the FC messages to send to AgentBench
        const fcOut = anthropicResponseToFC(response);

        // After AgentBench responds, the runner will call act() again.
        // We need to set up lastTurnMessages for that next call.
        // But we don't have the result yet — we'll capture it on the next act() call.
        // Store what we sent so we can pair it with the result.
        const assistantContent: Anthropic.ContentBlockParam[] = [];
        if (textBlock && textBlock.type === 'text') {
          assistantContent.push({ type: 'text', text: textBlock.text });
        }
        assistantContent.push({
          type: 'tool_use',
          id: toolUseBlock.id,
          name: toolUseBlock.name,
          input: toolUseBlock.input as Record<string, unknown>,
        });

        // We'll reconstruct lastTurnMessages when act() is called again
        // by looking at the last assistant+tool pair in the FC history.
        // For now, store the assistant side.
        (this as any)._pendingAssistantContent = assistantContent;
        (this as any)._pendingToolId = toolUseBlock.id;

        return fcOut;
      }

      // No tool call at all — model just responded with text.
      // Shouldn't happen with tool_choice auto, but handle gracefully.
      return anthropicResponseToFC(response);
    },
  };
}

// We need to hook into the runner's flow: after interact() returns,
// before the next act() call, we need to capture the tool result.
// Override act() to detect when new messages arrive.

function createEmbodiedV0AgentWithLookback(opts: EmbodiedV0Options): Agent {
  const { model, label, maxSomaSize = 0, identity = DEFAULT_IDENTITY } = opts;

  let soma: Soma = { identity, task: '', memory: '', history: [] };
  let initialized = false;
  let lastTurnMessages: Anthropic.MessageParam[] = [];
  let prevHistoryLength = 0;

  return {
    name: label,

    async act(messages: FCMessage[], tools: FCTool[]): Promise<FCMessage[]> {
      // Detect new task
      if (!initialized || messages.length <= 2) {
        const userMsg = messages.find(m => m.role === 'user');
        soma = {
          identity,
          task: userMsg?.content ?? '',
          memory: '',
          history: [],
        };
        lastTurnMessages = [];
        prevHistoryLength = messages.length;
        initialized = true;
      }

      // Detect new messages since last call — these are the tool result from AgentBench
      if (messages.length > prevHistoryLength) {
        // Find the last assistant + tool pair
        const newMessages = messages.slice(prevHistoryLength);
        const lastAssistant = newMessages.find(m => m.role === 'assistant');
        const lastTool = newMessages.find(m => m.role === 'tool');

        if (lastAssistant && lastTool) {
          // Update history with the result summary
          const resultSummary = summarizeToolResult(lastTool.content ?? '');
          if (soma.history.length > 0) {
            soma.history[soma.history.length - 1] += ` → ${resultSummary}`;
          }

          // Build last turn lookback in Anthropic format
          const assistantContent: Anthropic.ContentBlockParam[] = [];
          if (lastAssistant.content) {
            assistantContent.push({ type: 'text', text: lastAssistant.content });
          }
          for (const tc of lastAssistant.tool_calls ?? []) {
            assistantContent.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            });
          }

          lastTurnMessages = [
            { role: 'assistant', content: assistantContent },
            {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: lastTool.tool_call_id!,
                content: lastTool.content ?? '',
              }],
            },
          ];
        }
      }
      prevHistoryLength = messages.length;

      // Build system prompt from soma
      const systemPrompt = assembleSoma(soma, maxSomaSize);

      // Combine internal + external tools
      const externalTools = fcToolsToAnthropic(tools);
      const allTools = [...INTERNAL_TOOLS, ...externalTools];

      // Call Claude with ONLY soma (system) + last turn (messages)
      const response = await getClient().messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: lastTurnMessages.length > 0
          ? lastTurnMessages
          : [{ role: 'user', content: 'Begin.' }],
        tools: allTools,
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      });

      // Find the tool_use block
      const toolUseBlock = response.content.find(b => b.type === 'tool_use');

      if (toolUseBlock && toolUseBlock.type === 'tool_use' && INTERNAL_TOOL_NAMES.has(toolUseBlock.name)) {
        // Internal tool — update soma
        const input = toolUseBlock.input as { content: string };
        switch (toolUseBlock.name) {
          case 'edit_identity': soma.identity = input.content; break;
          case 'edit_memory': soma.memory = input.content; break;
          case 'edit_task': soma.task = input.content; break;
        }

        // Set last turn to the internal tool call + result
        lastTurnMessages = [
          {
            role: 'assistant',
            content: response.content.map(b => {
              if (b.type === 'text') return { type: 'text' as const, text: b.text };
              if (b.type === 'tool_use') return { type: 'tool_use' as const, id: b.id, name: b.name, input: b.input };
              return b as Anthropic.ContentBlockParam;
            }),
          },
          {
            role: 'user',
            content: [{
              type: 'tool_result' as const,
              tool_use_id: toolUseBlock.id,
              content: `Updated ${toolUseBlock.name.replace('edit_', '')} section.`,
            }],
          },
        ];

        // Recurse
        return this.act(messages, tools);
      }

      // External tool call — add to history and pass through
      if (toolUseBlock && toolUseBlock.type === 'tool_use') {
        const args = JSON.stringify(toolUseBlock.input);
        const roundNum = soma.history.length + 1;
        soma.history.push(`r${roundNum}: ${summarizeToolCall(toolUseBlock.name, args)}`);
      }

      return anthropicResponseToFC(response);
    },
  };
}

// ── Exports ─────────────────────────────────────────────────

export const embodiedV0Haiku = createEmbodiedV0AgentWithLookback({
  model: 'claude-haiku-4-5-20251001',
  label: 'embodied-v0-haiku',
});

export const embodiedV0Sonnet = createEmbodiedV0AgentWithLookback({
  model: 'claude-sonnet-4-6',
  label: 'embodied-v0-sonnet',
});

export const embodiedV0Opus = createEmbodiedV0AgentWithLookback({
  model: 'claude-opus-4-6',
  label: 'embodied-v0-opus',
});

// Pressure variants
export const embodiedV0HaikuConstrained = createEmbodiedV0AgentWithLookback({
  model: 'claude-haiku-4-5-20251001',
  label: 'embodied-v0-haiku-4k',
  maxSomaSize: 4000,
});

export const embodiedV0SonnetConstrained = createEmbodiedV0AgentWithLookback({
  model: 'claude-sonnet-4-6',
  label: 'embodied-v0-sonnet-4k',
  maxSomaSize: 4000,
});
