import Anthropic from '@anthropic-ai/sdk';
import { Request, Response } from 'express';
import { logTokenUsage } from '../db/queries.js';

// Lazy initialization of Anthropic client
let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set in environment');
    }
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    console.log('✅ Anthropic client initialized');
  }
  return anthropic;
}

// Proxy messages to Anthropic API
export async function proxyAnthropicMessages(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const client = getAnthropicClient();
    const { messages, model = 'claude-3-5-sonnet-20241022', max_tokens = 1024, stream = false, ...otherParams } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    if (stream) {
      // Streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamResponse = await client.messages.stream({
        model,
        max_tokens,
        messages,
        ...otherParams,
      });

      let promptTokens = 0;
      let completionTokens = 0;

      streamResponse.on('message', (message) => {
        promptTokens = message.usage.input_tokens;
        completionTokens = message.usage.output_tokens;
      });

      streamResponse.on('text', (text) => {
        res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
      });

      streamResponse.on('end', async () => {
        // Log usage
        await logTokenUsage(req.user!.id, 'anthropic', model, promptTokens, completionTokens);
        res.write('data: [DONE]\n\n');
        res.end();
      });

      streamResponse.on('error', (error) => {
        console.error('Stream error:', error);
        res.end();
      });
    } else {
      // Non-streaming response
      const message = await client.messages.create({
        model,
        max_tokens,
        messages,
        ...otherParams,
      });

      // Log usage
      await logTokenUsage(
        req.user.id,
        'anthropic',
        model,
        message.usage.input_tokens,
        message.usage.output_tokens
      );

      res.json({
        id: message.id,
        model: message.model,
        role: message.role,
        content: message.content,
        stop_reason: message.stop_reason,
        usage: message.usage,
      });
    }
  } catch (error: any) {
    console.error('Anthropic API error:', error);
    res.status(500).json({
      error: 'Inference failed',
      message: error.message || 'Unknown error',
    });
  }
}
