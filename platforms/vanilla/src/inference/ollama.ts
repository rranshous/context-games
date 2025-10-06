import { Ollama } from 'ollama';
import { Request, Response } from 'express';
import { logTokenUsage } from '../db/queries.js';

// Lazy initialization of Ollama client
let ollama: Ollama | null = null;

function getOllamaClient(): Ollama {
  if (!ollama) {
    const url = process.env.OLLAMA_URL || 'http://localhost:11434';
    ollama = new Ollama({ host: url });
    console.log(`✅ Ollama client initialized (${url})`);
  }
  return ollama;
}

// Estimate tokens (rough approximation: ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Proxy chat to Ollama
export async function proxyOllamaChat(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const client = getOllamaClient();
    const { messages, model = 'llama3.2', stream = false, ...otherParams } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    // Estimate prompt tokens
    const promptText = messages.map((m: any) => m.content || '').join(' ');
    const promptTokens = estimateTokens(promptText);

    if (stream) {
      // Streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let completionText = '';

      const response = await client.chat({
        model,
        messages,
        stream: true,
        ...otherParams,
      });

      for await (const part of response) {
        if (part.message?.content) {
          completionText += part.message.content;
          res.write(`data: ${JSON.stringify({ type: 'text', text: part.message.content })}\n\n`);
        }
      }

      // Log usage
      const completionTokens = estimateTokens(completionText);
      await logTokenUsage(req.user.id, 'ollama', model, promptTokens, completionTokens);

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      const response = await client.chat({
        model,
        messages,
        stream: false,
        ...otherParams,
      }) as any; // Type assertion needed for non-stream response

      const completionText = response.message.content || '';
      const completionTokens = estimateTokens(completionText);

      // Log usage
      await logTokenUsage(req.user.id, 'ollama', model, promptTokens, completionTokens);

      res.json({
        model: response.model,
        message: response.message,
        done: response.done,
        total_duration: response.total_duration,
        load_duration: response.load_duration,
        prompt_eval_count: response.prompt_eval_count,
        eval_count: response.eval_count,
        estimated_tokens: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      });
    }
  } catch (error: any) {
    console.error('Ollama API error:', error);
    res.status(500).json({
      error: 'Inference failed',
      message: error.message || 'Unknown error',
    });
  }
}

// List available models
export async function listOllamaModels(req: Request, res: Response) {
  try {
    const client = getOllamaClient();
    const models = await client.list();
    res.json({ models: models.models });
  } catch (error: any) {
    console.error('Ollama list error:', error);
    res.status(500).json({
      error: 'Failed to list models',
      message: error.message || 'Unknown error',
    });
  }
}
