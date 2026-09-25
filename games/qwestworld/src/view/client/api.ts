// api.ts — everything the viewer knows about the sim comes through here

import { MetaResponse, StateResponse, MAP_W, MAP_H, POS_SCALE } from '../../shared/types.js';

export interface Soldiers {
  tick: number;
  n: number;
  x: Uint16Array;
  y: Uint16Array;
  f: Uint8Array;
}

export class SimApi {
  constructor(public base: string) {}

  static async locate(): Promise<SimApi> {
    const q = new URLSearchParams(location.search).get('sim');
    if (q) return new SimApi(q.replace(/\/$/, ''));
    try {
      const cfg = await (await fetch('/config.json')).json();
      if (cfg.simUrl) return new SimApi(cfg.simUrl.replace(/\/$/, ''));
    } catch { /* viewer may be served statically */ }
    return new SimApi(`${location.protocol}//${location.hostname}:4200`);
  }

  async meta(): Promise<MetaResponse> {
    return (await fetch(`${this.base}/api/meta`)).json();
  }

  async terrain(): Promise<{ terrain: Uint8Array; height: Uint8Array }> {
    const buf = await (await fetch(`${this.base}/api/terrain.bin`)).arrayBuffer();
    const n = MAP_W * MAP_H;
    return { terrain: new Uint8Array(buf, 0, n), height: new Uint8Array(buf, n, n) };
  }

  async regions(): Promise<Uint16Array> {
    return new Uint16Array(await (await fetch(`${this.base}/api/regions.bin`)).arrayBuffer());
  }

  async state(): Promise<StateResponse> {
    return (await fetch(`${this.base}/api/state`)).json();
  }

  async soldiers(): Promise<Soldiers> {
    const buf = await (await fetch(`${this.base}/api/soldiers.bin`)).arrayBuffer();
    const dv = new DataView(buf);
    const tick = dv.getUint32(0, true), n = dv.getUint32(4, true);
    // Copy into aligned arrays (offset 8 + n*2 may be odd-aligned for n odd — it isn't, but be safe)
    const x = new Uint16Array(buf.slice(8, 8 + n * 2));
    const y = new Uint16Array(buf.slice(8 + n * 2, 8 + n * 4));
    const f = new Uint8Array(buf, 8 + n * 4, n);
    return { tick, n, x, y, f };
  }

  async control(action: 'pause' | 'resume'): Promise<{ paused: boolean }> {
    const res = await fetch(`${this.base}/api/control`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    });
    return res.json();
  }

  async health(): Promise<{ paused: boolean }> {
    return (await fetch(`${this.base}/api/health`)).json();
  }
}

export { POS_SCALE };
