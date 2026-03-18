/**
 * Persistence — read/write StateStore to disk.
 *
 * Simple JSON file. Read on boot, write after state changes.
 * The chassis calls save/load. Nothing else touches disk.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { StateStore } from './statestore.js';

const DEFAULT_PATH = 'data/habitat.json';

export class Persistence {
  private path: string;
  private dirty = false;
  private saving = false;

  constructor(path = DEFAULT_PATH) {
    this.path = path;
  }

  /** Load store from disk. Returns a new StateStore (empty if no file exists). */
  async load(): Promise<StateStore> {
    try {
      const raw = await readFile(this.path, 'utf-8');
      const json = JSON.parse(raw);
      const store = StateStore.fromJSON(json);
      console.log(`[persistence] loaded from ${this.path}`);
      return store;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[persistence] no state file found, starting fresh`);
        return new StateStore();
      }
      throw err;
    }
  }

  /** Mark that state has changed and needs saving. */
  markDirty(): void {
    this.dirty = true;
  }

  /** Save store to disk if dirty. Coalesces rapid writes. */
  async save(store: StateStore): Promise<void> {
    if (!this.dirty || this.saving) return;
    this.dirty = false;
    this.saving = true;
    try {
      await mkdir(dirname(this.path), { recursive: true });
      const json = JSON.stringify(store.toJSON(), null, 2);
      await writeFile(this.path, json, 'utf-8');
    } catch (err) {
      console.error(`[persistence] save failed:`, err);
      this.dirty = true; // retry next time
    } finally {
      this.saving = false;
    }
  }
}
