import express, { Router, Request, Response, NextFunction } from 'express';
import passport from './passport.js';
import { createUser, getUserByUsername } from '../db/queries.js';

const router: Router = express.Router();

// Login
router.post('/login', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('local', (err: any, user: Express.User, info: any) => {
    if (err) {
      return res.status(500).json({ error: 'Authentication error' });
    }
    if (!user) {
      return res.status(401).json({ error: info.message || 'Login failed' });
    }
    req.logIn(user, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Login error' });
      }
      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          is_admin: user.is_admin
        }
      });
    });
  })(req, res, next);
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout error' });
    }
    res.json({ success: true });
  });
});

// Get current user
router.get('/me', (req: Request, res: Response) => {
  if (req.isAuthenticated() && req.user) {
    return res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        is_admin: req.user.is_admin
      }
    });
  }
  res.status(401).json({ error: 'Not authenticated' });
});

// Register (admin only - will add middleware later)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, isAdmin } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Check if user exists
    const existing = await getUserByUsername(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Create user
    const user = await createUser(username, password, isAdmin || false);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

export default router;
