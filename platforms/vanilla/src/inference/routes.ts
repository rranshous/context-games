import express, { Router } from 'express';
import { requireAuth, requireActive } from '../auth/middleware.js';
import { checkTokenLimit } from './middleware.js';
import { proxyAnthropicMessages } from './anthropic.js';
import { proxyOllamaChat, listOllamaModels } from './ollama.js';
import { getUserTokenUsage, getUserTotalTokens } from '../db/queries.js';

const router: Router = express.Router();

// All inference routes require auth and active account
router.use(requireAuth);
router.use(requireActive);

// Anthropic routes
router.post('/anthropic/messages', checkTokenLimit, proxyAnthropicMessages);

// Ollama routes
router.post('/ollama/chat', checkTokenLimit, proxyOllamaChat);
router.get('/ollama/models', listOllamaModels);

// Get current user's token usage
router.get('/usage', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const usage = await getUserTokenUsage(req.user.id);
    const total = await getUserTotalTokens(req.user.id);

    res.json({
      total_tokens: total,
      usage_history: usage.slice(0, 100), // Last 100 entries
    });
  } catch (error) {
    console.error('Usage query error:', error);
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

// Get usage statistics
router.get('/usage/stats', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const usage = await getUserTokenUsage(req.user.id);
    const total = await getUserTotalTokens(req.user.id);

    // Calculate stats
    const byBackend: { [key: string]: number } = {};
    const byModel: { [key: string]: number } = {};

    usage.forEach((entry) => {
      byBackend[entry.backend] = (byBackend[entry.backend] || 0) + entry.total_tokens;
      byModel[entry.model] = (byModel[entry.model] || 0) + entry.total_tokens;
    });

    res.json({
      total_tokens: total,
      by_backend: byBackend,
      by_model: byModel,
      entry_count: usage.length,
    });
  } catch (error) {
    console.error('Stats query error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
