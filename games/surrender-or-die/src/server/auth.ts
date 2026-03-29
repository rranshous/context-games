// auth.ts — Simple token-based auth. No passwords.
// Login with a handle, get a token. Bring the token back and you're you.

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

const tokenToHandle = new Map<string, string>();
const handleToToken = new Map<string, string>();

export function login(handle: string): { token: string; handle: string } {
  if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
    throw new Error('Handle is required');
  }
  handle = handle.trim().slice(0, 32); // cap length

  // If handle already has a token, return it
  const existing = handleToToken.get(handle);
  if (existing) {
    return { token: existing, handle };
  }

  // New handle — generate token
  const token = randomUUID();
  tokenToHandle.set(token, handle);
  handleToToken.set(handle, token);
  console.log(`[Auth] "${handle}" logged in (token: ${token.slice(0, 8)}...)`);
  return { token, handle };
}

export function resolveToken(token: string): string | null {
  return tokenToHandle.get(token) ?? null;
}

// Express middleware: extracts handle from Authorization header
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header (use Bearer <token>)' });
    return;
  }
  const token = authHeader.slice(7);
  const handle = resolveToken(token);
  if (!handle) {
    res.status(401).json({ error: 'Invalid token — login first' });
    return;
  }
  (req as any).playerHandle = handle;
  next();
}

export function resetAuth(): void {
  tokenToHandle.clear();
  handleToToken.clear();
}
