// Client persistence (v0): one IndexedDB record holding the whole save.
// Everything here is either the player's secret (the aura key), their signed
// claims, or maps of work done. The universe itself is never stored.
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes, signNameClaim, type NameClaim, type Spirit } from '@truenames/universe';
import type { WireSpirit } from '@truenames/meditation';
import { toWire, fromWire } from '@truenames/meditation';

export interface KnownSpirit {
  spirit: WireSpirit;
  source: 'lore' | 'scry' | 'shrine';
  foundAt: number;
  seen?: boolean;
}

export interface NameRecord {
  claim: NameClaim;
  strength: number;
}

export interface RunRecord {
  at: number;
  descent?: number;
  wave: number;
  won: boolean;
  kills: number;
  finds: number;
}

export interface ScryPlan {
  prefix: string;
  depth: number;
  running: boolean;
}

export interface SaveData {
  version: 1;
  aura: { secret: string; pub: string; element: number; createdAt: number } | null;
  spirits: Record<string, KnownSpirit>;
  names: Record<string, NameRecord>;
  /** `${prefix}|${depth}` -> contiguous scanned frontier (decimal) */
  scans: Record<string, string>;
  meditating: string[];
  scrying: ScryPlan[];
  loadout: (string | null)[];
  runs: RunRecord[];
  workers: number | null;
  /** Highest descent unlocked (0-based). */
  descent: number;
  lastDescent: number;
}

export function emptySave(): SaveData {
  return { version: 1, aura: null, spirits: {}, names: {}, scans: {}, meditating: [], scrying: [], loadout: [null, null, null, null, null, null], runs: [], workers: null, descent: 0, lastDescent: 0 };
}

const DB = 'truenames';
const STORE = 'kv';
const KEY = 'save';

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function loadSave(): Promise<SaveData> {
  try {
    const db = await openDb();
    const v = await new Promise<SaveData | undefined>((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result as SaveData | undefined);
      r.onerror = () => rej(r.error);
    });
    return v ? { ...emptySave(), ...v } : emptySave();
  } catch (e) {
    console.warn('[save] load failed, starting fresh', e);
    return emptySave();
  }
}

let pending: SaveData | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function writeSave(s: SaveData): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(JSON.parse(JSON.stringify(s)), KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** Debounced save (at most every 1.5s). */
export function persist(s: SaveData) {
  pending = s;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const p = pending;
    pending = null;
    if (p) writeSave(p).catch((e) => console.warn('[save] write failed', e));
  }, 1500);
}

export async function wipeSave() {
  const db = await openDb();
  await new Promise<void>((res) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => res();
  });
}

// ---------- aura ----------

export function newAura(element: number) {
  const sk = ed25519.utils.randomSecretKey();
  return { secret: bytesToHex(sk), pub: bytesToHex(ed25519.getPublicKey(sk)), element, createdAt: Date.now() };
}

export function signClaim(save: SaveData, cell: string, nonce: bigint): NameClaim {
  if (!save.aura) throw new Error('no aura');
  return signNameClaim(cell, nonce, hexToBytes(save.aura.secret));
}

// ---------- spirits ----------

export function rememberSpirit(save: SaveData, s: Spirit, source: KnownSpirit['source']): boolean {
  if (save.spirits[s.cell]) return false;
  save.spirits[s.cell] = { spirit: toWire(s), source, foundAt: Date.now() };
  return true;
}

export function spiritOf(save: SaveData, cell: string): Spirit | null {
  const k = save.spirits[cell];
  return k ? fromWire(k.spirit) : null;
}
