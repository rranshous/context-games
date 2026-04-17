import OpenAI from 'openai';
import { Request, Response } from 'express';
import { logTokenUsage } from '../db/queries.js';

// Lazy initialization of OpenRouter client (OpenAI-compatible)
let openrouter: OpenAI | null = null;

function getOpenRouterClient(): OpenAI {
  if (!openrouter) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set in environment');
    }
    openrouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://vanilla-game-platform.local',
        'X-Title': 'Vanilla Game Platform',
      },
    });
    console.log('✅ OpenRouter client initialized');
  }
  return openrouter;
}

// Proxy chat completions to OpenRouter API
export async function proxyOpenRouterMessages(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const client = getOpenRouterClient();
    const { messages, model = 'openai/gpt-4o-mini', max_tokens, stream = false, ...otherParams } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    const baseParams: Record<string, any> = {
      model,
      messages,
      ...otherParams,
    };
    if (max_tokens !== undefined) {
      baseParams.max_tokens = max_tokens;
    }

    if (stream) {
      // Streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamResponse = await client.chat.completions.create({
        ...baseParams,
        model,
        messages,
        stream: true,
      } as OpenAI.ChatCompletionCreateParamsStreaming);

      let completionText = '';

      for await (const chunk of streamResponse) {
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          completionText += delta.content;
          res.write(`data: ${JSON.stringify({ type: 'text', text: delta.content })}\n\n`);
        }
        // Also forward tool call chunks if present
        if (delta?.tool_calls) {
          res.write(`data: ${JSON.stringify({ type: 'tool_calls', tool_calls: delta.tool_calls })}\n\n`);
        }
      }

      // Estimate tokens for streaming (OpenRouter doesn't always return usage in stream)
      const promptText = messages.map((m: any) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      ).join(' ');
      const promptTokens = Math.ceil(promptText.length / 4);
      const completionTokens = Math.ceil(completionText.length / 4);

      await logTokenUsage(req.user!.id, 'openrouter', model, promptTokens, completionTokens);

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      const response = await client.chat.completions.create({
        ...baseParams,
        model,
        messages,
      } as OpenAI.ChatCompletionCreateParamsNonStreaming);

      // Log usage - OpenRouter returns usage in OpenAI format
      const promptTokens = response.usage?.prompt_tokens ?? 0;
      const completionTokens = response.usage?.completion_tokens ?? 0;

      await logTokenUsage(
        req.user.id,
        'openrouter',
        model,
        promptTokens,
        completionTokens
      );

      // Return the full OpenAI-format response
      res.json(response);
    }
  } catch (error: any) {
    console.error('OpenRouter API error:', error);
    res.status(500).json({
      error: 'Inference failed',
      message: error.message || 'Unknown error',
    });
  }
}
