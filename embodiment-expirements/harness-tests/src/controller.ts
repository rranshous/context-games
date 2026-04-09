/**
 * Client for the TALES HTTP bridge.
 */

import type { TalesState } from './types.js';

const DEFAULT_URL = 'http://localhost:5050';

export class TalesBridge {
  private url: string;

  constructor(url = DEFAULT_URL) {
    this.url = url;
  }

  /** List available environments. */
  async listEnvs(): Promise<string[]> {
    const resp = await fetch(`${this.url}/envs`);
    if (!resp.ok) throw new Error(`/envs failed: ${resp.status}`);
    const data = await resp.json();
    return data.environments;
  }

  /** Start or restart a game. */
  async reset(envName: string): Promise<TalesState> {
    const resp = await fetch(`${this.url}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env_name: envName }),
    });
    if (!resp.ok) throw new Error(`/reset failed: ${resp.status} ${await resp.text()}`);
    return resp.json();
  }

  /** Take an action in the current game. */
  async step(action: string): Promise<TalesState> {
    const resp = await fetch(`${this.url}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!resp.ok) throw new Error(`/step failed: ${resp.status} ${await resp.text()}`);
    return resp.json();
  }

  /** Get current game status. */
  async status(): Promise<TalesState> {
    const resp = await fetch(`${this.url}/status`);
    if (!resp.ok) throw new Error(`/status failed: ${resp.status}`);
    return resp.json();
  }
}
