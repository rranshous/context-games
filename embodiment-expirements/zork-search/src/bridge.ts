/**
 * TALES HTTP bridge client. Reused from harness-tests.
 */

import type { TalesState } from './types.js';

const DEFAULT_URL = 'http://localhost:5050';

export class TalesBridge {
  private url: string;

  constructor(url = DEFAULT_URL) {
    this.url = url;
  }

  async listEnvs(): Promise<string[]> {
    const resp = await fetch(`${this.url}/envs`);
    if (!resp.ok) throw new Error(`/envs failed: ${resp.status}`);
    const data = await resp.json();
    return data.environments;
  }

  async reset(envName: string): Promise<TalesState> {
    const resp = await fetch(`${this.url}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env_name: envName }),
    });
    if (!resp.ok) throw new Error(`/reset failed: ${resp.status} ${await resp.text()}`);
    return resp.json();
  }

  async step(action: string): Promise<TalesState> {
    const resp = await fetch(`${this.url}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!resp.ok) throw new Error(`/step failed: ${resp.status} ${await resp.text()}`);
    return resp.json();
  }

  async status(): Promise<TalesState> {
    const resp = await fetch(`${this.url}/status`);
    if (!resp.ok) throw new Error(`/status failed: ${resp.status}`);
    return resp.json();
  }
}
