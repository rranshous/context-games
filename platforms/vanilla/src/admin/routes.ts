import express, { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { getAllUsers, createUser, updateUser, getUserTotalTokens, getAllTokenUsage } from '../db/queries.js';

const router: Router = express.Router();

// All admin routes require admin access
router.use(requireAuth);
router.use(requireAdmin);

// Get all users
router.get('/api/users', async (req: Request, res: Response) => {
  try {
    const users = await getAllUsers();
    
    // Add token usage to each user
    const usersWithUsage = await Promise.all(
      users.map(async (user) => {
        const totalTokens = await getUserTotalTokens(user.id);
        return {
          id: user.id,
          username: user.username,
          is_admin: user.is_admin,
          is_active: user.is_active,
          token_limit: user.token_limit,
          total_tokens_used: totalTokens,
          created_at: user.created_at,
        };
      })
    );

    res.json({ users: usersWithUsage });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create new user
router.post('/api/users', async (req: Request, res: Response) => {
  try {
    const { username, password, isAdmin, tokenLimit } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await createUser(username, password, isAdmin || false);

    // Set token limit if provided
    if (tokenLimit !== undefined) {
      await updateUser(user.id, { token_limit: tokenLimit });
    }

    res.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (error: any) {
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

// Update user
router.put('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active, token_limit } = req.body;

    const updates: any = {};
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    if (token_limit !== undefined) updates.token_limit = token_limit;

    await updateUser(id, updates);

    res.json({ success: true });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Get system-wide usage stats
router.get('/api/usage', async (req: Request, res: Response) => {
  try {
    const usage = await getAllTokenUsage();

    // Calculate stats
    const byBackend: { [key: string]: number } = {};
    const byModel: { [key: string]: number } = {};
    let totalTokens = 0;

    usage.forEach((entry) => {
      totalTokens += entry.total_tokens;
      byBackend[entry.backend] = (byBackend[entry.backend] || 0) + entry.total_tokens;
      byModel[entry.model] = (byModel[entry.model] || 0) + entry.total_tokens;
    });

    res.json({
      total_tokens: totalTokens,
      by_backend: byBackend,
      by_model: byModel,
      recent_usage: usage.slice(0, 50), // Last 50 entries
    });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

export default router;
