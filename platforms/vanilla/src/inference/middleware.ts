import { Request, Response, NextFunction } from 'express';
import { checkUserTokenLimit } from '../db/queries.js';

// Check if user has exceeded token limit
export async function checkTokenLimit(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const limitCheck = await checkUserTokenLimit(req.user.id);

    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: 'Token limit exceeded',
        used: limitCheck.used,
        limit: limitCheck.limit,
      });
    }

    // Attach usage info to request for logging
    (req as any).tokenUsage = limitCheck;
    next();
  } catch (error) {
    console.error('Token limit check error:', error);
    res.status(500).json({ error: 'Failed to check token limit' });
  }
}
