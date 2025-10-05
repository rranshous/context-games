import { Request, Response, NextFunction } from 'express';
import { User } from '../db/queries.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      is_admin: number;
      is_active: number;
    }
  }
}

// Require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

// Require admin
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && req.user.is_admin) {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
}

// Check if user is active
export function requireActive(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && req.user.is_active) {
    return next();
  }
  res.status(403).json({ error: 'Account is deactivated' });
}
