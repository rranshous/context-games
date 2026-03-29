// api.ts — Fetch wrapper for all server API calls

import type { GameState, UnitType, Side } from '../shared/types.js';

export class SodAPI {
  private baseUrl: string;
  private token: string = '';

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async login(handle: string): Promise<{ token: string; handle: string }> {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    this.token = data.token;
    return data;
  }

  async listGames(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/games`);
    return res.json();
  }

  async createGame(side: Side = 'left'): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ side }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async joinGame(gameId: string): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/join`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async getState(gameId: string, sinceTick?: number): Promise<GameState | null> {
    const url = `${this.baseUrl}/api/games/${gameId}/state` +
      (sinceTick != null ? `?since=${sinceTick}` : '');
    const res = await fetch(url, { headers: this.authHeaders() });
    if (res.status === 304) return null;
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async train(gameId: string, unitType: UnitType): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/train`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ unitType }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async trainBatch(gameId: string, unitTypes: UnitType[]): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/train-batch`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ unitTypes }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async moveUnits(gameId: string, unitIds: number[], x: number, y: number): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/move`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ unitIds, x, y }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async attackMove(gameId: string, unitIds: number[], x: number, y: number): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/attack-move`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ unitIds, x, y }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async attackTarget(gameId: string, unitIds: number[], targetId: number): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/attack`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ unitIds, targetId }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async surrender(gameId: string): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/surrender`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async mineGold(gameId: string, unitIds: number[], mineId: number): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/mine`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ unitIds, mineId }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async useAbility(gameId: string, unitId: number, targetX?: number, targetY?: number): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/ability`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ unitId, targetX, targetY }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async research(gameId: string, upgradeId: string): Promise<GameState> {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/research`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ upgradeId }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async getLeaderboard(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/leaderboard`);
    return res.json();
  }
}
