import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { dbRun, dbGet, dbAll } from './schema.js';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  is_admin: number;
  is_active: number;
  token_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface TokenUsage {
  id: string;
  user_id: string;
  timestamp: string;
  backend: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// User queries
export async function createUser(username: string, password: string, isAdmin: boolean = false): Promise<User> {
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  await dbRun(
    `INSERT INTO users (id, username, password_hash, is_admin, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [id, username, passwordHash, isAdmin ? 1 : 0, now, now]
  );

  return getUserById(id) as Promise<User>;
}

export async function getUserById(id: string): Promise<User | undefined> {
  return dbGet('SELECT * FROM users WHERE id = ?', [id]) as Promise<User | undefined>;
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  return dbGet('SELECT * FROM users WHERE username = ?', [username]) as Promise<User | undefined>;
}

export async function getAllUsers(): Promise<User[]> {
  return dbAll('SELECT * FROM users ORDER BY created_at DESC') as Promise<User[]>;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<void> {
  const fields = Object.keys(updates).filter(k => k !== 'id');
  const values = fields.map(k => (updates as any)[k]);
  
  if (fields.length === 0) return;
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  await dbRun(
    `UPDATE users SET ${setClause}, updated_at = ? WHERE id = ?`,
    [...values, new Date().toISOString(), id]
  );
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

// Token usage queries
export async function logTokenUsage(
  userId: string,
  backend: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): Promise<void> {
  const id = uuidv4();
  const totalTokens = promptTokens + completionTokens;
  const timestamp = new Date().toISOString();

  await dbRun(
    `INSERT INTO token_usage (id, user_id, timestamp, backend, model, prompt_tokens, completion_tokens, total_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, timestamp, backend, model, promptTokens, completionTokens, totalTokens]
  );
}

export async function getUserTokenUsage(userId: string): Promise<TokenUsage[]> {
  return dbAll(
    'SELECT * FROM token_usage WHERE user_id = ? ORDER BY timestamp DESC',
    [userId]
  ) as Promise<TokenUsage[]>;
}

export async function getUserTotalTokens(userId: string): Promise<number> {
  const result = await dbGet(
    'SELECT SUM(total_tokens) as total FROM token_usage WHERE user_id = ?',
    [userId]
  ) as { total: number | null };
  return result?.total || 0;
}

export async function checkUserTokenLimit(userId: string): Promise<{ allowed: boolean; used: number; limit: number | null }> {
  const user = await getUserById(userId);
  if (!user) {
    return { allowed: false, used: 0, limit: null };
  }

  const used = await getUserTotalTokens(userId);
  const limit = user.token_limit;

  if (limit === null) {
    // No limit set
    return { allowed: true, used, limit: null };
  }

  return { allowed: used < limit, used, limit };
}

export async function getAllTokenUsage(): Promise<TokenUsage[]> {
  return dbAll('SELECT * FROM token_usage ORDER BY timestamp DESC LIMIT 1000') as Promise<TokenUsage[]>;
}
