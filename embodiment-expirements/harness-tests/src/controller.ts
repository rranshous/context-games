/**
 * Client for the AgentRL controller REST API.
 */

import type { StartSampleResponse, InteractResponse, FCMessage } from './types.js';

const DEFAULT_URL = 'http://localhost:5020/api';

export class Controller {
  private url: string;

  constructor(url = DEFAULT_URL) {
    this.url = url;
  }

  /** List registered task workers and their status. */
  async listWorkers(): Promise<Record<string, unknown>> {
    const resp = await fetch(`${this.url}/list_workers`);
    if (!resp.ok) throw new Error(`list_workers failed: ${resp.status}`);
    return resp.json();
  }

  /** Get available sample indices for a task. */
  async getIndices(task: string): Promise<number[]> {
    const resp = await fetch(`${this.url}/get_indices?name=${task}`);
    if (!resp.ok) throw new Error(`get_indices failed: ${resp.status}`);
    return resp.json();
  }

  /** Start a new task sample. Returns session ID + initial messages/tools. */
  async startSample(task: string, index: number): Promise<{ sessionId: string; data: StartSampleResponse }> {
    const resp = await fetch(`${this.url}/start_sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: task, index }),
    });
    if (!resp.ok) throw new Error(`start_sample failed: ${resp.status} ${await resp.text()}`);
    const sessionId = resp.headers.get('Session_id');
    if (!sessionId) throw new Error('No Session_id header in start_sample response');
    const data: StartSampleResponse = await resp.json();
    return { sessionId, data };
  }

  /** Send agent response, get task feedback. */
  async interact(sessionId: string, messages: FCMessage[]): Promise<InteractResponse> {
    const resp = await fetch(`${this.url}/interact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Session_id': sessionId,
      },
      body: JSON.stringify({ messages }),
    });
    if (!resp.ok) throw new Error(`interact failed: ${resp.status} ${await resp.text()}`);
    return resp.json();
  }
}
